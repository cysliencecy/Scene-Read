import assert from 'node:assert/strict';
import test from 'node:test';
import { searchWikisource } from '../src/wikisource.js';

type FixtureHandler = (url: URL) => unknown;

const fixtureFetch = (handler: FixtureHandler): typeof fetch => (async (input) =>
  new Response(JSON.stringify(handler(new URL(String(input)))), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

test('merges root and chapter hits into unique canonical root works', async () => {
  const requestedRootTitles: string[] = [];
  const fetchImpl = fixtureFetch((url) => {
    if (url.searchParams.get('list') === 'search') {
      return {
        query: {
          searchinfo: { totalhits: 7 },
          search: [
            { ns: 0, pageid: 100, title: '红楼梦' },
            { ns: 0, pageid: 101, title: '红楼梦/第001回' },
            { ns: 0, pageid: 102, title: '红楼梦/第002回' },
            { ns: 0, pageid: 103, title: '红楼梦/版本说明' },
            { ns: 0, pageid: 101, title: '红楼梦/第001回' },
            { ns: 0, pageid: 201, title: '西游记/目录' },
            { ns: 0, pageid: 301, title: '三国演义/第一回' },
          ],
        },
      };
    }

    assert.equal(url.searchParams.get('prop'), 'info');
    requestedRootTitles.push(...(url.searchParams.get('titles') ?? '').split('|'));
    return {
      query: {
        pages: [
          {
            pageid: 100,
            ns: 0,
            title: '红楼梦',
            fullurl: 'https://zh.wikisource.org/wiki/%E7%BA%A2%E6%A5%BC%E6%A2%A6',
          },
          {
            pageid: 300,
            ns: 0,
            title: '三国演义',
            fullurl: 'https://zh.wikisource.org/wiki/%E4%B8%89%E5%9B%BD%E6%BC%94%E4%B9%89',
          },
        ],
      },
    };
  });

  const result = await searchWikisource('红楼梦', 1, { fetchImpl });

  assert.deepEqual(requestedRootTitles, ['红楼梦', '三国演义']);
  assert.deepEqual(result.items.map((item) => ({
    source: item.source,
    sourceBookId: item.sourceBookId,
    title: item.title,
    sourceUrl: item.sourceUrl,
  })), [
    {
      source: 'wikisource',
      sourceBookId: '100',
      title: '红楼梦',
      sourceUrl: 'https://zh.wikisource.org/wiki/%E7%BA%A2%E6%A5%BC%E6%A2%A6',
    },
    {
      source: 'wikisource',
      sourceBookId: '300',
      title: '三国演义',
      sourceUrl: 'https://zh.wikisource.org/wiki/%E4%B8%89%E5%9B%BD%E6%BC%94%E4%B9%89',
    },
  ]);
  assert.equal(result.items[0].copyrightStatus, 'authorized');
  assert.equal(result.items[0].canImport, true);
  assert.deepEqual(result.sourceErrors, []);
});

test('uses simplified search parameters and maps MediaWiki continuation to provider pagination', async () => {
  const requestedUrls: URL[] = [];
  const fetchImpl = fixtureFetch((url) => {
    requestedUrls.push(url);
    if (url.searchParams.get('list') === 'search') {
      assert.equal(url.searchParams.get('action'), 'query');
      assert.equal(url.searchParams.get('srsearch'), '红楼梦');
      assert.equal(url.searchParams.get('srnamespace'), '0');
      assert.equal(url.searchParams.get('srlimit'), '20');
      assert.equal(url.searchParams.get('sroffset'), '20');
      assert.equal(url.searchParams.get('variant'), 'zh-hans');
      return {
        continue: { continue: '-||', sroffset: 40 },
        query: {
          searchinfo: { totalhits: 41 },
          search: [{ ns: 0, pageid: 401, title: '儒林外史/第一回' }],
        },
      };
    }

    assert.equal(url.searchParams.get('variant'), 'zh-hans');
    return {
      query: {
        pages: [{
          pageid: 400,
          ns: 0,
          title: '儒林外史',
          canonicalurl: 'https://zh.wikisource.org/wiki/%E5%84%92%E6%9E%97%E5%A4%96%E5%8F%B2',
        }],
      },
    };
  });

  const result = await searchWikisource('红楼梦', 2, {
    apiUrl: 'https://zh.wikisource.org/w/api.php',
    fetchImpl,
  });

  assert.equal(requestedUrls.length, 2);
  assert.equal(result.page, 2);
  assert.equal(result.total, 41);
  assert.equal(result.hasNextPage, true);
  assert.equal(result.items[0].sourceBookId, '400');
});

test('rejects non-HTTPS and non-Wikisource API targets before fetching', async () => {
  let fetchCalls = 0;
  const fetchImpl = (async () => {
    fetchCalls += 1;
    throw new Error('must not fetch rejected URLs');
  }) as typeof fetch;

  for (const apiUrl of [
    'http://zh.wikisource.org/w/api.php',
    'https://wikisource.example.test/w/api.php',
    'https://zh.wikisource.org:444/w/api.php',
  ]) {
    await assert.rejects(
      searchWikisource('红楼梦', 1, { apiUrl, fetchImpl }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'BOOK_SOURCE_URL_REJECTED');
        return true;
      },
    );
  }

  assert.equal(fetchCalls, 0);
});
