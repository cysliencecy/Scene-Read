import type { Book, Chapter, GenerationTask, SceneCandidate, SceneImage } from '../types/app';

import type {
  OnlineBookImportResult,
  OnlineBookSearchPage,
  OnlineBookSource,
  OnlineBookSourceError,
  VisualStyle,
} from '../types/app';

import type {
  CanonicalImageType,
  ManualRegenerationResult,
  SceneCandidateDebugDetail,
} from '../types/app';

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const getDefaultApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return 'http://localhost:4000';
};

const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? getDefaultApiBaseUrl());

type ApiResponse<T> = {
  data: T;
};

const apiError = async (path: string, response: Response) => {
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  const error = new Error(payload?.message || payload?.error || `API ${path} failed with ${response.status}`) as Error & {
    code?: string;
  };
  error.code = payload?.error;
  return error;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw await apiError(path, response);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await apiError(path, response);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw await apiError(path, response);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

export async function fetchBooks() {
  return getJson<Book[]>('/books');
}

export async function searchOnlineBooks(query: string, page = 1) {
  const params = new URLSearchParams({ q: query, page: String(page) });
  return getJson<OnlineBookSearchPage>(`/online-books/search?${params.toString()}`);
}

export const onlineBookSourceLabel = (source: OnlineBookSource) =>
  source === 'wikisource' ? '中文维基文库' : 'Project Gutenberg';

export const onlineBookSourceWarning = (error: OnlineBookSourceError) =>
  `${onlineBookSourceLabel(error.source)}暂时不可用，已显示其它可用书源。`;

export const mergeOnlineBookSearchPages = (
  current: OnlineBookSearchPage,
  incoming: OnlineBookSearchPage,
): OnlineBookSearchPage => {
  const items = [...current.items, ...incoming.items].filter(
    (book, index, books) =>
      books.findIndex(
        (candidate) => candidate.source === book.source && candidate.sourceBookId === book.sourceBookId,
      ) === index,
  );
  const sourceErrors = [...current.sourceErrors, ...incoming.sourceErrors].filter(
    (error, index, errors) =>
      errors.findIndex((candidate) => candidate.source === error.source && candidate.code === error.code) === index,
  );
  return {
    ...incoming,
    items,
    sourceErrors,
  };
};

export const onlineBookErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : message;
  const messages: Record<string, string> = {
    BOOK_SOURCE_UNAVAILABLE: '在线书源暂时不可用，请稍后重试。',
    BOOK_DOWNLOAD_FAILED: '书籍下载失败，请稍后重试。',
    BOOK_DOWNLOAD_TOO_LARGE: '这本书超过 20 MB，暂不支持导入。',
    BOOK_SOURCE_URL_REJECTED: '在线书源地址不受信任，已停止请求。',
    ONLINE_BOOK_FORMAT_UNSUPPORTED: '这本书没有可用的 EPUB 或 UTF-8 TXT 格式。',
    ONLINE_BOOK_HAS_NO_CHAPTERS: '这部作品没有可导入的章节。',
    ONLINE_BOOK_HAS_NO_READABLE_TEXT: '没有解析到可阅读的正文。',
    ONLINE_BOOK_NOT_FOUND: '没有找到这部在线作品。',
    ONLINE_BOOK_PARSE_FAILED: '这本书的文件无法解析，请换一本试试。',
    ONLINE_BOOK_TOO_MANY_CHAPTERS: '这部作品超过 200 章，暂不支持导入。',
    SUPABASE_NOT_CONFIGURED: '存储服务未配置，现在可以搜索，但不能导入。',
  };
  return messages[code] ?? (message || '操作失败，请稍后重试。');
};

export async function importOnlineBook(
  source: OnlineBookSource,
  sourceBookId: string,
  visualStyle: VisualStyle,
) {
  return postJson<OnlineBookImportResult>('/online-books/import', {
    source,
    sourceBookId,
    visualStyle,
  });
}

export async function fetchChapter(chapterId: string) {
  return getJson<Chapter>(`/chapters/${chapterId}`);
}

export async function fetchChapters(bookId: string) {
  return getJson<Chapter[]>(`/books/${encodeURIComponent(bookId)}/chapters`);
}

export async function fetchGenerationTasks() {
  return getJson<GenerationTask[]>('/generation-tasks');
}

export async function fetchSceneImages() {
  return getJson<SceneImage[]>('/scene-images');
}

export async function fetchSceneCandidates(chapterId?: string, taskId?: string) {
  const params = new URLSearchParams();
  if (chapterId) params.set('chapterId', chapterId);
  if (taskId) params.set('taskId', taskId);
  const query = params.toString();
  return getJson<SceneCandidate[]>(`/scene-candidates${query ? `?${query}` : ''}`);
}

export async function fetchSceneCandidateDetails(chapterId?: string, taskId?: string) {
  const params = new URLSearchParams({ includeAttempts: 'true' });
  if (chapterId) params.set('chapterId', chapterId);
  if (taskId) params.set('taskId', taskId);
  return getJson<SceneCandidateDebugDetail[]>(`/scene-candidates?${params.toString()}`);
}

export async function requestManualRegeneration(
  candidateId: string,
  overrideImageType: CanonicalImageType,
  idempotencyKey: string,
) {
  return postJson<ManualRegenerationResult>(
    `/scene-candidates/${encodeURIComponent(candidateId)}/regenerations`,
    { overrideImageType, idempotencyKey },
  );
}

export async function createBook(book: Book) {
  return postJson<Book>('/books', book);
}

export async function createChapter(chapter: Chapter) {
  return postJson<Chapter>('/chapters', chapter);
}

export async function importBook(book: Book, chapters: Chapter[]) {
  return postJson<{ book: Book }>('/books/import', { book, chapters });
}

export async function submitChapterGenerationTask(chapterId: string) {
  return postJson<GenerationTask>(`/chapters/${encodeURIComponent(chapterId)}/generation-task`, {});
}

export async function retryGenerationTask(taskId: string) {
  return postJson<GenerationTask>(`/generation-tasks/${encodeURIComponent(taskId)}/retry`, {});
}

export async function createSceneImage(sceneImage: SceneImage) {
  return postJson<SceneImage>('/scene-images', {
    ...sceneImage,
    imagePath: sceneImage.imagePath ?? sceneImage.imageUrl,
  });
}

export async function deleteBook(bookId: string) {
  return deleteJson<{ deleted: true; bookId: string }>(`/books/${encodeURIComponent(bookId)}`);
}
