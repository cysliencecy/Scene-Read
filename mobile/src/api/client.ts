import type { Book, Chapter, GenerationTask, SceneCandidate, SceneImage } from '../types/app';

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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}`);
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
    throw new Error(`API ${path} failed with ${response.status}`);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}`);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

export async function fetchBooks() {
  return getJson<Book[]>('/books');
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
