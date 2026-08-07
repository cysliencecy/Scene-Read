import {
  downloadGutendexBookContent,
  downloadGutendexCover,
  getGutendexBook,
  OnlineBookError,
  searchGutendex,
} from './gutendex.js';
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
import type { Book, Chapter, OnlineBookImportResult, VisualStyle } from './types.js';

export async function searchOnlineBooks(query: string, page: number) {
  const result = await searchGutendex(query, page);
  try {
    const importedIds = await findImportedBookIds(
      'gutenberg',
      result.items.map((item) => item.sourceBookId),
    );
    return {
      ...result,
      items: result.items.map((item) => ({ ...item, importedBookId: importedIds.get(item.sourceBookId) })),
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
