import { OnlineBookError } from './onlineBookProvider.js';
import type { OnlineBookProvider } from './onlineBookProvider.js';
import type { OnlineBookSearchPage } from './types.js';

const DEFAULT_WIKISOURCE_API_URL = 'https://zh.wikisource.org/w/api.php';
const WIKISOURCE_HOSTNAME = 'zh.wikisource.org';
const SEARCH_PAGE_SIZE = 20;
const MAX_CHAPTERS = 200;
const EXTRACT_BATCH_SIZE = 20;
const MAX_EXTRACT_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 15_000;
export const WIKISOURCE_SOURCE_ATTRIBUTION = '来源：中文维基文库；作品版权与许可状态以来源页标注为准';

export type WikisourceClientOptions = {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
};

type MediaWikiSearchHit = {
  ns?: number;
  pageid?: number;
  title?: string;
};

type MediaWikiSearchResponse = {
  continue?: { sroffset?: number };
  query?: {
    searchinfo?: { totalhits?: number };
    search?: MediaWikiSearchHit[];
  };
};

type MediaWikiPage = {
  pageid?: number;
  ns?: number;
  title?: string;
  canonicalurl?: string;
  fullurl?: string;
  varianttitles?: Record<string, string>;
  extract?: string;
  missing?: boolean;
};

type MediaWikiRootResponse = {
  query?: {
    pages?: MediaWikiPage[];
  };
};

type MediaWikiAllPagesResponse = {
  continue?: { apcontinue?: string };
  query?: {
    allpages?: MediaWikiPage[];
  };
};

type MediaWikiExtractsResponse = {
  query?: {
    pages?: MediaWikiPage[];
  };
};

export type WikisourceRootDescriptor = {
  pageId: number;
  sourceTitle: string;
  displayTitle: string;
  sourceUrl: string;
};

export type WikisourceChapterDescriptor = {
  pageId: number;
  sourceTitle: string;
  displayTitle: string;
  order: number;
};

export type WikisourceChapterContent = {
  pageId: number;
  displayTitle: string;
  order: number;
  paragraphs: string[];
};

type ClassifiedChapter = Omit<WikisourceChapterDescriptor, 'order'> & {
  category: number;
  sequence: number;
  normalizedTitle: string;
};

export function validateWikisourceApiUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OnlineBookError('BOOK_SOURCE_URL_REJECTED', 500);
  }

  if (
    url.protocol !== 'https:'
    || url.hostname !== WIKISOURCE_HOSTNAME
    || url.port !== ''
    || url.pathname !== '/w/api.php'
    || url.username
    || url.password
  ) {
    throw new OnlineBookError('BOOK_SOURCE_URL_REJECTED', 500);
  }
  return url;
}

const configuredApiUrl = (options: WikisourceClientOptions) =>
  validateWikisourceApiUrl(options.apiUrl ?? process.env.WIKISOURCE_API_URL ?? DEFAULT_WIKISOURCE_API_URL);

async function requestMediaWiki<T>(
  apiUrl: URL,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<T> {
  const url = new URL(apiUrl);
  Object.entries({
    action: 'query',
    format: 'json',
    formatversion: '2',
    variant: 'zh-hans',
    ...params,
  }).forEach(([key, value]) => url.searchParams.set(key, value));

  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SceneReader/0.1',
      },
    });
  } catch (error) {
    if (error instanceof OnlineBookError) throw error;
    throw new OnlineBookError(
      'BOOK_SOURCE_UNAVAILABLE',
      502,
      error instanceof Error ? error.message : undefined,
    );
  }

  if (!response.ok) throw new OnlineBookError('BOOK_SOURCE_UNAVAILABLE', 502);
  try {
    return await response.json() as T;
  } catch (error) {
    throw new OnlineBookError(
      'BOOK_SOURCE_UNAVAILABLE',
      502,
      error instanceof Error ? error.message : undefined,
    );
  }
}

function rootTitleFromSearchHit(hit: MediaWikiSearchHit) {
  if (hit.ns !== 0 || !hit.title?.trim()) return null;
  const [rootTitle] = hit.title.trim().split('/');
  if (!rootTitle?.trim()) return null;
  return rootTitle.trim();
}

function canonicalPageUrl(page: MediaWikiPage) {
  const provided = page.canonicalurl ?? page.fullurl;
  if (provided) {
    try {
      const parsed = new URL(provided);
      if (parsed.protocol === 'https:' && parsed.hostname === WIKISOURCE_HOSTNAME) return parsed.toString();
    } catch {
      // Fall through to the trusted URL constructed from the returned title.
    }
  }
  const title = page.title?.trim().replaceAll(' ', '_') ?? '';
  return `https://${WIKISOURCE_HOSTNAME}/wiki/${encodeURIComponent(title)}`;
}

export async function resolveWikisourceRoot(
  sourceBookId: string,
  options: WikisourceClientOptions = {},
): Promise<WikisourceRootDescriptor> {
  if (!/^\d+$/u.test(sourceBookId)) throw new OnlineBookError('INVALID_SOURCE_BOOK_ID', 400);
  const pageId = Number.parseInt(sourceBookId, 10);
  if (!Number.isSafeInteger(pageId)) throw new OnlineBookError('INVALID_SOURCE_BOOK_ID', 400);

  const apiUrl = configuredApiUrl(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await requestMediaWiki<MediaWikiRootResponse>(apiUrl, {
    prop: 'info',
    inprop: 'url|varianttitles',
    pageids: String(pageId),
  }, fetchImpl);
  const page = response.query?.pages?.find((candidate) => candidate.pageid === pageId);
  if (page?.missing || page?.ns !== 0 || !page?.title?.trim()) {
    throw new OnlineBookError('ONLINE_BOOK_NOT_FOUND', 404);
  }

  return {
    pageId,
    sourceTitle: page.title.trim(),
    displayTitle: page.varianttitles?.['zh-hans']?.trim() || page.title.trim(),
    sourceUrl: canonicalPageUrl(page),
  };
}

const CHINESE_DIGITS: Record<string, number> = {
  '〇': 0,
  '零': 0,
  '一': 1,
  '二': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
};

const CHINESE_UNITS: Record<string, number> = {
  '十': 10,
  '百': 100,
  '千': 1_000,
  '万': 10_000,
};

function parseChapterNumber(value: string) {
  if (/^\d+$/u.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  if (![...value].some((character) => character in CHINESE_UNITS)) {
    const digits = [...value].map((character) => CHINESE_DIGITS[character]);
    if (digits.some((digit) => digit === undefined)) return null;
    const parsed = Number(digits.join(''));
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of value) {
    if (character in CHINESE_DIGITS) {
      digit = CHINESE_DIGITS[character];
      continue;
    }
    const unit = CHINESE_UNITS[character];
    if (!unit) return null;
    if (unit === 10_000) {
      section += digit;
      total += (section || 1) * unit;
      section = 0;
    } else {
      section += (digit || 1) * unit;
    }
    digit = 0;
  }
  const parsed = total + section + digit;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

const AUXILIARY_TITLE_PATTERN = /目录|索引|版本|说明|校勘|序|跋|附录|版权/u;
const NUMBER_TOKEN = '[0-9〇零一二两三四五六七八九十百千万]+';
const PREFIXED_CHAPTER_PATTERN = new RegExp(`^第(${NUMBER_TOKEN})[回章节卷](?:\\s|$)`, 'u');
const NUMBERED_PART_PATTERN = new RegExp(`^[卷篇部](${NUMBER_TOKEN})(?:\\s|$)`, 'u');
const DIRECTIONAL_PART_PATTERN = /^([上中下])[卷篇](?:\s|$)/u;

function classifyChapter(page: MediaWikiPage, rootTitle: string): ClassifiedChapter | null {
  if (page.ns !== 0 || !Number.isInteger(page.pageid) || !page.title) return null;
  const prefix = `${rootTitle}/`;
  if (!page.title.startsWith(prefix)) return null;
  const displayTitle = page.title.slice(prefix.length).trim();
  if (!displayTitle || displayTitle.includes('/') || AUXILIARY_TITLE_PATTERN.test(displayTitle)) return null;

  let category: number;
  let sequence: number | null;
  const prefixedMatch = displayTitle.match(PREFIXED_CHAPTER_PATTERN);
  const numberedPartMatch = displayTitle.match(NUMBERED_PART_PATTERN);
  const directionalPartMatch = displayTitle.match(DIRECTIONAL_PART_PATTERN);
  if (prefixedMatch) {
    category = 0;
    sequence = parseChapterNumber(prefixedMatch[1]);
  } else if (numberedPartMatch) {
    category = 1;
    sequence = parseChapterNumber(numberedPartMatch[1]);
  } else if (directionalPartMatch) {
    category = 2;
    sequence = { '上': 1, '中': 2, '下': 3 }[directionalPartMatch[1]] ?? null;
  } else {
    return null;
  }
  if (sequence === null) return null;

  return {
    pageId: page.pageid as number,
    sourceTitle: page.title,
    displayTitle,
    category,
    sequence,
    normalizedTitle: displayTitle.normalize('NFKC'),
  };
}

function compareClassifiedChapters(left: ClassifiedChapter, right: ClassifiedChapter) {
  if (left.category !== right.category) return left.category - right.category;
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  if (left.normalizedTitle !== right.normalizedTitle) {
    return left.normalizedTitle < right.normalizedTitle ? -1 : 1;
  }
  return left.pageId - right.pageId;
}

export async function discoverWikisourceChapters(
  rootTitle: string,
  options: WikisourceClientOptions = {},
): Promise<WikisourceChapterDescriptor[]> {
  const normalizedRootTitle = rootTitle.trim();
  const apiUrl = configuredApiUrl(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const chapters: ClassifiedChapter[] = [];
  let continuation: string | undefined;

  do {
    const response = await requestMediaWiki<MediaWikiAllPagesResponse>(apiUrl, {
      list: 'allpages',
      apprefix: `${normalizedRootTitle}/`,
      apnamespace: '0',
      aplimit: 'max',
      ...(continuation ? { apcontinue: continuation } : {}),
    }, fetchImpl);
    for (const page of response.query?.allpages ?? []) {
      const chapter = classifyChapter(page, normalizedRootTitle);
      if (!chapter) continue;
      chapters.push(chapter);
      if (chapters.length > MAX_CHAPTERS) {
        throw new OnlineBookError('ONLINE_BOOK_TOO_MANY_CHAPTERS', 413);
      }
    }
    continuation = response.continue?.apcontinue;
  } while (continuation);

  return chapters
    .sort(compareClassifiedChapters)
    .map(({ category: _category, sequence: _sequence, normalizedTitle: _normalizedTitle, ...chapter }, index) => ({
      ...chapter,
      order: index + 1,
    }));
}

const NAVIGATION_TOKEN = '(?:回?目录|返回目录|上一(?:回|章|节|卷|篇|页)|下一(?:回|章|节|卷|篇|页)|首页)';
const NAVIGATION_LINE_PATTERN = new RegExp(`^(?:${NAVIGATION_TOKEN})+$`, 'u');
const EDIT_CONTROL_PATTERN = /^\[?编辑(?:本段)?\]?$/u;
const FOOTNOTE_MARKER_PATTERN = /^\[(?:\d+|注\s*\d*)\]$/u;
const TEMPLATE_DECORATION_PATTERN = /^\{\{.*\}\}$/u;

function cleanExtractLine(value: string) {
  let line = value
    .replace(/\[(?:\d+|注\s*\d*|编辑(?:本段)?)\]/gu, '')
    .replace(/\{\{.*?\}\}/gu, '')
    .trim();
  if (!line) return null;
  const heading = line.match(/^=+\s*(.*?)\s*=+$/u);
  if (heading) line = heading[1].trim();
  if (!line) return null;
  const compactNavigation = line.replace(/[\s|｜·•<>←→«»/、，,]+/gu, '');
  if (
    NAVIGATION_LINE_PATTERN.test(compactNavigation)
    || EDIT_CONTROL_PATTERN.test(line)
    || FOOTNOTE_MARKER_PATTERN.test(line)
    || TEMPLATE_DECORATION_PATTERN.test(line)
  ) return null;
  return line;
}

export function cleanWikisourceExtract(extract: string) {
  return extract
    .split(/\r?\n\s*\r?\n+/u)
    .map((paragraph) => paragraph
      .split(/\r?\n/u)
      .flatMap((line) => {
        const cleaned = cleanExtractLine(line);
        return cleaned ? [cleaned] : [];
      })
      .join('\n'))
    .filter(Boolean);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await transform(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function displayTitleFromExtractPage(page: MediaWikiPage, fallback: string) {
  const returnedTitle = page.varianttitles?.['zh-hans']?.trim() || page.title?.trim();
  if (!returnedTitle) return fallback;
  const slashIndex = returnedTitle.lastIndexOf('/');
  return (slashIndex >= 0 ? returnedTitle.slice(slashIndex + 1) : returnedTitle).trim() || fallback;
}

export async function fetchWikisourceChapterContents(
  descriptors: WikisourceChapterDescriptor[],
  options: WikisourceClientOptions = {},
): Promise<WikisourceChapterContent[]> {
  if (descriptors.length === 0) return [];
  const apiUrl = configuredApiUrl(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const batches = Array.from(
    { length: Math.ceil(descriptors.length / EXTRACT_BATCH_SIZE) },
    (_, index) => descriptors.slice(index * EXTRACT_BATCH_SIZE, (index + 1) * EXTRACT_BATCH_SIZE),
  );

  const batchResults = await mapWithConcurrency(batches, MAX_EXTRACT_CONCURRENCY, async (batch) => {
    const response = await requestMediaWiki<MediaWikiExtractsResponse>(apiUrl, {
      prop: 'extracts|info',
      explaintext: '1',
      exsectionformat: 'plain',
      exlimit: 'max',
      inprop: 'varianttitles',
      titles: batch.map((descriptor) => descriptor.sourceTitle).join('|'),
    }, fetchImpl);
    const pagesById = new Map(
      (response.query?.pages ?? [])
        .filter((page): page is MediaWikiPage & { pageid: number } => Number.isInteger(page.pageid) && !page.missing)
        .map((page) => [page.pageid, page]),
    );
    return batch.map((descriptor) => {
      const page = pagesById.get(descriptor.pageId);
      if (!page || typeof page.extract !== 'string') {
        throw new OnlineBookError('BOOK_SOURCE_UNAVAILABLE', 502);
      }
      return {
        pageId: descriptor.pageId,
        displayTitle: displayTitleFromExtractPage(page, descriptor.displayTitle),
        order: descriptor.order,
        paragraphs: cleanWikisourceExtract(page.extract),
      };
    });
  });

  return batchResults.flat();
}

export async function searchWikisource(
  query: string,
  page: number,
  options: WikisourceClientOptions = {},
): Promise<OnlineBookSearchPage> {
  const apiUrl = configuredApiUrl(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const searchResponse = await requestMediaWiki<MediaWikiSearchResponse>(apiUrl, {
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: String(SEARCH_PAGE_SIZE),
    sroffset: String((page - 1) * SEARCH_PAGE_SIZE),
  }, fetchImpl);

  const rootTitles = [...new Set(
    (searchResponse.query?.search ?? []).flatMap((hit) => {
      const rootTitle = rootTitleFromSearchHit(hit);
      return rootTitle ? [rootTitle] : [];
    }),
  )];
  const total = Math.max(0, searchResponse.query?.searchinfo?.totalhits ?? 0);
  const hasNextPage = typeof searchResponse.continue?.sroffset === 'number';

  if (rootTitles.length === 0) {
    return { items: [], page, total, hasNextPage, sourceErrors: [] };
  }

  const rootResponse = await requestMediaWiki<MediaWikiRootResponse>(apiUrl, {
    prop: 'info',
    inprop: 'url',
    redirects: '1',
    converttitles: '1',
    titles: rootTitles.join('|'),
  }, fetchImpl);
  const seenPageIds = new Set<number>();
  const items = (rootResponse.query?.pages ?? []).flatMap((rootPage) => {
    if (
      rootPage.missing
      || rootPage.ns !== 0
      || !Number.isInteger(rootPage.pageid)
      || !rootPage.title?.trim()
      || seenPageIds.has(rootPage.pageid as number)
    ) return [];

    seenPageIds.add(rootPage.pageid as number);
    return [{
      source: 'wikisource' as const,
      sourceBookId: String(rootPage.pageid),
      title: rootPage.title.trim(),
      authors: [],
      languages: ['zh'],
      sourceUrl: canonicalPageUrl(rootPage),
      sourceAttribution: WIKISOURCE_SOURCE_ATTRIBUTION,
      copyrightStatus: 'authorized' as const,
      downloadCount: 0,
      canImport: true,
    }];
  });

  return { items, page, total, hasNextPage, sourceErrors: [] };
}

export function createWikisourceProvider(
  importBook: OnlineBookProvider['importBook'],
  options: WikisourceClientOptions = {},
): OnlineBookProvider {
  return {
    source: 'wikisource',
    search: (query, page) => searchWikisource(query, page, options),
    importBook,
  };
}
