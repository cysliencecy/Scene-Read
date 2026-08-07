import type { BookCopyrightStatus, OnlineBook, OnlineBookSearchPage } from './types.js';

const DEFAULT_GUTENDEX_BASE_URL = 'https://gutendex.com';
const SEARCH_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
export const MAX_ONLINE_BOOK_BYTES = 20 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

type GutendexPerson = { name?: string };

export type GutendexBook = {
  id?: number;
  title?: string;
  authors?: GutendexPerson[];
  languages?: string[];
  copyright?: boolean | null;
  download_count?: number;
  formats?: Record<string, string>;
};

type GutendexPage = {
  count?: number;
  next?: string | null;
  results?: GutendexBook[];
};

export class OnlineBookError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
  }
}

const baseUrl = () => (process.env.GUTENDEX_BASE_URL ?? DEFAULT_GUTENDEX_BASE_URL).replace(/\/+$/, '');

const fetchWithTimeout = (url: string, timeoutMs: number, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });

const copyrightStatus = (value: boolean | null | undefined): BookCopyrightStatus => {
  if (value === false) return 'public_domain';
  if (value === true) return 'authorized';
  return 'unknown';
};

const coverUrl = (formats: Record<string, string>) => formats['image/jpeg'];

const hasSupportedFormat = (formats: Record<string, string>) =>
  Boolean(formats['application/epub+zip'] || formats['text/plain; charset=utf-8']);

export function normalizeGutendexBook(book: GutendexBook): OnlineBook | null {
  if (!Number.isInteger(book.id) || !book.title?.trim()) return null;
  const id = String(book.id);
  const formats = book.formats ?? {};
  return {
    source: 'gutenberg',
    sourceBookId: id,
    title: book.title.trim(),
    authors: (book.authors ?? []).flatMap((author) => (author.name?.trim() ? [author.name.trim()] : [])),
    languages: (book.languages ?? []).filter(Boolean),
    coverUrl: coverUrl(formats),
    sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
    copyrightStatus: copyrightStatus(book.copyright),
    downloadCount: Math.max(0, book.download_count ?? 0),
    canImport: hasSupportedFormat(formats),
  };
}

const readJson = async <T>(url: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, SEARCH_TIMEOUT_MS, {
      headers: { Accept: 'application/json', 'User-Agent': 'SceneReader/0.1' },
    });
  } catch (error) {
    throw new OnlineBookError('BOOK_SOURCE_UNAVAILABLE', 502, error instanceof Error ? error.message : undefined);
  }
  if (!response.ok) {
    throw new OnlineBookError(response.status === 404 ? 'ONLINE_BOOK_NOT_FOUND' : 'BOOK_SOURCE_UNAVAILABLE', response.status === 404 ? 404 : 502);
  }
  return (await response.json()) as T;
};

export async function searchGutendex(query: string, page: number): Promise<OnlineBookSearchPage> {
  const url = new URL(`${baseUrl()}/books/`);
  url.searchParams.set('search', query);
  url.searchParams.set('page', String(page));
  const payload = await readJson<GutendexPage>(url.toString());
  return {
    items: (payload.results ?? []).flatMap((book) => {
      const normalized = normalizeGutendexBook(book);
      return normalized ? [normalized] : [];
    }),
    page,
    total: Math.max(0, payload.count ?? 0),
    hasNextPage: Boolean(payload.next),
  };
}

export async function getGutendexBook(sourceBookId: string) {
  if (!/^\d+$/.test(sourceBookId)) throw new OnlineBookError('INVALID_SOURCE_BOOK_ID', 400);
  const raw = await readJson<GutendexBook>(`${baseUrl()}/books/${encodeURIComponent(sourceBookId)}`);
  const book = normalizeGutendexBook(raw);
  if (!book) throw new OnlineBookError('ONLINE_BOOK_NOT_FOUND', 404);
  return { raw, book };
}

const isAllowedGutenbergUrl = (url: string) => {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && (parsed.hostname === 'gutenberg.org' || parsed.hostname.endsWith('.gutenberg.org'));
};

const download = async (url: string, limit: number, allowNotFound = false): Promise<Uint8Array | null> => {
  if (!isAllowedGutenbergUrl(url)) throw new OnlineBookError('BOOK_SOURCE_URL_REJECTED', 502);
  let response: Response;
  try {
    response = await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS, {
      redirect: 'follow',
      headers: { 'User-Agent': 'SceneReader/0.1' },
    });
  } catch (error) {
    throw new OnlineBookError('BOOK_DOWNLOAD_FAILED', 502, error instanceof Error ? error.message : undefined);
  }
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok || !isAllowedGutenbergUrl(response.url)) {
    throw new OnlineBookError('BOOK_DOWNLOAD_FAILED', 502);
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > limit) throw new OnlineBookError('BOOK_DOWNLOAD_TOO_LARGE', 413);
  if (!response.body) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new OnlineBookError('BOOK_DOWNLOAD_TOO_LARGE', 413);
    }
    chunks.push(value);
  }

  const content = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return content;
};

export type DownloadedBookContent = { kind: 'epub' | 'txt'; bytes: Uint8Array };

export async function downloadGutendexBookContent(raw: GutendexBook): Promise<DownloadedBookContent> {
  const id = String(raw.id ?? '');
  const formats = raw.formats ?? {};
  if (formats['application/epub+zip']) {
    const noImagesUrl = `https://www.gutenberg.org/ebooks/${id}.epub.noimages`;
    const noImages = await download(noImagesUrl, MAX_ONLINE_BOOK_BYTES, true);
    if (noImages) return { kind: 'epub', bytes: noImages };

    const epub = await download(formats['application/epub+zip'], MAX_ONLINE_BOOK_BYTES);
    if (epub) return { kind: 'epub', bytes: epub };
  }

  const textUrl = formats['text/plain; charset=utf-8'];
  if (textUrl) {
    const text = await download(textUrl, MAX_ONLINE_BOOK_BYTES);
    if (text) return { kind: 'txt', bytes: text };
  }
  throw new OnlineBookError('ONLINE_BOOK_FORMAT_UNSUPPORTED', 422);
}

export async function downloadGutendexCover(url: string | undefined) {
  if (!url) return null;
  try {
    return await download(url, MAX_COVER_BYTES);
  } catch {
    return null;
  }
}
