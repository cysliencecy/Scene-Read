import assert from 'node:assert/strict';

import {
  importOnlineBook,
  mergeOnlineBookSearchPages,
  onlineBookErrorMessage,
  onlineBookSourceLabel,
  onlineBookSourceWarning,
} from '../src/api/client';
import type { OnlineBook, OnlineBookSearchPage } from '../src/types/app';

assert.equal(onlineBookSourceLabel('wikisource'), '中文维基文库');
assert.equal(onlineBookSourceLabel('gutenberg'), 'Project Gutenberg');
assert.equal(onlineBookSourceWarning({ source: 'wikisource', code: 'BOOK_SOURCE_UNAVAILABLE' }), '中文维基文库暂时不可用，已显示其它可用书源。');

const onlineBook = (source: OnlineBook['source'], sourceBookId: string, title: string): OnlineBook => ({
  source,
  sourceBookId,
  title,
  authors: [],
  languages: [],
  sourceUrl: `https://example.com/${source}/${sourceBookId}`,
  copyrightStatus: 'public_domain',
  downloadCount: 0,
  canImport: true,
});

const firstPage: OnlineBookSearchPage = {
  items: [
    onlineBook('wikisource', '42', '先出现的维基文库作品'),
    onlineBook('gutenberg', '42', '相同书号的 Gutenberg 作品'),
  ],
  page: 1,
  total: 2,
  hasNextPage: true,
  sourceErrors: [{ source: 'wikisource', code: 'BOOK_SOURCE_UNAVAILABLE' }],
};
const secondPage: OnlineBookSearchPage = {
  items: [
    onlineBook('wikisource', '42', '第二页重复作品'),
    onlineBook('wikisource', '43', '第二页新增作品'),
  ],
  page: 2,
  total: 2,
  hasNextPage: false,
  sourceErrors: [
    { source: 'wikisource', code: 'BOOK_SOURCE_UNAVAILABLE' },
    { source: 'gutenberg', code: 'BOOK_SOURCE_UNAVAILABLE' },
  ],
};

const mergedPage = mergeOnlineBookSearchPages(firstPage, secondPage);
assert.deepEqual(mergedPage.items.map(({ source, sourceBookId, title }) => ({ source, sourceBookId, title })), [
  { source: 'wikisource', sourceBookId: '42', title: '先出现的维基文库作品' },
  { source: 'gutenberg', sourceBookId: '42', title: '相同书号的 Gutenberg 作品' },
  { source: 'wikisource', sourceBookId: '43', title: '第二页新增作品' },
]);
assert.deepEqual(mergedPage.sourceErrors, [
  { source: 'wikisource', code: 'BOOK_SOURCE_UNAVAILABLE' },
  { source: 'gutenberg', code: 'BOOK_SOURCE_UNAVAILABLE' },
]);

const requests: Array<{ url: string; init?: RequestInit }> = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(url), init });
  return new Response(JSON.stringify({ data: { book: {}, chapters: [], alreadyImported: false } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

async function main() {
  await importOnlineBook('wikisource', '12345', '插画');
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    source: 'wikisource',
    sourceBookId: '12345',
    visualStyle: '插画',
  });

  assert.equal(onlineBookErrorMessage(Object.assign(new Error('not found'), { code: 'ONLINE_BOOK_NOT_FOUND' })), '没有找到这部在线作品。');
  assert.equal(onlineBookErrorMessage(Object.assign(new Error('no chapters'), { code: 'ONLINE_BOOK_HAS_NO_CHAPTERS' })), '这部作品没有可导入的章节。');
  assert.equal(onlineBookErrorMessage(Object.assign(new Error('too many'), { code: 'ONLINE_BOOK_TOO_MANY_CHAPTERS' })), '这部作品超过 200 章，暂不支持导入。');
  assert.equal(onlineBookErrorMessage(Object.assign(new Error('rejected'), { code: 'BOOK_SOURCE_URL_REJECTED' })), '在线书源地址不受信任，已停止请求。');
  assert.equal(onlineBookErrorMessage(null), '操作失败，请稍后重试。');

  console.log('online book mobile tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
