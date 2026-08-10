import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { app } from '../src/index.js';
import { OnlineBookError } from '../src/onlineBookProvider.js';
import { OnlineBookProviderRegistry } from '../src/onlineBookProvider.js';
import type { OnlineBookProvider } from '../src/onlineBookProvider.js';
import {
  aggregateOnlineBookSearch,
  importOnlineBookBySource,
  importWikisourceBook,
  onlineBookProviderRegistry,
} from '../src/onlineBookService.js';
import type { Book, Chapter, OnlineBook, OnlineBookImportResult, OnlineBookSource } from '../src/types.js';

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

test('preserves a concrete provider error code in partial-failure source errors', async () => {
  const providers = [
    provider('wikisource', async () => {
      throw new OnlineBookError('ONLINE_BOOK_NOT_FOUND', 404);
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

  assert.deepEqual(result.sourceErrors, [
    { source: 'wikisource', code: 'ONLINE_BOOK_NOT_FOUND' },
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

test('dispatches imports through the requested provider and rejects unknown sources', async () => {
  const calls: string[] = [];
  const result = importedResult();
  const registry = new OnlineBookProviderRegistry([
    {
      ...provider('gutenberg', async () => emptySearchPage()),
      async importBook(sourceBookId) {
        calls.push(`gutenberg:${sourceBookId}`);
        return result;
      },
    },
    {
      ...provider('wikisource', async () => emptySearchPage()),
      async importBook(sourceBookId) {
        calls.push(`wikisource:${sourceBookId}`);
        return result;
      },
    },
  ]);

  assert.strictEqual(await importOnlineBookBySource('gutenberg', '1342', '写实', registry), result);
  assert.strictEqual(await importOnlineBookBySource('wikisource', '7683', '插画', registry), result);
  assert.deepEqual(calls, ['gutenberg:1342', 'wikisource:7683']);
  await assert.rejects(
    importOnlineBookBySource('unknown', '1', '写实', registry),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_ONLINE_BOOK');
      assert.equal((error as { status?: number }).status, 400);
      return true;
    },
  );
});

test('Wikisource preparation failures make zero repository RPC calls', async () => {
  const preparationErrors = [
    ['INVALID_SOURCE_BOOK_ID', 400],
    ['ONLINE_BOOK_NOT_FOUND', 404],
    ['BOOK_SOURCE_UNAVAILABLE', 502],
    ['ONLINE_BOOK_HAS_NO_CHAPTERS', 422],
    ['ONLINE_BOOK_HAS_NO_READABLE_TEXT', 422],
    ['ONLINE_BOOK_TOO_MANY_CHAPTERS', 413],
    ['BOOK_DOWNLOAD_TOO_LARGE', 413],
    ['BOOK_SOURCE_URL_REJECTED', 500],
  ] as const;
  let rpcCalls = 0;

  for (const [code, status] of preparationErrors) {
    await assert.rejects(
      importWikisourceBook('7683', '写实', {}, {
        isPersistenceConfigured: true,
        findBookBySource: async () => null,
        listChaptersByBook: async () => [],
        prepareWikisourceImport: async () => { throw new OnlineBookError(code, status); },
        persistOnlineBook: async () => {
          rpcCalls += 1;
          throw new Error('must not persist a failed preparation');
        },
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, code);
        return true;
      },
    );
  }

  await assert.rejects(
    importWikisourceBook('7683', '写实', {}, {
      isPersistenceConfigured: true,
      findBookBySource: async () => null,
      listChaptersByBook: async () => [],
      prepareWikisourceImport: async () => { throw new Error('unexpected parse failure'); },
      persistOnlineBook: async () => {
        rpcCalls += 1;
        throw new Error('must not persist a failed preparation');
      },
    }),
    /unexpected parse failure/u,
  );

  assert.equal(rpcCalls, 0);
});

test('persists a fully prepared Wikisource book once with stable attribution', async () => {
  const prepared = preparedWikisourceImport();
  const persistedInputs: unknown[] = [];
  const result = await importWikisourceBook('7683', '插画', {}, {
    isPersistenceConfigured: true,
    findBookBySource: async () => null,
    listChaptersByBook: async () => prepared.chapters,
    prepareWikisourceImport: async () => prepared,
    persistOnlineBook: async (input) => {
      persistedInputs.push(input);
      return prepared.book;
    },
  });

  assert.equal(persistedInputs.length, 1);
  assert.deepEqual(persistedInputs[0], { ...prepared, coverPath: null });
  assert.equal(result.book.source, 'wikisource');
  assert.equal(result.book.sourceBookId, '7683');
  assert.equal(result.book.copyrightStatus, 'authorized');
  assert.match(result.book.sourceAttribution ?? '', /中文维基文库/u);
  assert.equal(result.alreadyImported, false);
});

test('returns existing Wikisource imports and recovers a persistence race', async () => {
  const prepared = preparedWikisourceImport();
  const existing = { ...prepared.book, id: 'existing-wikisource-7683' };
  let prepareCalls = 0;
  let persistCalls = 0;
  const duplicateLookups: string[] = [];
  const duplicate = await importWikisourceBook('007683', '写实', {}, {
    isPersistenceConfigured: true,
    findBookBySource: async (_source, sourceBookId) => {
      duplicateLookups.push(sourceBookId);
      return existing;
    },
    listChaptersByBook: async () => prepared.chapters,
    prepareWikisourceImport: async () => { prepareCalls += 1; return prepared; },
    persistOnlineBook: async () => { persistCalls += 1; return prepared.book; },
  });
  assert.equal(duplicate.book.id, existing.id);
  assert.equal(duplicate.alreadyImported, true);
  assert.equal(prepareCalls, 0);
  assert.equal(persistCalls, 0);
  assert.deepEqual(duplicateLookups, ['7683']);

  let findCalls = 0;
  const raced = await importWikisourceBook('7683', '写实', {}, {
    isPersistenceConfigured: true,
    findBookBySource: async () => {
      findCalls += 1;
      return findCalls === 1 ? null : existing;
    },
    listChaptersByBook: async () => prepared.chapters,
    prepareWikisourceImport: async () => prepared,
    persistOnlineBook: async () => {
      persistCalls += 1;
      throw new Error('duplicate key value violates unique constraint');
    },
  });
  assert.equal(raced.book.id, existing.id);
  assert.equal(raced.alreadyImported, true);
  assert.equal(findCalls, 2);
  assert.equal(persistCalls, 1);
});

test('POST online import accepts both known sources, rejects unknown, and preserves provider error status', async () => {
  const originalWikisource = onlineBookProviderRegistry.get('wikisource');
  const originalGutenberg = onlineBookProviderRegistry.get('gutenberg');
  assert.ok(originalWikisource);
  assert.ok(originalGutenberg);
  const result = importedResult();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/online-books/import`;

  try {
    onlineBookProviderRegistry.register({
      source: 'wikisource',
      search: async () => emptySearchPage(),
      importBook: async () => result,
    });
    const accepted = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'wikisource', sourceBookId: '7683', visualStyle: '插画' }),
    });
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json() as { data: OnlineBookImportResult }).data.book.source, 'wikisource');

    onlineBookProviderRegistry.register({
      source: 'gutenberg',
      search: async () => emptySearchPage(),
      importBook: async () => ({
        ...result,
        book: { ...result.book, source: 'gutenberg', sourceBookId: '1342' },
      }),
    });
    const acceptedGutenberg = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'gutenberg', sourceBookId: '1342', visualStyle: '写实' }),
    });
    assert.equal(acceptedGutenberg.status, 201);
    assert.equal((await acceptedGutenberg.json() as { data: OnlineBookImportResult }).data.book.source, 'gutenberg');

    const unknown = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'unknown', sourceBookId: '1', visualStyle: '写实' }),
    });
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json() as { error: string }).error, 'INVALID_ONLINE_BOOK');

    onlineBookProviderRegistry.register({
      source: 'wikisource',
      search: async () => emptySearchPage(),
      importBook: async () => { throw new OnlineBookError('BOOK_DOWNLOAD_TOO_LARGE', 413); },
    });
    const failed = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'wikisource', sourceBookId: '7683', visualStyle: '写实' }),
    });
    assert.equal(failed.status, 413);
    assert.equal((await failed.json() as { error: string }).error, 'BOOK_DOWNLOAD_TOO_LARGE');
  } finally {
    onlineBookProviderRegistry.register(originalWikisource);
    onlineBookProviderRegistry.register(originalGutenberg);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

const emptySearchPage = () => ({
  items: [],
  page: 1,
  total: 0,
  hasNextPage: false,
  sourceErrors: [],
});

const preparedWikisourceImport = (): { book: Book; chapters: Chapter[] } => ({
  book: {
    id: 'import-wikisource-7683',
    title: '红楼梦',
    progress: '新导入',
    accent: '#426f76',
    currentChapterId: 'import-wikisource-7683-chapter-1',
    lastReadLabel: '准备开始第一章',
    visualStyle: '插画',
    authors: [],
    languages: ['zh'],
    source: 'wikisource',
    sourceBookId: '7683',
    sourceUrl: 'https://zh.wikisource.org/wiki/%E7%B4%85%E6%A8%93%E5%A4%A2',
    sourceAttribution: '来源：中文维基文库；作品版权与许可状态以来源页标注为准',
    copyrightStatus: 'authorized',
  },
  chapters: [{
    id: 'import-wikisource-7683-chapter-1',
    bookId: 'import-wikisource-7683',
    title: '第一回',
    progress: 0,
    blocks: [{ id: 'import-wikisource-7683-chapter-1-p-1', type: 'paragraph', text: '正文' }],
  }],
});

const importedResult = (): OnlineBookImportResult => ({
  ...preparedWikisourceImport(),
  alreadyImported: false,
});
