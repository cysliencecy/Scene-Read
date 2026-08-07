import { OnlineBookError } from './onlineBookProvider.js';
import type { OnlineBookProvider } from './onlineBookProvider.js';
import type { OnlineBookSearchPage } from './types.js';

const DEFAULT_WIKISOURCE_API_URL = 'https://zh.wikisource.org/w/api.php';
const WIKISOURCE_HOSTNAME = 'zh.wikisource.org';
const SEARCH_PAGE_SIZE = 20;
const REQUEST_TIMEOUT_MS = 15_000;
const AUXILIARY_SUBPAGE_PATTERN = /(?:目录|版本|说明|校勘|序|跋|附录|版权)/u;
const SOURCE_ATTRIBUTION = '来源：中文维基文库；作品版权与许可状态以来源页标注为准';

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
  missing?: boolean;
};

type MediaWikiRootResponse = {
  query?: {
    pages?: MediaWikiPage[];
  };
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
  const [rootTitle, ...subpageParts] = hit.title.trim().split('/');
  if (!rootTitle?.trim()) return null;
  if (subpageParts.length > 0 && AUXILIARY_SUBPAGE_PATTERN.test(subpageParts.join('/'))) return null;
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
      sourceAttribution: SOURCE_ATTRIBUTION,
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
