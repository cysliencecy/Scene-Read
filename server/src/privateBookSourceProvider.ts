import { executeSourceStage } from './bookSourceEngine.js';
import { listBookSourceVersions } from './bookSourceRegistry.js';
import { OnlineBookError } from './onlineBookProvider.js';
import type { OnlineBookProvider } from './onlineBookProvider.js';
import { findBookBySource, importOnlineBook, listChaptersByBook } from './repository.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import type { Book, Chapter, OnlineBook, VisualStyle } from './types.js';

const MAX_CHAPTERS = 200;
const MAX_BYTES = 20 * 1024 * 1024;
const key = (sourceId: string, bookId: string) => `${sourceId}::${bookId}`;
const splitKey = (value: string) => {
  const offset = value.indexOf('::');
  if (offset < 1) throw new OnlineBookError('INVALID_SOURCE_BOOK_ID', 400);
  return [value.slice(0, offset), value.slice(offset + 2)] as const;
};

export async function searchPrivateBookSources(query: string, page: number) {
  const sources = (await listBookSourceVersions()).filter((source) => source.enabled && !source.removedAt).slice(0, 5);
  if (sources.length === 0) return { items: [], page, total: 0, hasNextPage: false, sourceErrors: [] };
  const settled = await Promise.allSettled(sources.map(async (source) => {
    const rows = await executeSourceStage(source.config, source.config.search, { query, page: String(page), bookId: '', chapterId: '' });
    return rows.flatMap((row): OnlineBook[] => row.id && row.title ? [{
      source: 'private_json', sourceBookId: key(source.sourceId, row.id), title: row.title,
      authors: row.author ? [row.author] : [], languages: ['zh'], coverUrl: row.coverUrl || undefined,
      sourceUrl: row.sourceUrl || source.config.search.request.url, sourceAttribution: `来源：${source.name}（私有 JSON 书源 ${source.sourceId} v${source.version}）`,
      copyrightStatus: 'unknown', downloadCount: 0, canImport: true,
    }] : []);
  }));
  const items = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (items.length === 0 && settled.every((result) => result.status === 'rejected')) throw new OnlineBookError('BOOK_SOURCE_UNAVAILABLE', 502);
  return { items, page, total: items.length, hasNextPage: false, sourceErrors: [] };
}

export async function importPrivateBook(sourceBookId: string, visualStyle: VisualStyle) {
  if (!isSupabaseConfigured) throw new OnlineBookError('SUPABASE_NOT_CONFIGURED', 503);
  const [sourceId, remoteBookId] = splitKey(sourceBookId);
  const source = (await listBookSourceVersions()).find((item) => item.sourceId === sourceId && item.enabled && !item.removedAt);
  if (!source) throw new OnlineBookError('ONLINE_BOOK_NOT_FOUND', 404);
  const existing = await findBookBySource('private_json', sourceBookId);
  if (existing) return { book: existing, chapters: await listChaptersByBook(existing.id), alreadyImported: true };
  const variables = { query: '', page: '1', bookId: remoteBookId, chapterId: '' };
  const [detail] = await executeSourceStage(source.config, source.config.detail, variables);
  const catalog = await executeSourceStage(source.config, source.config.catalog, variables);
  if (!detail?.title || catalog.length === 0) throw new OnlineBookError('ONLINE_BOOK_HAS_NO_CHAPTERS', 422);
  if (catalog.length > MAX_CHAPTERS) throw new OnlineBookError('ONLINE_BOOK_TOO_MANY_CHAPTERS', 422);
  const bookId = `import-private-${Buffer.from(sourceBookId).toString('base64url')}`;
  let bytes = 0;
  const chapters: Chapter[] = [];
  for (const [index, descriptor] of catalog.entries()) {
    if (!descriptor.id || !descriptor.title) throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422);
    const [content] = await executeSourceStage(source.config, source.config.chapter, { ...variables, chapterId: descriptor.id });
    const paragraphs = (content?.content ?? '').split(/\n+/).map((text) => text.trim()).filter(Boolean);
    bytes += paragraphs.reduce((total, text) => total + Buffer.byteLength(text, 'utf8'), 0);
    if (bytes > MAX_BYTES) throw new OnlineBookError('BOOK_DOWNLOAD_TOO_LARGE', 413);
    const chapterId = `${bookId}-chapter-${index + 1}`;
    chapters.push({ id: chapterId, bookId, title: descriptor.title, progress: 0, blocks: paragraphs.map((text, paragraphIndex) => ({ id: `${chapterId}-p-${paragraphIndex + 1}`, type: 'paragraph', text })) });
  }
  if (!chapters.some((chapter) => chapter.blocks.length > 0)) throw new OnlineBookError('ONLINE_BOOK_HAS_NO_READABLE_TEXT', 422);
  const attribution = `来源：${source.name}（私有 JSON 书源 ${source.sourceId} v${source.version}）；原始地址与许可状态以书源配置为准`;
  const book: Book = {
    id: bookId, title: detail.title, progress: '新导入', accent: '#526b83', currentChapterId: chapters[0].id,
    lastReadLabel: '准备开始第一章', visualStyle, authors: detail.author ? [detail.author] : [], languages: ['zh'],
    source: 'private_json', sourceBookId, sourceUrl: detail.sourceUrl || source.config.detail.request.url,
    sourceAttribution: attribution, copyrightStatus: 'unknown',
  };
  const persisted = await importOnlineBook({ book, coverPath: null, chapters });
  return { book: persisted, chapters: await listChaptersByBook(persisted.id), alreadyImported: false };
}

export const createPrivateBookSourceProvider = (): OnlineBookProvider => ({ source: 'private_json', search: searchPrivateBookSources, importBook: importPrivateBook });
