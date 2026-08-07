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

const sourcePriority = { wikisource: 0, gutenberg: 1 } as const;

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
