import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnlineBookProvider } from '../src/onlineBookProvider.js';
import { aggregateOnlineBookSearch } from '../src/onlineBookService.js';
import type { OnlineBook, OnlineBookSource } from '../src/types.js';

const onlineBook = (source: OnlineBookSource, sourceBookId: string): OnlineBook => ({
  source,
  sourceBookId,
  title: `${source}-${sourceBookId}`,
  authors: [],
  languages: source === 'wikisource' ? ['zh'] : ['en'],
  sourceUrl: `https://example.test/${source}/${sourceBookId}`,
  copyrightStatus: 'public_domain',
  downloadCount: 0,
  canImport: true,
});

const provider = (
  source: OnlineBookSource,
  search: OnlineBookProvider['search'],
): OnlineBookProvider => ({
  source,
  search,
  async importBook() {
    throw new Error('not used by aggregation tests');
  },
});

test('aggregates both successful providers with Wikisource results first', async () => {
  const providers = [
    provider('gutenberg', async (_query, page) => ({
      items: [onlineBook('gutenberg', '1342')],
      page,
      total: 20,
      hasNextPage: false,
      sourceErrors: [],
    })),
    provider('wikisource', async (_query, page) => ({
      items: [onlineBook('wikisource', '123')],
      page,
      total: 5,
      hasNextPage: true,
      sourceErrors: [],
    })),
  ];

  const result = await aggregateOnlineBookSearch(providers, '红楼梦', 2);

  assert.deepEqual(result.items.map((item) => item.source), ['wikisource', 'gutenberg']);
  assert.equal(result.page, 2);
  assert.equal(result.total, 25);
  assert.equal(result.hasNextPage, true);
  assert.deepEqual(result.sourceErrors, []);
});

test('returns successful results and a source error when one provider fails', async () => {
  const providers = [
    provider('wikisource', async () => {
      throw new Error('temporary outage');
    }),
    provider('gutenberg', async (_query, page) => ({
      items: [onlineBook('gutenberg', '84')],
      page,
      total: 1,
      hasNextPage: false,
      sourceErrors: [],
    })),
  ];

  const result = await aggregateOnlineBookSearch(providers, 'frankenstein', 1);

  assert.deepEqual(result.items.map((item) => item.sourceBookId), ['84']);
  assert.equal(result.total, 1);
  assert.equal(result.hasNextPage, false);
  assert.deepEqual(result.sourceErrors, [
    { source: 'wikisource', code: 'BOOK_SOURCE_UNAVAILABLE' },
  ]);
});

test('throws BOOK_SOURCE_UNAVAILABLE when all providers fail', async () => {
  const providers = [
    provider('wikisource', async () => {
      throw new Error('wikisource unavailable');
    }),
    provider('gutenberg', async () => {
      throw new Error('gutenberg unavailable');
    }),
  ];

  await assert.rejects(
    aggregateOnlineBookSearch(providers, 'anything', 1),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'BOOK_SOURCE_UNAVAILABLE');
      return true;
    },
  );
});
