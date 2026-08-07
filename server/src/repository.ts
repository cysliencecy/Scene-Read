import {
  books as mockBooks,
  chapters as mockChapters,
  generationTasks as mockGenerationTasks,
  sceneImages as mockSceneImages,
} from './mockData.js';
import { isSupabaseConfigured, supabase, type Database, type Json } from './supabaseClient.js';
import type { Book, Chapter, ChapterBlock, GenerationTask, SceneImage, SceneCandidate, VisualStyle } from './types.js';

type BookInput = Partial<Book> & Pick<Book, 'title' | 'currentChapterId'>;
type ChapterInput = Partial<Chapter> & Pick<Chapter, 'bookId' | 'title'>;
type BookImportInput = {
  book: BookInput;
  chapters: ChapterInput[];
};
type GenerationTaskInput = Partial<GenerationTask> & Pick<GenerationTask, 'chapterId'>;
type SceneImageInput = Partial<SceneImage> &
  Pick<SceneImage, 'chapterId' | 'prompt'> & {
    imageBase64?: string;
    mimeType?: string;
  };
type SceneCandidateInput = Partial<SceneCandidate> &
  Pick<SceneCandidate, 'taskId' | 'chapterId' | 'sourceBlockId' | 'sourceText' | 'promptDraft'>;

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type BookRow = Database['public']['Tables']['books']['Row'];

const getPublicStorageUrl = (bucket: string, path: string | null | undefined): string | undefined => {
  if (!path || !supabase) return undefined;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

const toBook = (row: BookRow): Book => ({
  id: row.id,
  title: row.title,
  progress: row.progress,
  accent: row.accent,
  currentChapterId: row.current_chapter_id,
  lastReadLabel: row.last_read_label,
  visualStyle: row.visual_style === null ? undefined : (row.visual_style as VisualStyle),
  authors: row.authors,
  languages: row.languages,
  coverUrl: getPublicStorageUrl('book-covers', row.cover_path),
  source: row.source === 'gutenberg' ? row.source : undefined,
  sourceBookId: row.source_book_id ?? undefined,
  sourceUrl: row.source_url ?? undefined,
  copyrightStatus: row.copyright_status ?? undefined,
});

const toChapter = (row: {
  id: string;
  book_id: string;
  title: string;
  progress: number;
  blocks: unknown;
}): Chapter => ({
  id: row.id,
  bookId: row.book_id,
  title: row.title,
  progress: row.progress,
  blocks: Array.isArray(row.blocks) ? (row.blocks as ChapterBlock[]) : [],
});

const toGenerationTask = (row: {
  id: string;
  book_id?: string | null;
  chapter_id: string;
  progress: number;
  status: 'queued' | 'recognizing' | 'generating' | 'completed' | 'failed';
  task_type?: 'scene_image' | null;
  label: string;
  error_message?: string | null;
  provider?: string | null;
  duration_ms?: number | null;
}): GenerationTask => ({
  id: row.id,
  bookId: row.book_id ?? undefined,
  chapterId: row.chapter_id,
  progress: row.progress,
  status: row.status,
  taskType: row.task_type ?? 'scene_image',
  label: row.label,
  errorMessage: row.error_message ?? undefined,
  provider: row.provider ?? undefined,
  durationMs: row.duration_ms ?? undefined,
});

const getPublicSceneImageUrl = (imagePath: string | null | undefined): string | undefined => {
  if (!imagePath) return undefined;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
    return imagePath;
  }
  if (!supabase) return undefined;
  return supabase.storage.from('scene-images').getPublicUrl(imagePath).data.publicUrl;
};

const toSceneImage = (row: {
  id: string;
  chapter_id: string;
  source_block_id?: string | null;
  position?: number | null;
  image_type?: 'scene' | 'character' | 'object' | null;
  variant: 'street' | 'office';
  prompt: string;
  image_path: string | null;
}): SceneImage => ({
  id: row.id,
  chapterId: row.chapter_id,
  sourceBlockId: row.source_block_id ?? undefined,
  position: row.position ?? undefined,
  imageType: row.image_type ?? undefined,
  variant: row.variant,
  prompt: row.prompt,
  imagePath: row.image_path ?? undefined,
  imageUrl: getPublicSceneImageUrl(row.image_path),
});

const isMissingSceneCandidateTableError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205' || message.includes('scene_candidates');
};

const isCandidateSelectedInRawResponse = (candidateId: string, rawResponse: unknown) => {
  if (!rawResponse || typeof rawResponse !== 'object') return false;
  const selectedIds = (rawResponse as { selectedCandidateIds?: unknown }).selectedCandidateIds;
  return Array.isArray(selectedIds) && selectedIds.includes(candidateId);
};

const toSceneCandidate = (row: {
  id: string;
  task_id: string;
  book_id?: string | null;
  chapter_id: string;
  candidate_order: number;
  source_block_id: string | null;
  position: number | null;
  reason: string | null;
  source_text: string | null;
  prompt_draft: string | null;
  final_prompt?: string | null;
  image_type?: 'scene' | 'character' | 'object' | null;
  location_change?: string | null;
  confidence: number | string | null;
  provider?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  raw_response?: unknown;
  selected_for_generation?: boolean | null;
}): SceneCandidate => ({
  id: row.id,
  taskId: row.task_id,
  bookId: row.book_id ?? undefined,
  chapterId: row.chapter_id,
  order: row.candidate_order,
  sourceBlockId: row.source_block_id ?? '',
  position: row.position ?? 0,
  reason: row.reason ?? '',
  sourceText: row.source_text ?? '',
  promptDraft: row.prompt_draft ?? '',
  finalPrompt: row.final_prompt ?? undefined,
  imageType: row.image_type ?? undefined,
  locationChange: row.location_change ?? undefined,
  confidence: Number(row.confidence ?? 0),
  provider: row.provider ?? undefined,
  model: row.model ?? undefined,
  promptVersion: row.prompt_version ?? undefined,
  rawResponse: row.raw_response,
  selectedForGeneration:
    row.selected_for_generation ?? isCandidateSelectedInRawResponse(row.id, row.raw_response),
});


const requireSupabase = () => {
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  return supabase;
};

export const dataMode = isSupabaseConfigured ? 'supabase' : 'mock';

export async function listBooks(): Promise<Book[]> {
  if (!supabase) {
    return mockBooks;
  }

  const { data, error } = await supabase.from('books').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map(toBook);
}

export async function getBook(bookId: string): Promise<Book | null> {
  if (!supabase) {
    return mockBooks.find((book) => book.id === bookId) ?? null;
  }

  const { data, error } = await supabase.from('books').select('*').eq('id', bookId).maybeSingle();
  if (error) throw error;
  return data ? toBook(data) : null;
}

export async function deleteBook(bookId: string): Promise<boolean> {
  if (!supabase) {
    return mockBooks.some((book) => book.id === bookId);
  }

  const existingBook = await getBook(bookId);
  if (!existingBook) {
    return false;
  }

  const { data: bookRow, error: bookError } = await supabase
    .from('books')
    .select('cover_path')
    .eq('id', bookId)
    .maybeSingle();
  if (bookError) throw bookError;

  const { error } = await supabase.from('books').delete().eq('id', bookId);
  if (error) throw error;
  if (bookRow?.cover_path) {
    const { error: coverError } = await supabase.storage.from('book-covers').remove([bookRow.cover_path]);
    if (coverError) console.warn(`Failed to remove book cover ${bookRow.cover_path}: ${coverError.message}`);
  }
  return true;
}

export async function createBook(input: BookInput): Promise<Book> {
  const client = requireSupabase();
  const id = input.id ?? createId('book');

  const { data, error } = await client
    .from('books')
    .upsert({
      id,
      title: input.title,
      progress: input.progress ?? '0%',
      accent: input.accent ?? '#2f4a40',
      current_chapter_id: input.currentChapterId,
      last_read_label: input.lastReadLabel ?? '准备开始第一章',
      visual_style: input.visualStyle ?? null,
      authors: input.authors ?? [],
      languages: input.languages ?? [],
      source: input.source ?? null,
      source_book_id: input.sourceBookId ?? null,
      source_url: input.sourceUrl ?? null,
      copyright_status: input.copyrightStatus ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toBook(data);
}

export async function findBookBySource(source: string, sourceBookId: string): Promise<Book | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('source', source)
    .eq('source_book_id', sourceBookId)
    .maybeSingle();
  if (error) throw error;
  return data ? toBook(data) : null;
}

export async function findImportedBookIds(source: string, sourceBookIds: string[]) {
  if (!supabase || sourceBookIds.length === 0) return new Map<string, string>();
  const { data, error } = await supabase
    .from('books')
    .select('id, source_book_id')
    .eq('source', source)
    .in('source_book_id', sourceBookIds);
  if (error) throw error;
  return new Map(data.flatMap((row) => (row.source_book_id ? [[row.source_book_id, row.id] as const] : [])));
}

export async function uploadBookCover(path: string, bytes: Uint8Array) {
  const client = requireSupabase();
  const { error } = await client.storage.from('book-covers').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function removeBookCover(path: string) {
  if (!supabase) return;
  const { error } = await supabase.storage.from('book-covers').remove([path]);
  if (error) console.warn(`Failed to remove book cover ${path}: ${error.message}`);
}

export async function importOnlineBook(input: {
  book: Book;
  coverPath: string | null;
  chapters: Chapter[];
}): Promise<Book> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('import_online_book', {
    p_authors: input.book.authors ?? [],
    p_book_id: input.book.id,
    p_chapters: input.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      progress: chapter.progress,
      blocks: chapter.blocks,
    })) as Json,
    p_copyright_status: input.book.copyrightStatus ?? 'unknown',
    p_cover_path: input.coverPath,
    p_languages: input.book.languages ?? [],
    p_source: input.book.source ?? 'gutenberg',
    p_source_book_id: input.book.sourceBookId ?? '',
    p_source_url: input.book.sourceUrl ?? '',
    p_title: input.book.title,
    p_visual_style: input.book.visualStyle ?? '写实',
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as BookRow | undefined;
  if (!row) throw new Error('ONLINE_BOOK_IMPORT_RETURNED_NO_BOOK');
  return toBook(row);
}

export async function listChaptersByBook(bookId: string): Promise<Chapter[]> {
  if (!supabase) {
    return mockChapters.filter((chapter) => chapter.bookId === bookId);
  }

  const { data, error } = await supabase.from('chapters').select('*').eq('book_id', bookId).order('created_at');
  if (error) throw error;
  return data.map(toChapter);
}

export async function getChapter(chapterId: string): Promise<Chapter | null> {
  if (!supabase) {
    return mockChapters.find((chapter) => chapter.id === chapterId) ?? null;
  }

  const { data, error } = await supabase.from('chapters').select('*').eq('id', chapterId).maybeSingle();
  if (error) throw error;
  return data ? toChapter(data) : null;
}

export async function createChapter(input: ChapterInput): Promise<Chapter> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('chapters')
    .upsert({
      id: input.id ?? createId('chapter'),
      book_id: input.bookId,
      title: input.title,
      progress: input.progress ?? 0,
      blocks: input.blocks ?? [],
    })
    .select('*')
    .single();

  if (error) throw error;
  return toChapter(data);
}

export async function importBook(input: BookImportInput): Promise<{ book: Book }> {
  const client = requireSupabase();
  const book = await createBook(input.book);

  if (input.chapters.length === 0) {
    return { book };
  }

  const chapterRows = input.chapters.map((chapter) => ({
    id: chapter.id ?? createId('chapter'),
    book_id: chapter.bookId,
    title: chapter.title,
    progress: chapter.progress ?? 0,
    blocks: chapter.blocks ?? [],
  }));
  const { error } = await client.from('chapters').upsert(chapterRows);

  if (error) throw error;
  return { book };
}

export async function listGenerationTasks(): Promise<GenerationTask[]> {
  if (!supabase) {
    return mockGenerationTasks;
  }

  const { data, error } = await supabase.from('generation_tasks').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map(toGenerationTask);
}

export async function getGenerationTask(taskId: string): Promise<GenerationTask | null> {
  if (!supabase) {
    return mockGenerationTasks.find((task) => task.id === taskId) ?? null;
  }

  const { data, error } = await supabase.from('generation_tasks').select('*').eq('id', taskId).maybeSingle();
  if (error) throw error;
  return data ? toGenerationTask(data) : null;
}

export async function updateGenerationTask(
  taskId: string,
  input: Partial<Pick<GenerationTask, 'durationMs' | 'errorMessage' | 'label' | 'progress' | 'provider' | 'status'>>,
): Promise<GenerationTask> {
  const client = requireSupabase();
  const payload = {
    progress: input.progress,
    status: input.status,
    label: input.label,
    error_message: input.errorMessage,
    provider: input.provider,
    duration_ms: input.durationMs,
  };
  const result = await client.from('generation_tasks').update(payload).eq('id', taskId).select('*').single();

  if (!result.error) {
    return toGenerationTask(result.data);
  }

  const legacyResult = await client
    .from('generation_tasks')
    .update({
      progress: input.progress,
      status: input.status === 'failed' || input.status === 'recognizing' ? 'queued' : input.status,
      label: input.label,
      error_message: input.errorMessage,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (legacyResult.error) throw result.error;
  return toGenerationTask(legacyResult.data);
}

export async function createGenerationTask(input: GenerationTaskInput): Promise<GenerationTask> {
  const client = requireSupabase();
  const chapter = await getChapter(input.chapterId);
  const id = input.id ?? `task-${input.chapterId}-scene-image`;
  const payload = {
    id,
    book_id: input.bookId ?? chapter?.bookId ?? null,
    chapter_id: input.chapterId,
    progress: input.progress ?? 0,
    status: input.status ?? 'queued',
    task_type: input.taskType ?? 'scene_image',
    label: input.label ?? '场景图生成已排队',
    error_message: input.errorMessage ?? null,
    provider: input.provider ?? null,
    duration_ms: input.durationMs ?? null,
  };

  const result = await client.from('generation_tasks').upsert(payload).select('*').single();

  if (!result.error) {
    return toGenerationTask(result.data);
  }

  const legacyResult = await client
    .from('generation_tasks')
    .upsert({
      id,
      chapter_id: input.chapterId,
      progress: payload.progress,
      status: payload.status === 'failed' || payload.status === 'recognizing' ? 'queued' : payload.status,
      label: payload.label,
    })
    .select('*')
    .single();

  if (legacyResult.error) throw result.error;
  return toGenerationTask(legacyResult.data);
}

export async function listSceneImages(): Promise<SceneImage[]> {
  if (!supabase) {
    return mockSceneImages;
  }

  const { data, error } = await supabase.from('scene_images').select('*').order('created_at');
  if (error) throw error;
  return data.map(toSceneImage);
}

export async function getSceneImage(imageId: string): Promise<SceneImage | null> {
  if (!supabase) {
    return mockSceneImages.find((image) => image.id === imageId) ?? null;
  }

  const { data, error } = await supabase.from('scene_images').select('*').eq('id', imageId).maybeSingle();
  if (error) throw error;
  return data ? toSceneImage(data) : null;
}

export async function createSceneImage(input: SceneImageInput): Promise<SceneImage> {
  const client = requireSupabase();
  const id = input.id ?? createId('scene-image');
  let imagePath = input.imagePath ?? input.imageUrl;

  if (!imagePath && input.imageBase64) {
    const mimeType = input.mimeType ?? 'image/png';
    const extension = mimeType.includes('svg') ? 'svg' : mimeType.includes('jpeg') ? 'jpg' : 'png';
    imagePath = `${input.chapterId}/${id}.${extension}`;
    const bytes = Buffer.from(input.imageBase64, 'base64');
    const { error: bucketError } = await client.storage.createBucket('scene-images', { public: true });
    if (bucketError && !bucketError.message.toLowerCase().includes('already exists')) {
      throw bucketError;
    }
    const { error: uploadError } = await client.storage.from('scene-images').upload(imagePath, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (uploadError) throw uploadError;
  }

  const payload = {
    id,
    chapter_id: input.chapterId,
    source_block_id: input.sourceBlockId ?? null,
    position: input.position ?? null,
    image_type: input.imageType ?? 'scene',
    variant: input.variant ?? 'street',
    prompt: input.prompt,
    image_path: imagePath ?? null,
  };
  const result = await client
    .from('scene_images')
    .upsert(payload)
    .select('*')
    .single();

  if (!result.error) return toSceneImage(result.data);

  const legacyResult = await client
    .from('scene_images')
    .upsert({
      id,
      chapter_id: input.chapterId,
      variant: input.variant ?? 'street',
      prompt: input.prompt,
      image_path: imagePath ?? null,
    })
    .select('*')
    .single();

  if (legacyResult.error) throw legacyResult.error;
  return toSceneImage(legacyResult.data);
}

export async function listSceneCandidates(filters: { chapterId?: string; taskId?: string } = {}): Promise<SceneCandidate[]> {
  if (!supabase) return [];

  let query = supabase.from('scene_candidates').select('*').order('candidate_order', { ascending: true });
  if (filters.chapterId) query = query.eq('chapter_id', filters.chapterId);
  if (filters.taskId) query = query.eq('task_id', filters.taskId);

  const { data, error } = await query;
  if (error) {
    if (isMissingSceneCandidateTableError(error)) return [];
    throw error;
  }
  return data.map(toSceneCandidate);
}

export async function createSceneCandidates(inputs: SceneCandidateInput[]): Promise<SceneCandidate[]> {
  if (inputs.length === 0) return [];
  if (!supabase) {
    return inputs.map((input, index) => ({
      id: input.id ?? createId('scene-candidate'),
      taskId: input.taskId,
      bookId: input.bookId,
      chapterId: input.chapterId,
      order: input.order ?? index,
      sourceBlockId: input.sourceBlockId,
      position: input.position ?? index,
      reason: input.reason ?? '',
      sourceText: input.sourceText,
      promptDraft: input.promptDraft,
      finalPrompt: input.finalPrompt,
      imageType: input.imageType ?? 'scene',
      locationChange: input.locationChange,
      confidence: input.confidence ?? 0,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      rawResponse: input.rawResponse,
      selectedForGeneration: input.selectedForGeneration ?? false,
    }));
  }

  const payload = inputs.map((input, index) => ({
    id: input.id ?? createId('scene-candidate'),
    task_id: input.taskId,
    book_id: input.bookId ?? null,
    chapter_id: input.chapterId,
    candidate_order: input.order ?? index,
    source_block_id: input.sourceBlockId,
    position: input.position ?? index,
    reason: input.reason ?? '',
    source_text: input.sourceText,
    prompt_draft: input.promptDraft,
    final_prompt: input.finalPrompt ?? null,
    image_type: input.imageType ?? 'scene',
    location_change: input.locationChange ?? null,
    confidence: input.confidence ?? 0,
    provider: input.provider ?? null,
    model: input.model ?? null,
    prompt_version: input.promptVersion ?? 'scene-v1',
    raw_response: input.rawResponse ?? null,
    selected_for_generation: input.selectedForGeneration ?? false,
  }));

  const { data, error } = await supabase.from('scene_candidates').upsert(payload).select('*');
  if (error) {
    const legacyPayload = payload.map(({ image_type: _imageType, selected_for_generation: _selected, ...item }) => item);
    const legacyResult = await supabase.from('scene_candidates').upsert(legacyPayload).select('*');
    if (legacyResult.error) {
      if (isMissingSceneCandidateTableError(legacyResult.error)) return [];
      throw error;
    }
    return legacyResult.data.map(toSceneCandidate);
  }
  return data.map(toSceneCandidate);
}
