import { books as mockBooks, chapters as mockChapters, generationTasks as mockGenerationTasks } from './mockData.js';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import type { Book, Chapter, ChapterBlock, GenerationTask, VisualStyle } from './types.js';

type BookInput = Partial<Book> & Pick<Book, 'title' | 'currentChapterId'>;
type ChapterInput = Partial<Chapter> & Pick<Chapter, 'bookId' | 'title'>;
type GenerationTaskInput = Partial<GenerationTask> & Pick<GenerationTask, 'chapterId' | 'label'>;

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toBook = (row: NonNullable<typeof supabase> extends never ? never : {
  id: string;
  title: string;
  progress: string;
  accent: string;
  current_chapter_id: string;
  last_read_label: string;
  visual_style: string | null;
}): Book => ({
  id: row.id,
  title: row.title,
  progress: row.progress,
  accent: row.accent,
  currentChapterId: row.current_chapter_id,
  lastReadLabel: row.last_read_label,
  visualStyle: row.visual_style === null ? undefined : (row.visual_style as VisualStyle),
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
  chapter_id: string;
  progress: number;
  status: 'queued' | 'generating' | 'completed';
  label: string;
}): GenerationTask => ({
  id: row.id,
  chapterId: row.chapter_id,
  progress: row.progress,
  status: row.status,
  label: row.label,
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

export async function createBook(input: BookInput): Promise<Book> {
  const client = requireSupabase();
  const id = input.id ?? createId('book');

  const { data, error } = await client
    .from('books')
    .insert({
      id,
      title: input.title,
      progress: input.progress ?? '0%',
      accent: input.accent ?? '#2f4a40',
      current_chapter_id: input.currentChapterId,
      last_read_label: input.lastReadLabel ?? '准备开始第一章',
      visual_style: input.visualStyle ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toBook(data);
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
    .insert({
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

export async function createGenerationTask(input: GenerationTaskInput): Promise<GenerationTask> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('generation_tasks')
    .insert({
      id: input.id ?? createId('task'),
      chapter_id: input.chapterId,
      progress: input.progress ?? 0,
      status: input.status ?? 'queued',
      label: input.label,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toGenerationTask(data);
}
