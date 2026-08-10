import {
  books as mockBooks,
  chapters as mockChapters,
  generationTasks as mockGenerationTasks,
  legacySceneCandidates as mockLegacySceneCandidates,
  sceneImages as mockSceneImages,
} from './mockData.js';
import { isSupabaseConfigured, supabase, type Database, type Json } from './supabaseClient.js';
import {
  API_ERROR_CODES,
  ApiInputError,
  effectiveImageType,
  isPublishableAttempt,
  validateCanonicalImageTypeForWrite,
} from './imagePipeline.js';
import type {
  Book,
  BookVisualProfile,
  CandidateClassification,
  Chapter,
  ChapterBlock,
  GenerationTask,
  ImageGenerationAttempt,
  SceneImage,
  SceneCandidate,
  StoredImageType,
  VisualProfileFact,
  VisualStyle,
} from './types.js';

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
export type PersistedCandidateInput = {
  id: string;
  taskId: string;
  bookId?: string;
  chapterId: string;
  order?: number;
  sourceBlockId: string;
  position?: number;
  sourceText: string;
  promptDraft: string;
  classification: CandidateClassification;
  contractVersion: string;
  profileVersion?: string;
  profileFactSuggestions?: VisualProfileFact[];
};

export type ProfileUpsertInput = Omit<BookVisualProfile, 'id'>;
export type AttemptUpsertInput = Omit<ImageGenerationAttempt, 'id' | 'createdAt'> & { id?: string };

function preserveQueuedAttemptFields(
  existing: ImageGenerationAttempt,
  terminal: AttemptUpsertInput,
): AttemptUpsertInput {
  return {
    ...terminal,
    id: existing.id,
    idempotencyKey: existing.idempotencyKey,
    candidateId: existing.candidateId,
    taskId: existing.taskId,
    parentAttemptId: existing.parentAttemptId,
    trigger: existing.trigger,
    requestedType: existing.requestedType,
    overriddenFrom: existing.overriddenFrom,
    classificationSnapshot: existing.classificationSnapshot,
    contractVersion: existing.contractVersion,
    profileVersion: existing.profileVersion,
  };
}

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type BookRow = Database['public']['Tables']['books']['Row'];

const getPublicStorageUrl = (bucket: string, path: string | null | undefined): string | undefined => {
  if (!path || !supabase) return undefined;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

export const mapBookRow = (row: BookRow): Book => ({
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
  source: row.source === 'gutenberg' || row.source === 'wikisource' ? row.source : undefined,
  sourceBookId: row.source_book_id ?? undefined,
  sourceUrl: row.source_url ?? undefined,
  sourceAttribution: row.source_attribution ?? undefined,
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
  image_type?: StoredImageType | null;
  candidate_id?: string | null;
  attempt_id?: string | null;
  variant: 'street' | 'office';
  prompt: string;
  image_path: string | null;
}): SceneImage => ({
  id: row.id,
  chapterId: row.chapter_id,
  sourceBlockId: row.source_block_id ?? undefined,
  position: row.position ?? undefined,
  imageType: row.image_type ?? undefined,
  effectiveImageType: effectiveImageType(row.image_type),
  candidateId: row.candidate_id ?? undefined,
  attemptId: row.attempt_id ?? undefined,
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
  image_type?: StoredImageType | null;
  location_change?: string | null;
  confidence: number | string | null;
  provider?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  raw_response?: unknown;
  selected_for_generation?: boolean | null;
  classification_snapshot?: unknown;
  classification_status?: 'eligible' | 'below_threshold' | 'invalid' | null;
  contract_version?: string | null;
  profile_version?: string | null;
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
  effectiveImageType: effectiveImageType(row.image_type),
  locationChange: row.location_change ?? undefined,
  confidence: Number(row.confidence ?? 0),
  provider: row.provider ?? undefined,
  model: row.model ?? undefined,
  promptVersion: row.prompt_version ?? undefined,
  rawResponse: row.raw_response,
  selectedForGeneration:
    row.selected_for_generation ?? isCandidateSelectedInRawResponse(row.id, row.raw_response),
  classification: row.classification_snapshot as CandidateClassification | undefined,
  classificationStatus: row.classification_status ?? undefined,
  contractVersion: row.contract_version ?? undefined,
  profileVersion: row.profile_version ?? undefined,
});

const copyFacts = (facts: VisualProfileFact[]) => facts.map((fact) => ({ ...fact }));

export function createInMemoryImageRepository(options: { legacyImages?: SceneImage[] } = {}) {
  const candidates = new Map<string, SceneCandidate>();
  const profiles = new Map<string, BookVisualProfile>();
  const attemptsByKey = new Map<string, ImageGenerationAttempt>();
  const attemptsByCandidate = new Map<string, ImageGenerationAttempt[]>();
  const projections = new Map<string, SceneImage>();
  const legacyImages = [...(options.legacyImages ?? [])];

  const profileIdentity = (input: Pick<BookVisualProfile, 'bookId' | 'entityType' | 'entityKey'>) =>
    `${input.bookId}:${input.entityType}:${input.entityKey}`;

  return {
    async upsertCandidate(input: PersistedCandidateInput): Promise<SceneCandidate> {
      const primaryType = validateCanonicalImageTypeForWrite(input.classification.primaryType);
      const current = candidates.get(input.id);
      const candidate: SceneCandidate = {
        id: input.id,
        taskId: input.taskId,
        bookId: input.bookId,
        chapterId: input.chapterId,
        order: input.order ?? 0,
        sourceBlockId: input.sourceBlockId,
        position: input.position ?? 0,
        reason: input.classification.reason,
        sourceText: input.sourceText,
        promptDraft: input.promptDraft,
        imageType: primaryType,
        effectiveImageType: primaryType,
        confidence: input.classification.rankedTypes[0].confidence,
        model: input.classification.model,
        promptVersion: input.classification.promptVersion,
        classification: input.classification,
        classificationStatus: input.classification.status,
        contractVersion: input.contractVersion,
        profileVersion: input.profileVersion,
        rawResponse: { profileFactSuggestions: copyFacts(input.profileFactSuggestions ?? []) },
      };
      candidates.set(input.id, current ?? candidate);
      return candidates.get(input.id)!;
    },

    async upsertProfile(input: ProfileUpsertInput): Promise<BookVisualProfile> {
      const identity = profileIdentity(input);
      const current = profiles.get(identity);
      if (!current) {
        const created: BookVisualProfile = { ...input, id: createId('profile'), stableFacts: copyFacts(input.stableFacts), flexibleFacts: copyFacts(input.flexibleFacts) };
        profiles.set(identity, created);
        return created;
      }
      const stableFields = new Set(current.stableFacts.map((fact) => fact.field));
      const flexibleByField = new Map(current.flexibleFacts.map((fact) => [fact.field, fact]));
      for (const fact of input.flexibleFacts) flexibleByField.set(fact.field, { ...fact });
      const merged: BookVisualProfile = {
        ...current,
        stableFacts: copyFacts(current.stableFacts).concat(input.stableFacts.filter((fact) => !stableFields.has(fact.field)).map((fact) => ({ ...fact }))),
        flexibleFacts: [...flexibleByField.values()],
        version: input.version,
      };
      profiles.set(identity, merged);
      return merged;
    },

    async upsertAttempt(input: AttemptUpsertInput): Promise<ImageGenerationAttempt> {
      validateCanonicalImageTypeForWrite(input.requestedType);
      const existing = attemptsByKey.get(input.idempotencyKey);
      if (existing && existing.status !== 'queued') return existing;
      if (existing && input.status === 'queued') return existing;
      const persistedInput = existing ? preserveQueuedAttemptFields(existing, input) : input;
      const attempt: ImageGenerationAttempt = {
        ...persistedInput,
        id: existing?.id ?? input.id ?? createId('attempt'),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      attemptsByKey.set(input.idempotencyKey, attempt);
      const candidateAttempts = attemptsByCandidate.get(input.candidateId) ?? [];
      attemptsByCandidate.set(
        input.candidateId,
        existing ? candidateAttempts.map((item) => item.id === existing.id ? attempt : item) : [...candidateAttempts, attempt],
      );
      if (isPublishableAttempt(attempt)) {
        projections.set(input.candidateId, {
          id: `projection-${input.candidateId}`,
          chapterId: candidates.get(input.candidateId)?.chapterId ?? '',
          sourceBlockId: candidates.get(input.candidateId)?.sourceBlockId,
          imageType: input.requestedType,
          effectiveImageType: input.requestedType,
          candidateId: input.candidateId,
          attemptId: attempt.id,
          variant: 'street',
          prompt: input.prompt,
          imageUrl: input.imageUrl,
        });
      }
      return attempt;
    },

    async listAttempts(candidateId: string): Promise<ImageGenerationAttempt[]> {
      return [...(attemptsByCandidate.get(candidateId) ?? [])];
    },

    async findAttemptByKey(idempotencyKey: string): Promise<ImageGenerationAttempt | null> {
      return attemptsByKey.get(idempotencyKey) ?? null;
    },

    async findManualAttemptByTask(taskId: string): Promise<ImageGenerationAttempt | null> {
      return [...attemptsByKey.values()].find((attempt) => attempt.taskId === taskId && attempt.trigger === 'manual') ?? null;
    },

    async getCandidate(candidateId: string): Promise<SceneCandidate | null> {
      return candidates.get(candidateId) ?? null;
    },

    async listCandidates(filters: { chapterId?: string; taskId?: string } = {}): Promise<SceneCandidate[]> {
      return [...candidates.values()]
        .filter((candidate) => !filters.chapterId || candidate.chapterId === filters.chapterId)
        .filter((candidate) => !filters.taskId || candidate.taskId === filters.taskId)
        .sort((left, right) => left.order - right.order);
    },

    async listProfiles(bookId: string): Promise<BookVisualProfile[]> {
      return [...profiles.values()].filter((profile) => profile.bookId === bookId);
    },

    async getProjection(candidateId: string): Promise<SceneImage | null> {
      return projections.get(candidateId) ?? null;
    },

    async listReaderImages(): Promise<SceneImage[]> {
      return [...legacyImages, ...projections.values()].map((image) => ({
        ...image,
        effectiveImageType: effectiveImageType(image.imageType),
      }));
    },
  };
}

const apiMemoryRepository = createInMemoryImageRepository();
const apiMemoryTasks = new Map(mockGenerationTasks.map((task) => [task.id, { ...task }]));
const apiLegacyCandidates = new Map(mockLegacySceneCandidates.map((candidate) => [candidate.id, { ...candidate }]));


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
  return data.map(mapBookRow);
}

export async function getBook(bookId: string): Promise<Book | null> {
  if (!supabase) {
    return mockBooks.find((book) => book.id === bookId) ?? null;
  }

  const { data, error } = await supabase.from('books').select('*').eq('id', bookId).maybeSingle();
  if (error) throw error;
  return data ? mapBookRow(data) : null;
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
      source_attribution: input.sourceAttribution ?? null,
      copyright_status: input.copyrightStatus ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapBookRow(data);
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
  return data ? mapBookRow(data) : null;
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

export type ImportOnlineBookInput = {
  book: Book;
  coverPath: string | null;
  chapters: Chapter[];
};

export const buildImportOnlineBookRpcArgs = (input: ImportOnlineBookInput) => ({
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
  p_source_attribution: input.book.sourceAttribution ?? null,
  p_title: input.book.title,
  p_visual_style: input.book.visualStyle ?? '写实',
});

export async function importOnlineBook(input: ImportOnlineBookInput): Promise<Book> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('import_online_book', buildImportOnlineBookRpcArgs(input));
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as BookRow | undefined;
  if (!row) throw new Error('ONLINE_BOOK_IMPORT_RETURNED_NO_BOOK');
  return mapBookRow(row);
}

export async function listChaptersByBook(bookId: string): Promise<Chapter[]> {
  if (!supabase) {
    return mockChapters.filter((chapter) => chapter.bookId === bookId);
  }

  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('book_id', bookId)
    .order('chapter_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
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
    return [...apiMemoryTasks.values()];
  }

  const { data, error } = await supabase.from('generation_tasks').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map(toGenerationTask);
}

export async function getGenerationTask(taskId: string): Promise<GenerationTask | null> {
  if (!supabase) {
    return apiMemoryTasks.get(taskId) ?? null;
  }

  const { data, error } = await supabase.from('generation_tasks').select('*').eq('id', taskId).maybeSingle();
  if (error) throw error;
  return data ? toGenerationTask(data) : null;
}

export async function updateGenerationTask(
  taskId: string,
  input: Partial<Pick<GenerationTask, 'durationMs' | 'errorMessage' | 'label' | 'progress' | 'provider' | 'status'>>,
): Promise<GenerationTask> {
  if (!supabase) {
    const existing = apiMemoryTasks.get(taskId);
    if (!existing) throw new Error('TASK_NOT_FOUND');
    const updated = { ...existing, ...input };
    apiMemoryTasks.set(taskId, updated);
    return updated;
  }
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
  const chapter = await getChapter(input.chapterId);
  const id = input.id ?? `task-${input.chapterId}-scene-image`;
  if (!supabase) {
    const existing = apiMemoryTasks.get(id);
    if (existing) return existing;
    const task: GenerationTask = {
      id,
      bookId: input.bookId ?? chapter?.bookId,
      chapterId: input.chapterId,
      progress: input.progress ?? 0,
      status: input.status ?? 'queued',
      taskType: input.taskType ?? 'scene_image',
      label: input.label ?? 'Scene image generation queued',
      errorMessage: input.errorMessage,
      provider: input.provider,
      durationMs: input.durationMs,
    };
    apiMemoryTasks.set(id, task);
    return task;
  }
  const client = requireSupabase();
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
    return [...mockSceneImages, ...await apiMemoryRepository.listReaderImages()];
  }

  const { data, error } = await supabase.from('scene_images').select('*').order('created_at');
  if (error) throw error;
  return data.map(toSceneImage);
}

export async function getSceneImage(imageId: string): Promise<SceneImage | null> {
  if (!supabase) {
    return (await listSceneImages()).find((image) => image.id === imageId) ?? null;
  }

  const { data, error } = await supabase.from('scene_images').select('*').eq('id', imageId).maybeSingle();
  if (error) throw error;
  return data ? toSceneImage(data) : null;
}

export async function createSceneImage(input: SceneImageInput): Promise<SceneImage> {
  void input;
  throw new Error('READER_PROJECTION_MANAGED_BY_PUBLISHABLE_ATTEMPT');
}

export async function listSceneCandidates(filters: { chapterId?: string; taskId?: string } = {}): Promise<SceneCandidate[]> {
  if (!supabase) {
    const canonical = await apiMemoryRepository.listCandidates(filters);
    const legacy = [...apiLegacyCandidates.values()]
      .filter((candidate) => !filters.chapterId || candidate.chapterId === filters.chapterId)
      .filter((candidate) => !filters.taskId || candidate.taskId === filters.taskId);
    return [...canonical, ...legacy].sort((left, right) => left.order - right.order);
  }

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

const toProfile = (row: {
  id: string;
  book_id: string;
  entity_type: 'character' | 'location';
  entity_key: string;
  stable_facts: unknown;
  flexible_facts: unknown;
  version: string;
}): BookVisualProfile => ({
  id: row.id,
  bookId: row.book_id,
  entityType: row.entity_type,
  entityKey: row.entity_key,
  stableFacts: Array.isArray(row.stable_facts) ? row.stable_facts as VisualProfileFact[] : [],
  flexibleFacts: Array.isArray(row.flexible_facts) ? row.flexible_facts as VisualProfileFact[] : [],
  version: row.version,
});

const toAttempt = (row: {
  id: string;
  idempotency_key: string;
  candidate_id: string;
  task_id: string;
  parent_attempt_id: string | null;
  trigger: 'automatic' | 'manual';
  requested_type: ImageGenerationAttempt['requestedType'];
  overridden_from: StoredImageType | null;
  status: ImageGenerationAttempt['status'];
  prompt: string;
  provider: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
  image_url: string | null;
  audit: unknown;
  classification_snapshot?: unknown;
  contract_version?: string | null;
  profile_version?: string | null;
  artifact_metadata?: unknown;
  created_at: string;
}): ImageGenerationAttempt => ({
  id: row.id,
  idempotencyKey: row.idempotency_key,
  candidateId: row.candidate_id,
  taskId: row.task_id,
  parentAttemptId: row.parent_attempt_id ?? undefined,
  trigger: row.trigger,
  requestedType: row.requested_type,
  overriddenFrom: row.overridden_from ?? undefined,
  status: row.status,
  prompt: row.prompt,
  provider: row.provider ?? undefined,
  model: row.model ?? undefined,
  width: row.width ?? undefined,
  height: row.height ?? undefined,
  imageUrl: row.image_url ?? undefined,
  audit: row.audit as ImageGenerationAttempt['audit'],
  classificationSnapshot: row.classification_snapshot as CandidateClassification | undefined,
  contractVersion: row.contract_version ?? undefined,
  profileVersion: row.profile_version ?? undefined,
  artifactMetadata: row.artifact_metadata,
  createdAt: row.created_at,
});

type AttemptPersistenceRow = Parameters<typeof toAttempt>[0];

export type ImageAttemptPersistence = {
  findAttemptByKey(idempotencyKey: string): Promise<AttemptPersistenceRow | null>;
  insertAttempt(payload: Record<string, unknown>): Promise<AttemptPersistenceRow>;
  updateAttempt(id: string, payload: Record<string, unknown>): Promise<AttemptPersistenceRow>;
  findCandidate(candidateId: string): Promise<{ chapter_id: string; source_block_id: string | null }>;
  upsertProjection(payload: Record<string, unknown>): Promise<void>;
};

function createSupabaseAttemptPersistence(client: NonNullable<typeof supabase>): ImageAttemptPersistence {
  return {
    async findAttemptByKey(idempotencyKey) {
      const { data, error } = await client
        .from('image_generation_attempts')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertAttempt(payload) {
      const { data, error } = await client.from('image_generation_attempts').insert(payload as never).select('*').single();
      if (error) throw error;
      if (!data) throw new Error('ATTEMPT_UPSERT_DID_NOT_RETURN_A_RECORD');
      return data;
    },
    async updateAttempt(id, payload) {
      const { data, error } = await client
        .from('image_generation_attempts')
        .update(payload as never)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      if (!data) throw new Error('ATTEMPT_UPSERT_DID_NOT_RETURN_A_RECORD');
      return data;
    },
    async findCandidate(candidateId) {
      const { data, error } = await client
        .from('scene_candidates')
        .select('chapter_id, source_block_id')
        .eq('id', candidateId)
        .single();
      if (error) throw error;
      return data;
    },
    async upsertProjection(payload) {
      const { error } = await client.from('scene_images').upsert(payload as never, { onConflict: 'candidate_id' });
      if (error) throw error;
    },
  };
}

function assertSameAttemptIdentity(existing: ImageGenerationAttempt, input: AttemptUpsertInput): void {
  if (
    existing.candidateId !== input.candidateId
    || existing.taskId !== input.taskId
    || existing.trigger !== input.trigger
    || existing.requestedType !== input.requestedType
  ) {
    throw new ApiInputError(API_ERROR_CODES.idempotencyConflict, 409);
  }
}

function isIdempotencyUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

async function ensurePublishableProjection(
  persistence: ImageAttemptPersistence,
  attempt: ImageGenerationAttempt,
): Promise<void> {
  if (!isPublishableAttempt(attempt)) return;
  const candidate = await persistence.findCandidate(attempt.candidateId);
  await persistence.upsertProjection({
    id: `projection-${attempt.candidateId}`,
    chapter_id: candidate.chapter_id,
    source_block_id: candidate.source_block_id,
    image_type: attempt.requestedType,
    candidate_id: attempt.candidateId,
    attempt_id: attempt.id,
    variant: 'street',
    prompt: attempt.prompt,
    image_path: attempt.imageUrl ?? null,
  });
}

export async function upsertSceneCandidate(input: PersistedCandidateInput): Promise<SceneCandidate> {
  if (!supabase) return apiMemoryRepository.upsertCandidate(input);
  const client = requireSupabase();
  const primaryType = validateCanonicalImageTypeForWrite(input.classification.primaryType);
  const payload = {
    id: input.id,
    task_id: input.taskId,
    book_id: input.bookId ?? null,
    chapter_id: input.chapterId,
    candidate_order: input.order ?? 0,
    source_block_id: input.sourceBlockId,
    position: input.position ?? 0,
    reason: input.classification.reason,
    source_text: input.sourceText,
    prompt_draft: input.promptDraft,
    image_type: primaryType,
    confidence: input.classification.rankedTypes[0].confidence,
    model: input.classification.model,
    prompt_version: input.classification.promptVersion,
    classification_snapshot: input.classification,
    classification_status: input.classification.status,
    contract_version: input.contractVersion,
    profile_version: input.profileVersion ?? null,
    raw_response: { profileFactSuggestions: input.profileFactSuggestions ?? [] },
  };
  const { data, error } = await client.from('scene_candidates').upsert(payload).select('*').single();
  if (error) throw error;
  return toSceneCandidate(data);
}

export async function upsertBookVisualProfile(input: ProfileUpsertInput): Promise<BookVisualProfile> {
  if (!supabase) return apiMemoryRepository.upsertProfile(input);
  const client = requireSupabase();
  const existingResult = await client
    .from('book_visual_profiles')
    .select('*')
    .eq('book_id', input.bookId)
    .eq('entity_type', input.entityType)
    .eq('entity_key', input.entityKey)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  const existing = existingResult.data ? toProfile(existingResult.data) : undefined;
  const stableFields = new Set(existing?.stableFacts.map((fact) => fact.field) ?? []);
  const flexibleByField = new Map(existing?.flexibleFacts.map((fact) => [fact.field, fact]) ?? []);
  for (const fact of input.flexibleFacts) flexibleByField.set(fact.field, { ...fact });
  const payload = {
    id: existing?.id ?? createId('profile'),
    book_id: input.bookId,
    entity_type: input.entityType,
    entity_key: input.entityKey,
    stable_facts: [...(existing?.stableFacts ?? []), ...input.stableFacts.filter((fact) => !stableFields.has(fact.field))],
    flexible_facts: [...flexibleByField.values()],
    version: input.version,
  };
  const { data, error } = await client.from('book_visual_profiles').upsert(payload, { onConflict: 'book_id,entity_type,entity_key' }).select('*').single();
  if (error) throw error;
  return toProfile(data);
}

export async function upsertImageGenerationAttemptWithPersistence(
  persistence: ImageAttemptPersistence,
  input: AttemptUpsertInput,
): Promise<ImageGenerationAttempt> {
  const initialRow = await persistence.findAttemptByKey(input.idempotencyKey);
  let existing = initialRow ? toAttempt(initialRow) : null;

  while (true) {
    if (existing) {
      assertSameAttemptIdentity(existing, input);
      if (existing.status !== 'queued' || input.status === 'queued') {
        await ensurePublishableProjection(persistence, existing);
        return existing;
      }
    }

    const persistedInput = existing ? preserveQueuedAttemptFields(existing, input) : input;
    const requestedType = validateCanonicalImageTypeForWrite(persistedInput.requestedType);
    const payload = {
      id: existing?.id ?? persistedInput.id ?? createId('attempt'),
      idempotency_key: persistedInput.idempotencyKey,
      candidate_id: persistedInput.candidateId,
      task_id: persistedInput.taskId,
      parent_attempt_id: persistedInput.parentAttemptId ?? null,
      trigger: persistedInput.trigger,
      requested_type: requestedType,
      overridden_from: persistedInput.overriddenFrom ?? null,
      status: persistedInput.status,
      prompt: persistedInput.prompt,
      provider: persistedInput.provider ?? null,
      model: persistedInput.model ?? null,
      width: persistedInput.width ?? null,
      height: persistedInput.height ?? null,
      image_url: persistedInput.imageUrl ?? null,
      audit: persistedInput.audit ?? null,
      classification_snapshot: persistedInput.classificationSnapshot ?? null,
      contract_version: persistedInput.contractVersion ?? null,
      profile_version: persistedInput.profileVersion ?? null,
      artifact_metadata: persistedInput.artifactMetadata ?? null,
    };

    let row: AttemptPersistenceRow;
    if (existing) {
      row = await persistence.updateAttempt(existing.id, payload);
    } else {
      try {
        row = await persistence.insertAttempt(payload);
      } catch (error) {
        if (!isIdempotencyUniqueViolation(error)) throw error;
        const racedRow = await persistence.findAttemptByKey(input.idempotencyKey);
        if (!racedRow) throw error;
        existing = toAttempt(racedRow);
        continue;
      }
    }
    const attempt = toAttempt(row);
    await ensurePublishableProjection(persistence, attempt);
    return attempt;
  }
}

export async function upsertImageGenerationAttempt(input: AttemptUpsertInput): Promise<ImageGenerationAttempt> {
  if (!supabase) return apiMemoryRepository.upsertAttempt(input);
  return upsertImageGenerationAttemptWithPersistence(createSupabaseAttemptPersistence(requireSupabase()), input);
}

export async function listImageGenerationAttempts(candidateId: string): Promise<ImageGenerationAttempt[]> {
  if (!supabase) return apiMemoryRepository.listAttempts(candidateId);
  const { data, error } = await supabase.from('image_generation_attempts').select('*').eq('candidate_id', candidateId).order('created_at');
  if (error) throw error;
  return data.map(toAttempt);
}

export async function getSceneCandidate(candidateId: string): Promise<SceneCandidate | null> {
  if (!supabase) return await apiMemoryRepository.getCandidate(candidateId) ?? apiLegacyCandidates.get(candidateId) ?? null;
  const { data, error } = await supabase.from('scene_candidates').select('*').eq('id', candidateId).maybeSingle();
  if (error) throw error;
  return data ? toSceneCandidate(data) : null;
}

export async function listBookVisualProfiles(bookId: string): Promise<BookVisualProfile[]> {
  if (!supabase) return apiMemoryRepository.listProfiles(bookId);
  const { data, error } = await supabase.from('book_visual_profiles').select('*').eq('book_id', bookId).order('entity_type').order('entity_key');
  if (error) throw error;
  return data.map(toProfile);
}

export async function findImageGenerationAttemptByKey(idempotencyKey: string): Promise<ImageGenerationAttempt | null> {
  if (!supabase) return apiMemoryRepository.findAttemptByKey(idempotencyKey);
  const { data, error } = await supabase.from('image_generation_attempts').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
  if (error) throw error;
  return data ? toAttempt(data) : null;
}

export async function findManualImageGenerationAttemptByTask(taskId: string): Promise<ImageGenerationAttempt | null> {
  if (!supabase) return apiMemoryRepository.findManualAttemptByTask(taskId);
  const { data, error } = await supabase
    .from('image_generation_attempts')
    .select('*')
    .eq('task_id', taskId)
    .eq('trigger', 'manual')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toAttempt(data) : null;
}
