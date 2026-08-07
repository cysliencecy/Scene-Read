import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

export type ParsedOnlineChapter = {
  title: string;
  paragraphs: string[];
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

const ensureArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));

const stripHtml = (html: string) =>
  decodeHtmlEntities(
    html
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|section|article|blockquote|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const stripGutenbergBoilerplate = (text: string) => {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  const startMatch = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(normalized);
  const afterStart = startMatch ? normalized.slice((startMatch.index ?? 0) + startMatch[0].length) : normalized;
  const endMatch = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(afterStart);
  return (endMatch ? afterStart.slice(0, endMatch.index) : afterStart).trim();
};

const splitParagraphs = (text: string) =>
  text
    .split(/\n{1,}/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const cleanTitle = (value: string | undefined, index: number) => {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 120) : `第${index + 1}章`;
};

const extractHtmlTitle = (html: string, index: number) => {
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)?.[1];
  const title = heading ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return cleanTitle(title ? stripHtml(title) : undefined, index);
};

const extractReadingTitle = (headingHtml: string) => {
  const heading = stripHtml(headingHtml).replace(/\s+/g, ' ').trim();
  const englishChapter = /\b(?:CHAPTER|BOOK|PART)[ \t]*(?:\d+|[IVXLCDM]+)(?:[.: \t-][^\n]*)?$/i.exec(heading);
  if (englishChapter) return englishChapter[0].trim().replace(/^(CHAPTER|BOOK|PART)\s*/i, '$1 ');
  const englishFrontMatter = /\b(PREFACE|FOREWORD|INTRODUCTION|PROLOGUE)\.?$/i.exec(heading);
  if (englishFrontMatter) return englishFrontMatter[1].toUpperCase();
  const chinese = /(?:第[一-龥\d]+章[^\n]*|序言|前言|楔子)$/.exec(heading);
  return chinese?.[0]?.trim();
};

const splitHtmlReadingSections = (html: string): ParsedOnlineChapter[] => {
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].flatMap((match) => {
    const title = extractReadingTitle(match[1]);
    return title && match.index !== undefined
      ? [{ title, start: match.index + match[0].length, headingStart: match.index }]
      : [];
  });

  return headings.flatMap((heading, index) => {
    const end = headings[index + 1]?.headingStart ?? html.length;
    const paragraphs = splitParagraphs(stripGutenbergBoilerplate(stripHtml(html.slice(heading.start, end))));
    return paragraphs.length > 0 ? [{ title: heading.title, paragraphs }] : [];
  });
};

const getOpfPath = async (zip: JSZip) => {
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('ONLINE_BOOK_EPUB_INVALID');

  const container = xmlParser.parse(containerXml) as {
    container?: { rootfiles?: { rootfile?: { 'full-path'?: string } | Array<{ 'full-path'?: string }> } };
  };
  const rootfiles = ensureArray(container.container?.rootfiles?.rootfile);
  const opfPath = rootfiles[0]?.['full-path'];
  if (!opfPath) throw new Error('ONLINE_BOOK_EPUB_INVALID');
  return opfPath;
};

const resolveZipPath = (directory: string, href: string) => {
  const parts = `${directory}${href.split('#')[0]}`.split('/');
  const resolved: string[] = [];
  parts.forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  });
  return resolved.join('/');
};

const isNonReadingDocument = (item: { id?: string; href?: string; properties?: string }) => {
  if (item.properties?.split(/\s+/).includes('nav')) return true;
  const id = item.id ?? '';
  if (/^(?:cover(?:page)?|toc|contents?|copyright|colophon)(?:[-_.]|$)/i.test(id)) return true;
  return /(^|[-_.\s])(cover|toc|contents?|copyright|colophon)([-_.\s]|$)/i.test(item.href ?? '');
};

export async function parseOnlineEpub(content: Uint8Array): Promise<ParsedOnlineChapter[]> {
  const zip = await JSZip.loadAsync(content);
  const opfPath = await getOpfPath(zip);
  const opfXml = await zip.file(opfPath)?.async('string');
  if (!opfXml) throw new Error('ONLINE_BOOK_EPUB_INVALID');

  const opfDirectory = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = xmlParser.parse(opfXml) as {
    package?: {
      manifest?: {
        item?: Array<{ id?: string; href?: string; 'media-type'?: string; properties?: string }> | {
          id?: string;
          href?: string;
          'media-type'?: string;
          properties?: string;
        };
      };
      spine?: { itemref?: Array<{ idref?: string; linear?: string }> | { idref?: string; linear?: string } };
    };
  };
  const manifest = ensureArray(opf.package?.manifest?.item);
  const spine = ensureArray(opf.package?.spine?.itemref);
  const chapters: ParsedOnlineChapter[] = [];

  for (const itemref of spine) {
    const item = manifest.find((entry) => entry.id === itemref.idref);
    if (
      itemref.linear === 'no' ||
      !item?.href ||
      !item['media-type']?.includes('html') ||
      isNonReadingDocument(item)
    ) {
      continue;
    }

    const path = resolveZipPath(opfDirectory, item.href);
    const file = zip.file(path) ?? zip.file(decodeURI(path));
    const html = await file?.async('string');
    if (!html) continue;

    const readingSections = splitHtmlReadingSections(html);
    if (readingSections.length > 0) {
      chapters.push(...readingSections);
      continue;
    }

    const paragraphs = splitParagraphs(stripGutenbergBoilerplate(stripHtml(html)));
    if (paragraphs.length > 0) chapters.push({ title: extractHtmlTitle(html, chapters.length), paragraphs });
  }

  if (chapters.length === 0) throw new Error('ONLINE_BOOK_HAS_NO_READABLE_TEXT');
  return chapters;
}

const chapterHeadingPattern = /^(?:(?:CHAPTER|BOOK|PART)[ \t]*(?:\d+|[IVXLCDM]+)(?:[.: \t-][^\n]*)?|PREFACE|FOREWORD|INTRODUCTION|PROLOGUE)$|^(?:第[一-龥\d]+章[^\n]*|序言|前言|楔子)$/gim;

export function parseOnlineText(content: string): ParsedOnlineChapter[] {
  const text = stripGutenbergBoilerplate(content);
  const matches = [...text.matchAll(chapterHeadingPattern)];

  if (matches.length === 0) {
    const paragraphs = splitParagraphs(text);
    if (paragraphs.length === 0) throw new Error('ONLINE_BOOK_HAS_NO_READABLE_TEXT');
    return [{ title: '第1章', paragraphs }];
  }

  const chapters = matches.flatMap((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    const section = text.slice(start + match[0].length, end).trim();
    const paragraphs = splitParagraphs(section);
    return paragraphs.length > 0 ? [{ title: cleanTitle(match[0], index), paragraphs }] : [];
  });

  if (chapters.length === 0) throw new Error('ONLINE_BOOK_HAS_NO_READABLE_TEXT');
  return chapters;
}
