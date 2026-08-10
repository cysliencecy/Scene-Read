import {
  createGutendexProvider,
  downloadGutendexBookContent,
  downloadGutendexCover,
  getGutendexBook,
} from './gutendex.js';
import {
  normalizeOnlineBookProviderError,
  OnlineBookError,
  OnlineBookProviderRegistry,
} from './onlineBookProvider.js';
import type { OnlineBookProvider } from './onlineBookProvider.js';
import { parseOnlineEpub, parseOnlineText } from './onlineBookParser.js';
import {
  findBookBySource,
  findImportedBookIds,
  importOnlineBook as persistOnlineBook,
  listChaptersByBook,
  removeBookCover,
  uploadBookCover,
} from './repository.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import type { Book, Chapter, OnlineBookImportResult, OnlineBookSearchPage, VisualStyle } from './types.js';
import {
  discoverWikisourceChapters,
  fetchWikisourceChapterContents,
  resolveWikisourceRoot,
  WIKISOURCE_SOURCE_ATTRIBUTION,
} from './wikisource.js';
import type { WikisourceClientOptions } from './wikisource.js';

const sourcePriority = { wikisource: 0, gutenberg: 1 } as const;
const MAX_WIKISOURCE_BODY_BYTES = 20 * 1024 * 1024;

export async function aggregateOnlineBookSearch(
  providers: OnlineBookProvider[],
  query: string,
  page: number,
): Promise<OnlineBookSearchPage> {
  const settled = await Promise.allSettled(providers.map((provider) => provider.search(query, page)));
  const successful = settled.flatMap((result, index) => result.status === 'fulfilled'
    ? [{ provider: providers[index], page: result.value }]
    : []);

  if (successful.length === 0) {
    throw new OnlineBookError('BOOK_SOURCE_UNAVAILABLE', 502);
  }

  successful.sort((left, right) => sourcePriority[left.provider.source] - sourcePriority[right.provider.source]);
  const sourceErrors = settled.flatMap((result, index) => result.status === 'rejected'
    ? [normalizeOnlineBookProviderError(providers[index].source, result.reason)]
    : []);

  return {
    items: successful.flatMap((result) => result.page.items),
    page,
    total: successful.reduce((total, result) => total + result.page.total, 0),
    hasNextPage: successful.some((result) => result.page.hasNextPage),
    sourceErrors,
  };
}

export const onlineBookProviderRegistry = new OnlineBookProviderRegistry();

export async function searchOnlineBooks(query: string, page: number) {
  const result = await aggregateOnlineBookSearch(onlineBookProviderRegistry.list(), query, page);
  try {
    const sources = [...new Set(result.items.map((item) => item.source))];
    const importedIdsBySource = new Map(await Promise.all(sources.map(async (source) => [
      source,
      await findImportedBookIds(
        source,
        result.items.filter((item) => item.source === source).map((item) => item.sourceBookId),
      ),
    ] as const)));
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        importedBookId: importedIdsBySource.get(item.source)?.get(item.sourceBookId),
      })),
    };
  } catch {
    return result;
  }
}

const buildChapters = (
  bookId: string,
  parsed: Array<{ title: string; paragraphs: string[] }>,
): Chapter[] =>
  parsed.map((chapter, chapterIndex) => {
    const chapterId = `${bookId}-chapter-${chapterIndex + 1}`;
    return {
      id: chapterId,
      bookId,
      title: chapter.title,
      progress: 0,
      blocks: chapter.paragraphs.map((text, paragraphIndex) => ({
        id: `${chapterId}-p-${paragraphIndex + 1}`,
        type: 'paragraph' as const,
        text,
      })),
    };
  });

export async function prepareWikisourceImport(
  sourceBookId: string,
  visualStyle: VisualStyle,
  options: WikisourceClientOptions = {},
): Promise<{ book: Book; chapters: Chapter[] }> {
  const root = await resolveWikisourceRoot(sourceBookId, options);
  const descriptors = await discoverWikisourceChapters(root.sourceTitle, options);
  if (descriptors.length === 0) throw new OnlineBookError('ONLINE_BOOK_HAS_NO_CHAPTERS', 422);

  const content = await fetchWikisourceChapterContents(descriptors, options);
  const readableContent = content.filter((chapter) => chapter.paragraphs.length > 0);
  if (readableContent.length === 0) {
    throw new OnlineBookError('ONLINE_BOOK_HAS_NO_READABLE_TEXT', 422);
  }

  let bodyBytes = 0;
  for (const chapter of readableContent) {
    for (const paragraph of chapter.paragraphs) {
      bodyBytes += Buffer.byteLength(paragraph, 'utf8');
      if (bodyBytes > MAX_WIKISOURCE_BODY_BYTES) {
        throw new OnlineBookError('BOOK_DOWNLOAD_TOO_LARGE', 413);
      }
    }
  }

  const bookId = `import-wikisource-${root.pageId}`;
  const chapters = readableContent.map((chapter): Chapter => {
    const chapterId = `${bookId}-chapter-${chapter.order}`;
    return {
      id: chapterId,
      bookId,
      title: chapter.displayTitle,
      progress: 0,
      blocks: chapter.paragraphs.map((text, paragraphIndex) => ({
        id: `${chapterId}-p-${paragraphIndex + 1}`,
        type: 'paragraph',
        text,
      })),
    };
  });
  const book: Book = {
    id: bookId,
    title: root.displayTitle,
    progress: '新导入',
    accent: '#426f76',
    currentChapterId: chapters[0].id,
    lastReadLabel: '准备开始第一章',
    visualStyle,
    authors: [],
    languages: ['zh'],
    source: 'wikisource',
    sourceBookId: String(root.pageId),
    sourceUrl: root.sourceUrl,
    sourceAttribution: WIKISOURCE_SOURCE_ATTRIBUTION,
    copyrightStatus: 'authorized',
  };
  return { book, chapters };
}

export async function importGutendexBook(
  sourceBookId: string,
  visualStyle: VisualStyle,
): Promise<OnlineBookImportResult> {
  if (!isSupabaseConfigured) throw new OnlineBookError('SUPABASE_NOT_CONFIGURED', 503);

  const existing = await findBookBySource('gutenberg', sourceBookId);
  if (existing) {
    return { book: existing, chapters: await listChaptersByBook(existing.id), alreadyImported: true };
  }

  const { raw, book: metadata } = await getGutendexBook(sourceBookId);
  if (!metadata.canImport) throw new OnlineBookError('ONLINE_BOOK_FORMAT_UNSUPPORTED', 422);
  const downloaded = await downloadGutendexBookContent(raw);
  let parsed: Array<{ title: string; paragraphs: string[] }>;
  try {
    parsed = downloaded.kind === 'epub'
      ? await parseOnlineEpub(downloaded.bytes)
      : parseOnlineText(new TextDecoder('utf-8', { fatal: false }).decode(downloaded.bytes));
  } catch (error) {
    if (error instanceof OnlineBookError) throw error;
    throw new OnlineBookError('ONLINE_BOOK_PARSE_FAILED', 422, error instanceof Error ? error.message : undefined);
  }
  const bookId = `import-gutenberg-${sourceBookId}`;
  const chapters = buildChapters(bookId, parsed);
  if (chapters.length === 0) throw new OnlineBookError('ONLINE_BOOK_HAS_NO_READABLE_TEXT', 422);

  const importedBook: Book = {
    id: bookId,
    title: metadata.title,
    progress: '新导入',
    accent: '#426f76',
    currentChapterId: chapters[0].id,
    lastReadLabel: '准备开始第一章',
    visualStyle,
    authors: metadata.authors,
    languages: metadata.languages,
    source: 'gutenberg',
    sourceBookId,
    sourceUrl: metadata.sourceUrl,
    copyrightStatus: metadata.copyrightStatus,
  };

  const coverPath = `gutenberg/${sourceBookId}.jpg`;
  const coverBytes = await downloadGutendexCover(metadata.coverUrl);
  let uploadedCoverPath: string | null = null;
  if (coverBytes) {
    try {
      uploadedCoverPath = await uploadBookCover(coverPath, coverBytes);
    } catch {
      uploadedCoverPath = null;
    }
  }

  try {
    const book = await persistOnlineBook({ book: importedBook, coverPath: uploadedCoverPath, chapters });
    return { book, chapters: await listChaptersByBook(book.id), alreadyImported: false };
  } catch (error) {
    const racedExisting = await findBookBySource('gutenberg', sourceBookId).catch(() => null);
    if (racedExisting) {
      return {
        book: racedExisting,
        chapters: await listChaptersByBook(racedExisting.id),
        alreadyImported: true,
      };
    }
    if (uploadedCoverPath) await removeBookCover(uploadedCoverPath);
    throw error;
  }
}

onlineBookProviderRegistry.register(createGutendexProvider(importGutendexBook));
