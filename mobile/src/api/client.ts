import type { Book, Chapter, GenerationTask, SceneImage } from '../types/app';

const API_BASE_URL = 'http://localhost:4000';

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

export async function fetchBooks() {
  return getJson<Book[]>('/books');
}

export async function fetchChapter(chapterId: string) {
  return getJson<Chapter>(`/chapters/${chapterId}`);
}

export async function fetchGenerationTasks() {
  return getJson<GenerationTask[]>('/generation-tasks');
}

export async function fetchSceneImages() {
  return getJson<SceneImage[]>('/scene-images');
}
