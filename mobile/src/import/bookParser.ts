import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import type { Book, Chapter } from '../types/app';

export type ImportedBookDraft = {
  book: Book;
  chapters: Chapter[];
  fileName: string;
  fileType: 'TXT' | 'EPUB';
  fileSize?: number;
};

type ParsedChapter = {
  title: string;
  text: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

export const normalizeId = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const splitParagraphs = (text: string) =>
  text
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean);

const guessChapterTitle = (paragraph: string, index: number) => {
  const clean = paragraph.replace(/\s+/g, ' ').trim();
  if (/^(第[一二三四五六七八九十百千万\d]+[章节回卷部篇]|chapter\s+\d+)/i.test(clean)) {
    return clean.slice(0, 32);
  }

  return `第${index + 1}章`;
};

const buildChapter = (bookId: string, title: string, text: string, index: number): Chapter => ({
  id: `${bookId}-chapter-${index + 1}`,
  bookId,
  title,
  progress: 0,
  blocks: splitParagraphs(text).map((paragraph, paragraphIndex) => ({
    id: `${bookId}-chapter-${index + 1}-p-${paragraphIndex + 1}`,
    type: 'paragraph',
    text: paragraph,
  })),
});

export const splitTxtChapters = (text: string): ParsedChapter[] => {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  const chapterMatches = [
    ...normalized.matchAll(/(^|\n)\s*(第[一二三四五六七八九十百千万\d]+[章节回卷部篇][^\n]{0,60})/g),
  ];

  if (chapterMatches.length === 0) {
    return [{ title: '第1章', text: normalized }];
  }

  return chapterMatches.map((match, index) => {
    const start = match.index ? match.index + match[0].length : match[0].length;
    const end = chapterMatches[index + 1]?.index ?? normalized.length;
    const title = match[2].trim() || `第${index + 1}章`;
    const body = normalized.slice(start, end).trim();

    return {
      title,
      text: body || title,
    };
  });
};

const getOpfPath = async (zip: JSZip) => {
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) {
    throw new Error('EPUB 缺少 META-INF/container.xml');
  }

  const container = parser.parse(containerXml) as {
    container?: { rootfiles?: { rootfile?: { 'full-path'?: string } | Array<{ 'full-path'?: string }> } };
  };
  const rootfile = container.container?.rootfiles?.rootfile;
  const firstRootfile = Array.isArray(rootfile) ? rootfile[0] : rootfile;
  const fullPath = firstRootfile?.['full-path'];

  if (!fullPath) {
    throw new Error('EPUB 无法定位 OPF 文件');
  }

  return fullPath;
};

const ensureArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

export const parseEpubChapters = async (base64Content: string): Promise<{ title?: string; chapters: ParsedChapter[] }> => {
  const zip = await JSZip.loadAsync(base64Content, { base64: true });
  const opfPath = await getOpfPath(zip);
  const opfXml = await zip.file(opfPath)?.async('string');
  if (!opfXml) {
    throw new Error('EPUB 无法读取 OPF 文件');
  }

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = parser.parse(opfXml) as {
    package?: {
      metadata?: { title?: string | { '#text'?: string } };
      manifest?: {
        item?: Array<{ id?: string; href?: string; 'media-type'?: string }> | { id?: string; href?: string; 'media-type'?: string };
      };
      spine?: { itemref?: Array<{ idref?: string }> | { idref?: string } };
    };
  };

  const manifest = ensureArray(opf.package?.manifest?.item);
  const spine = ensureArray(opf.package?.spine?.itemref);
  const titleValue = opf.package?.metadata?.title;
  const title = typeof titleValue === 'string' ? titleValue : titleValue?.['#text'];

  const documents = await Promise.all(
    spine.map(async (itemref) => {
      const item = manifest.find((entry) => entry.id === itemref.idref);
      if (!item?.href || !item['media-type']?.includes('html')) return null;

      const path = `${opfDir}${item.href}`.replace(/\/\.\//g, '/');
      const file = zip.file(decodeURI(path)) ?? zip.file(path);
      const html = await file?.async('string');
      if (!html) return null;

      return stripHtml(html);
    }),
  );

  const chapters = documents
    .filter((text): text is string => Boolean(text && text.trim().length > 0))
    .map((text, index) => ({
      title: guessChapterTitle(splitParagraphs(text)[0] ?? '', index),
      text,
    }));

  if (chapters.length === 0) {
    throw new Error('EPUB 没有可读取的正文');
  }

  return { title, chapters };
};

export function buildImportedBookDraft({
  fileName,
  fileSize,
  fileType,
  parsedTitle,
  parsedChapters,
}: {
  fileName: string;
  fileSize?: number;
  fileType: 'TXT' | 'EPUB';
  parsedTitle?: string;
  parsedChapters: ParsedChapter[];
}): ImportedBookDraft {
  const bookId = `import-${normalizeId(fileName) || Date.now().toString(36)}`;
  const chapters = parsedChapters.map((chapter, index) =>
    buildChapter(bookId, chapter.title, chapter.text, index),
  );

  if (chapters.length === 0 || chapters[0].blocks.length === 0) {
    throw new Error('没有读取到可阅读的正文，请换一本 TXT 或 EPUB。');
  }

  return {
    book: {
      id: bookId,
      title: parsedTitle?.trim() || fileName.replace(/\.[^.]+$/, ''),
      progress: '新导入',
      accent: fileType === 'EPUB' ? '#426f76' : '#526b83',
      currentChapterId: chapters[0].id,
      lastReadLabel: '准备开始第一章',
    },
    chapters,
    fileName,
    fileType,
    fileSize,
  };
}
