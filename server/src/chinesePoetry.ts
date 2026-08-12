import { externalFetch } from './httpClient.js';
import { OnlineBookError } from './onlineBookProvider.js';
import type { OnlineBookProvider } from './onlineBookProvider.js';
import { findBookBySource, importOnlineBook, listChaptersByBook } from './repository.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import type { Book, Chapter, OnlineBook, OnlineBookImportResult, VisualStyle } from './types.js';

export const CHINESE_POETRY_COMMIT = 'b8594f81a89752241442f2ce267d6f66f96704ee';
export const CHINESE_POETRY_ATTRIBUTION =
  `数据来源：chinese-poetry/chinese-poetry（MIT License）；快照提交：${CHINESE_POETRY_COMMIT}`;
const MAX_BOOK_BYTES = 20 * 1024 * 1024;
const MAX_CHAPTERS = 200;

type CatalogEntry = {
  id: string;
  title: string;
  authors: string[];
  keywords: string[];
  path: string;
  format: 'poems' | 'aphorisms' | 'classic';
};

export const CHINESE_POETRY_CATALOG: CatalogEntry[] = [
  { id: 'caocao', title: '曹操诗集', authors: ['曹操'], keywords: ['古诗', '魏晋', '短歌行', '观沧海'], path: '曹操诗集/caocao.json', format: 'poems' },
  { id: 'youmengying', title: '幽梦影', authors: ['张潮'], keywords: ['清代', '随笔', '小品'], path: '幽梦影/youmengying.json', format: 'aphorisms' },
  { id: 'daxue', title: '大学', authors: [], keywords: ['四书五经', '儒家', '古籍'], path: '四书五经/daxue.json', format: 'classic' },
  { id: 'mengzi', title: '孟子', authors: ['孟子'], keywords: ['四书五经', '儒家', '古籍'], path: '四书五经/mengzi.json', format: 'classic' },
  { id: 'zhongyong', title: '中庸', authors: [], keywords: ['四书五经', '儒家', '古籍'], path: '四书五经/zhongyong.json', format: 'classic' },
];

const rawUrl = (entry: CatalogEntry) =>
  `https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/${CHINESE_POETRY_COMMIT}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
const sourceUrl = (entry: CatalogEntry) =>
  `https://github.com/chinese-poetry/chinese-poetry/blob/${CHINESE_POETRY_COMMIT}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;

const toOnlineBook = (entry: CatalogEntry): OnlineBook => ({
  source: 'chinese_poetry',
  sourceBookId: entry.id,
  title: entry.title,
  authors: entry.authors,
  languages: ['zh'],
  sourceUrl: sourceUrl(entry),
  sourceAttribution: CHINESE_POETRY_ATTRIBUTION,
  copyrightStatus: 'authorized',
  downloadCount: 0,
  canImport: true,
});

export async function searchChinesePoetry(query: string, page: number) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  const items = page === 1 && normalized
    ? CHINESE_POETRY_CATALOG.filter((entry) =>
      [entry.title, ...entry.authors, ...entry.keywords].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized)),
    ).map(toOnlineBook)
    : [];
  return { items, page, total: items.length, hasNextPage: false, sourceErrors: [] };
}

function chapter(bookId: string, index: number, title: string, paragraphs: string[]): Chapter {
  const chapterId = `${bookId}-chapter-${index + 1}`;
  return {
    id: chapterId,
    bookId,
    title,
    progress: 0,
    blocks: paragraphs.filter((text) => text.trim()).map((text, paragraphIndex) => ({
      id: `${chapterId}-p-${paragraphIndex + 1}`,
      type: 'paragraph',
      text: text.trim(),
    })),
  };
}

export function parseChinesePoetryBook(entry: CatalogEntry, payload: unknown, bookId: string): Chapter[] {
  if (entry.format === 'poems') {
    if (!Array.isArray(payload)) throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422);
    return payload.map((item, index) => {
      const row = item as { title?: unknown; paragraphs?: unknown };
      if (typeof row.title !== 'string' || !Array.isArray(row.paragraphs) || !row.paragraphs.every((text) => typeof text === 'string')) {
        throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422);
      }
      return chapter(bookId, index, row.title, row.paragraphs);
    });
  }

  if (entry.format === 'aphorisms') {
    if (!Array.isArray(payload)) throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422);
    const rows = payload.map((item) => {
      const row = item as { content?: unknown; comment?: unknown };
      if (typeof row.content !== 'string' || !Array.isArray(row.comment) || !row.comment.every((text) => typeof text === 'string')) {
        throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422);
      }
      return [row.content, ...row.comment];
    });
    const chapters: Chapter[] = [];
    for (let offset = 0; offset < rows.length; offset += 10) {
      const end = Math.min(offset + 10, rows.length);
      chapters.push(chapter(bookId, chapters.length, `第 ${offset + 1}–${end} 则`, rows.slice(offset, end).flat()));
    }
    return chapters;
  }

  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.map((item, index) => {
    const row = item as { chapter?: unknown; paragraphs?: unknown };
    if (typeof row.chapter !== 'string' || !Array.isArray(row.paragraphs) || !row.paragraphs.every((text) => typeof text === 'string')) {
      throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422);
    }
    return chapter(bookId, index, row.chapter, row.paragraphs);
  });
}

async function downloadCatalogEntry(entry: CatalogEntry, fetchImpl: typeof fetch = externalFetch) {
  let response: Response;
  try {
    response = await fetchImpl(rawUrl(entry), {
      headers: { Accept: 'application/json', 'User-Agent': 'SceneReader/0.1' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new OnlineBookError('BOOK_DOWNLOAD_FAILED', 502, error instanceof Error ? error.message : undefined);
  }
  if (!response.ok) throw new OnlineBookError(response.status === 404 ? 'ONLINE_BOOK_NOT_FOUND' : 'BOOK_DOWNLOAD_FAILED', response.status === 404 ? 404 : 502);
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BOOK_BYTES) throw new OnlineBookError('BOOK_DOWNLOAD_TOO_LARGE', 413);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BOOK_BYTES) throw new OnlineBookError('BOOK_DOWNLOAD_TOO_LARGE', 413);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422);
  }
}

export async function importChinesePoetryBook(
  sourceBookId: string,
  visualStyle: VisualStyle,
  fetchImpl: typeof fetch = externalFetch,
): Promise<OnlineBookImportResult> {
  if (!isSupabaseConfigured) throw new OnlineBookError('SUPABASE_NOT_CONFIGURED', 503);
  const entry = CHINESE_POETRY_CATALOG.find((candidate) => candidate.id === sourceBookId);
  if (!entry) throw new OnlineBookError('ONLINE_BOOK_NOT_FOUND', 404);
  const existing = await findBookBySource('chinese_poetry', entry.id);
  if (existing) return { book: existing, chapters: await listChaptersByBook(existing.id), alreadyImported: true };

  const bookId = `import-chinese-poetry-${entry.id}`;
  const chapters = parseChinesePoetryBook(entry, await downloadCatalogEntry(entry, fetchImpl), bookId)
    .filter((item) => item.blocks.length > 0);
  if (chapters.length === 0) throw new OnlineBookError('ONLINE_BOOK_HAS_NO_READABLE_TEXT', 422);
  if (chapters.length > MAX_CHAPTERS) throw new OnlineBookError('ONLINE_BOOK_TOO_MANY_CHAPTERS', 422);
  const metadata = toOnlineBook(entry);
  const book: Book = {
    ...metadata,
    id: bookId,
    progress: '新导入',
    accent: '#66513c',
    currentChapterId: chapters[0].id,
    lastReadLabel: '准备开始第一章',
    visualStyle,
  };
  const persisted = await importOnlineBook({ book, coverPath: null, chapters });
  return { book: persisted, chapters: await listChaptersByBook(persisted.id), alreadyImported: false };
}

export const createChinesePoetryProvider = (): OnlineBookProvider => ({
  source: 'chinese_poetry',
  search: searchChinesePoetry,
  importBook: importChinesePoetryBook,
});
