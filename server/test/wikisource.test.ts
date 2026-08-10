import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWikisourceImport } from '../src/onlineBookService.js';
import { discoverWikisourceChapters, searchWikisource } from '../src/wikisource.js';

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
            pageid: 200,
            ns: 0,
            title: '西游记',
            fullurl: 'https://zh.wikisource.org/wiki/%E8%A5%BF%E6%B8%B8%E8%AE%B0',
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

  assert.deepEqual(requestedRootTitles, ['红楼梦', '西游记', '三国演义']);
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
      sourceBookId: '200',
      title: '西游记',
      sourceUrl: 'https://zh.wikisource.org/wiki/%E8%A5%BF%E6%B8%B8%E8%AE%B0',
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

test('deduplicates distinct resolved roots that share a canonical page id', async () => {
  const fetchImpl = fixtureFetch((url) => {
    if (url.searchParams.get('list') === 'search') {
      return {
        query: {
          searchinfo: { totalhits: 2 },
          search: [
            { ns: 0, pageid: 101, title: '红楼梦/第一回' },
            { ns: 0, pageid: 102, title: '石头记/第一回' },
          ],
        },
      };
    }

    return {
      query: {
        pages: [
          {
            pageid: 100,
            ns: 0,
            title: '红楼梦',
            canonicalurl: 'https://zh.wikisource.org/wiki/%E7%BA%A2%E6%A5%BC%E6%A2%A6',
          },
          {
            pageid: 100,
            ns: 0,
            title: '红楼梦',
            canonicalurl: 'https://zh.wikisource.org/wiki/%E7%BA%A2%E6%A5%BC%E6%A2%A6',
          },
        ],
      },
    };
  });

  const result = await searchWikisource('石头记', 1, { fetchImpl });

  assert.deepEqual(result.items.map((item) => item.sourceBookId), ['100']);
});

test('uses the simplified variant title for search result cards', async () => {
  const fetchImpl = fixtureFetch((url) => {
    if (url.searchParams.get('list') === 'search') {
      return {
        query: {
          searchinfo: { totalhits: 1 },
          search: [{ ns: 0, pageid: 101, title: '紅樓夢/第一回' }],
        },
      };
    }

    assert.equal(url.searchParams.get('prop'), 'info');
    assert.equal(url.searchParams.get('inprop'), 'url|varianttitles');
    return {
      query: {
        pages: [{
          pageid: 100,
          ns: 0,
          title: '紅樓夢',
          varianttitles: { 'zh-hans': '红楼梦' },
          canonicalurl: 'https://zh.wikisource.org/wiki/%E7%B4%85%E6%A8%93%E5%A4%A2',
        }],
      },
    };
  });

  const result = await searchWikisource('红楼梦', 1, { fetchImpl });

  assert.equal(result.items[0].title, '红楼梦');
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

test('rejects an HTTP redirect without following an untrusted target', async () => {
  let fetchCalls = 0;
  const fetchImpl = (async (_input, init) => {
    fetchCalls += 1;
    assert.equal(init?.redirect, 'manual');
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://untrusted.example.test/books.json' },
    });
  }) as typeof fetch;

  await assert.rejects(
    searchWikisource('红楼梦', 1, { fetchImpl }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'BOOK_SOURCE_URL_REJECTED');
      return true;
    },
  );
  assert.equal(fetchCalls, 1);
});

test('discovers direct main-namespace chapters across continuation and sorts supported forms naturally', async () => {
  const requestedContinuations: Array<string | null> = [];
  const fetchImpl = fixtureFetch((url) => {
    assert.equal(url.searchParams.get('list'), 'allpages');
    assert.equal(url.searchParams.get('apprefix'), '红楼梦/');
    assert.equal(url.searchParams.get('apnamespace'), '0');
    assert.equal(url.searchParams.get('aplimit'), 'max');
    requestedContinuations.push(url.searchParams.get('apcontinue'));

    if (!url.searchParams.has('apcontinue')) {
      return {
        continue: { continue: '-||', apcontinue: '红楼梦/第十回' },
        query: {
          allpages: [
            { pageid: 110, ns: 0, title: '红楼梦/第010回 金寡妇贪利权受辱' },
            { pageid: 102, ns: 0, title: '红楼梦/第二回 贾夫人仙逝扬州城' },
            { pageid: 101, ns: 0, title: '红楼梦/第一回 甄士隐梦幻识通灵' },
            { pageid: 190, ns: 0, title: '红楼梦/版本说明' },
            { pageid: 193, ns: 0, title: '红楼梦/校勘记' },
            { pageid: 194, ns: 0, title: '红楼梦/目录' },
            { pageid: 195, ns: 0, title: '红楼梦/第一回索引' },
            { pageid: 191, ns: 0, title: '红楼梦/第003回/校勘记' },
            { pageid: 192, ns: 1, title: 'Talk:红楼梦/第四回' },
          ],
        },
      };
    }

    return {
      query: {
        allpages: [
          { pageid: 120, ns: 0, title: '红楼梦/第十二章' },
          { pageid: 103, ns: 0, title: '红楼梦/第三节' },
          { pageid: 104, ns: 0, title: '红楼梦/第四卷' },
          { pageid: 201, ns: 0, title: '红楼梦/卷二' },
          { pageid: 200, ns: 0, title: '红楼梦/卷一' },
          { pageid: 211, ns: 0, title: '红楼梦/部十' },
          { pageid: 212, ns: 0, title: '红楼梦/篇3' },
          { pageid: 220, ns: 0, title: '红楼梦/上卷' },
          { pageid: 223, ns: 0, title: '红楼梦/上篇' },
          { pageid: 222, ns: 0, title: '红楼梦/下卷' },
          { pageid: 225, ns: 0, title: '红楼梦/下篇' },
          { pageid: 221, ns: 0, title: '红楼梦/中卷' },
          { pageid: 224, ns: 0, title: '红楼梦/中篇' },
          { pageid: 230, ns: 0, title: '红楼梦/人物表' },
          { pageid: 231, ns: 0, title: '别的书/第一回' },
        ],
      },
    };
  });

  const chapters = await discoverWikisourceChapters('红楼梦', { fetchImpl });

  assert.deepEqual(requestedContinuations, [null, '红楼梦/第十回']);
  assert.deepEqual(chapters.map(({ pageId, sourceTitle, displayTitle, order }) => ({
    pageId,
    sourceTitle,
    displayTitle,
    order,
  })), [
    { pageId: 101, sourceTitle: '红楼梦/第一回 甄士隐梦幻识通灵', displayTitle: '第一回 甄士隐梦幻识通灵', order: 1 },
    { pageId: 102, sourceTitle: '红楼梦/第二回 贾夫人仙逝扬州城', displayTitle: '第二回 贾夫人仙逝扬州城', order: 2 },
    { pageId: 103, sourceTitle: '红楼梦/第三节', displayTitle: '第三节', order: 3 },
    { pageId: 104, sourceTitle: '红楼梦/第四卷', displayTitle: '第四卷', order: 4 },
    { pageId: 110, sourceTitle: '红楼梦/第010回 金寡妇贪利权受辱', displayTitle: '第010回 金寡妇贪利权受辱', order: 5 },
    { pageId: 120, sourceTitle: '红楼梦/第十二章', displayTitle: '第十二章', order: 6 },
    { pageId: 200, sourceTitle: '红楼梦/卷一', displayTitle: '卷一', order: 7 },
    { pageId: 201, sourceTitle: '红楼梦/卷二', displayTitle: '卷二', order: 8 },
    { pageId: 212, sourceTitle: '红楼梦/篇3', displayTitle: '篇3', order: 9 },
    { pageId: 211, sourceTitle: '红楼梦/部十', displayTitle: '部十', order: 10 },
    { pageId: 220, sourceTitle: '红楼梦/上卷', displayTitle: '上卷', order: 11 },
    { pageId: 223, sourceTitle: '红楼梦/上篇', displayTitle: '上篇', order: 12 },
    { pageId: 221, sourceTitle: '红楼梦/中卷', displayTitle: '中卷', order: 13 },
    { pageId: 224, sourceTitle: '红楼梦/中篇', displayTitle: '中篇', order: 14 },
    { pageId: 222, sourceTitle: '红楼梦/下卷', displayTitle: '下卷', order: 15 },
    { pageId: 225, sourceTitle: '红楼梦/下篇', displayTitle: '下篇', order: 16 },
  ]);
});

test('accepts exactly 200 classified chapters', async () => {
  const fetchImpl = fixtureFetch(() => ({
    query: {
      allpages: Array.from({ length: 200 }, (_, index) => ({
        pageid: index + 1,
        ns: 0,
        title: `测试作品/第${index + 1}章`,
      })),
    },
  }));

  const chapters = await discoverWikisourceChapters('测试作品', { fetchImpl });

  assert.equal(chapters.length, 200);
  assert.equal(chapters[0].displayTitle, '第1章');
  assert.equal(chapters[199].displayTitle, '第200章');
  assert.equal(chapters[199].order, 200);
});

test('rejects the 201st classified chapter without truncating the work', async () => {
  const fetchImpl = fixtureFetch(() => ({
    query: {
      allpages: Array.from({ length: 201 }, (_, index) => ({
        pageid: index + 1,
        ns: 0,
        title: `测试作品/第${index + 1}章`,
      })),
    },
  }));

  await assert.rejects(
    discoverWikisourceChapters('测试作品', { fetchImpl }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'ONLINE_BOOK_TOO_MANY_CHAPTERS');
      return true;
    },
  );
});

test('resolves the canonical root before discovery and assembles simplified readable chapters in memory', async () => {
  const fetchImpl = fixtureFetch((url) => {
    if (url.searchParams.get('prop') === 'info') {
      assert.equal(url.searchParams.get('pageids'), '100');
      return {
        query: {
          pages: [{
            pageid: 100,
            ns: 0,
            title: '紅樓夢',
            varianttitles: { 'zh-hans': '红楼梦' },
            canonicalurl: 'https://zh.wikisource.org/wiki/%E7%B4%85%E6%A8%93%E5%A4%A2',
          }],
        },
      };
    }

    if (url.searchParams.get('list') === 'allpages') {
      assert.equal(url.searchParams.get('apprefix'), '紅樓夢/');
      return {
        query: {
          allpages: [
            { pageid: 102, ns: 0, title: '紅樓夢/第二回' },
            { pageid: 101, ns: 0, title: '紅樓夢/第一回' },
          ],
        },
      };
    }

    assert.equal(url.searchParams.get('prop'), 'extracts|info');
    assert.equal(url.searchParams.get('variant'), 'zh-hans');
    assert.equal(url.searchParams.get('explaintext'), '1');
    assert.equal(url.searchParams.get('exsectionformat'), 'plain');
    assert.equal(url.searchParams.get('exlimit'), 'max');
    assert.equal(url.searchParams.get('titles'), '紅樓夢/第一回|紅樓夢/第二回');
    return {
      query: {
        pages: [
          {
            pageid: 101,
            ns: 0,
            title: '紅樓夢/第一回',
            varianttitles: { 'zh-hans': '红楼梦/第一回' },
            extract: '== 第一回 ==\n\n回目录\n\n红楼梦正文。[1]\n这里提到上一回的故事。\n\n[编辑]\n\n[1]',
          },
          {
            pageid: 102,
            ns: 0,
            title: '红楼梦/第二回',
            extract: '\n\n第二回正文。\n\n下一回\n\n',
          },
        ],
      },
    };
  });

  const prepared = await prepareWikisourceImport('100', '插画', { fetchImpl });

  assert.deepEqual(prepared.book, {
    id: 'import-wikisource-100',
    title: '红楼梦',
    progress: '新导入',
    accent: '#426f76',
    currentChapterId: 'import-wikisource-100-chapter-1',
    lastReadLabel: '准备开始第一章',
    visualStyle: '插画',
    authors: [],
    languages: ['zh'],
    source: 'wikisource',
    sourceBookId: '100',
    sourceUrl: 'https://zh.wikisource.org/wiki/%E7%B4%85%E6%A8%93%E5%A4%A2',
    sourceAttribution: '来源：中文维基文库；作品版权与许可状态以来源页标注为准',
    copyrightStatus: 'authorized',
  });
  assert.deepEqual(prepared.chapters, [
    {
      id: 'import-wikisource-100-chapter-1',
      bookId: 'import-wikisource-100',
      title: '第一回',
      progress: 0,
      blocks: [
        { id: 'import-wikisource-100-chapter-1-p-1', type: 'paragraph', text: '第一回' },
        { id: 'import-wikisource-100-chapter-1-p-2', type: 'paragraph', text: '红楼梦正文。\n这里提到上一回的故事。' },
      ],
    },
    {
      id: 'import-wikisource-100-chapter-2',
      bookId: 'import-wikisource-100',
      title: '第二回',
      progress: 0,
      blocks: [
        { id: 'import-wikisource-100-chapter-2-p-1', type: 'paragraph', text: '第二回正文。' },
      ],
    },
  ]);
});

test('fetches TextExtracts in batches of at most 20 with no more than three concurrent requests', async () => {
  const extractBatchSizes: number[] = [];
  let activeExtracts = 0;
  let maxActiveExtracts = 0;
  const pages = Array.from({ length: 61 }, (_, index) => ({
    pageid: index + 1,
    ns: 0,
    title: `测试作品/第${index + 1}章`,
  }));
  const fetchImpl = (async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get('prop') === 'info') {
      return new Response(JSON.stringify({
        query: { pages: [{ pageid: 900, ns: 0, title: '测试作品' }] },
      }));
    }
    if (url.searchParams.get('list') === 'allpages') {
      return new Response(JSON.stringify({ query: { allpages: pages } }));
    }

    const titles = (url.searchParams.get('titles') ?? '').split('|');
    extractBatchSizes.push(titles.length);
    activeExtracts += 1;
    maxActiveExtracts = Math.max(maxActiveExtracts, activeExtracts);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeExtracts -= 1;
    const firstPageId = Number(titles[0].match(/\d+/u)?.[0]);
    return new Response(JSON.stringify({
      query: {
        pages: titles.map((title, index) => ({
          pageid: firstPageId + index,
          ns: 0,
          title,
          extract: `正文 ${firstPageId + index}`,
        })),
      },
    }));
  }) as typeof fetch;

  const prepared = await prepareWikisourceImport('900', '写实', { fetchImpl });

  assert.deepEqual(extractBatchSizes.sort((left, right) => right - left), [20, 20, 20, 1]);
  assert.equal(maxActiveExtracts, 3);
  assert.equal(prepared.chapters.length, 61);
});

test('rejects a missing root page and a root without classified chapters before extracts', async () => {
  let missingRootFetches = 0;
  await assert.rejects(
    prepareWikisourceImport('404', '写实', {
      fetchImpl: fixtureFetch(() => {
        missingRootFetches += 1;
        return { query: { pages: [{ pageid: 404, ns: 0, title: '不存在', missing: true }] } };
      }),
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'ONLINE_BOOK_NOT_FOUND');
      return true;
    },
  );
  assert.equal(missingRootFetches, 1);

  let noChapterFetches = 0;
  await assert.rejects(
    prepareWikisourceImport('900', '写实', {
      fetchImpl: fixtureFetch((url) => {
        noChapterFetches += 1;
        if (url.searchParams.get('prop') === 'info') {
          return { query: { pages: [{ pageid: 900, ns: 0, title: '测试作品' }] } };
        }
        return { query: { allpages: [{ pageid: 1, ns: 0, title: '测试作品/目录' }] } };
      }),
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'ONLINE_BOOK_HAS_NO_CHAPTERS');
      return true;
    },
  );
  assert.equal(noChapterFetches, 2);
});

test('fails the whole preparation when an extracts batch omits a requested page', async () => {
  const fetchImpl = wikisourceImportFixture({
    extracts: [{ pageid: 1, ns: 0, title: '测试作品/第一章', extract: '正文' }],
  });

  await assert.rejects(
    prepareWikisourceImport('900', '写实', { fetchImpl }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'BOOK_SOURCE_UNAVAILABLE');
      return true;
    },
  );
});

test('rejects a work when every extracted chapter has no readable text', async () => {
  const fetchImpl = wikisourceImportFixture({
    extracts: [
      { pageid: 1, ns: 0, title: '测试作品/第一章', extract: '回目录\n\n[编辑]\n\n[1]' },
      { pageid: 2, ns: 0, title: '测试作品/第二章', extract: '\n\n下一章\n\n{{导航}}' },
    ],
  });

  await assert.rejects(
    prepareWikisourceImport('900', '写实', { fetchImpl }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'ONLINE_BOOK_HAS_NO_READABLE_TEXT');
      return true;
    },
  );
});

test('drops an empty chapter while preserving IDs from the discovered natural order', async () => {
  const prepared = await prepareWikisourceImport('900', '写实', {
    fetchImpl: wikisourceImportFixture({
      extracts: [
        { pageid: 1, ns: 0, title: '测试作品/第一章', extract: '回目录\n\n[1]' },
        { pageid: 2, ns: 0, title: '测试作品/第二章', extract: '可读正文。' },
      ],
    }),
  });

  assert.deepEqual(prepared.chapters.map((chapter) => chapter.id), [
    'import-wikisource-900-chapter-2',
  ]);
  assert.equal(prepared.book.currentChapterId, 'import-wikisource-900-chapter-2');
});

test('allows exactly 20 MiB of final UTF-8 paragraphs and rejects one byte more', async () => {
  const limit = 20 * 1024 * 1024;
  const atLimit = await prepareWikisourceImport('900', '写实', {
    fetchImpl: wikisourceImportFixture({
      extracts: [{ pageid: 1, ns: 0, title: '测试作品/第一章', extract: 'a'.repeat(limit) }],
      chapterCount: 1,
    }),
  });
  assert.equal(atLimit.chapters[0].blocks[0].text.length, limit);

  await assert.rejects(
    prepareWikisourceImport('900', '写实', {
      fetchImpl: wikisourceImportFixture({
        extracts: [{ pageid: 1, ns: 0, title: '测试作品/第一章', extract: 'a'.repeat(limit + 1) }],
        chapterCount: 1,
      }),
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'BOOK_DOWNLOAD_TOO_LARGE');
      return true;
    },
  );
});

function wikisourceImportFixture({
  extracts,
  chapterCount = 2,
}: {
  extracts: Array<{ pageid: number; ns: number; title: string; extract: string }>;
  chapterCount?: number;
}) {
  return fixtureFetch((url) => {
    if (url.searchParams.get('prop') === 'info') {
      return { query: { pages: [{ pageid: 900, ns: 0, title: '测试作品' }] } };
    }
    if (url.searchParams.get('list') === 'allpages') {
      return {
        query: {
          allpages: Array.from({ length: chapterCount }, (_, index) => ({
            pageid: index + 1,
            ns: 0,
            title: `测试作品/第${index + 1}章`,
          })),
        },
      };
    }
    return { query: { pages: extracts } };
  });
}
