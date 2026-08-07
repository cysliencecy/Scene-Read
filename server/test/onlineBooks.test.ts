import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import {
  createGutendexProvider,
  normalizeGutendexBook,
  OnlineBookError,
  searchGutendex,
} from '../src/gutendex.js';
import { parseOnlineEpub, parseOnlineText, stripGutenbergBoilerplate } from '../src/onlineBookParser.js';
import type { OnlineBookImportResult } from '../src/types.js';

test('normalizes Gutendex metadata without flattening authors', () => {
  const book = normalizeGutendexBook({
    id: 1342,
    title: ' Pride and Prejudice ',
    authors: [{ name: 'Austen, Jane' }, { name: 'Editor, Example' }],
    languages: ['en'],
    copyright: false,
    download_count: 10,
    formats: {
      'application/epub+zip': 'https://www.gutenberg.org/ebooks/1342.epub3.images',
      'image/jpeg': 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
    },
  });

  assert.deepEqual(book, {
    source: 'gutenberg',
    sourceBookId: '1342',
    title: 'Pride and Prejudice',
    authors: ['Austen, Jane', 'Editor, Example'],
    languages: ['en'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/1342',
    copyrightStatus: 'public_domain',
    downloadCount: 10,
    canImport: true,
  });
});

test('keeps authorized and unknown Gutenberg rights states distinguishable', () => {
  assert.equal(normalizeGutendexBook({ id: 1, title: 'A', copyright: true })?.copyrightStatus, 'authorized');
  assert.equal(normalizeGutendexBook({ id: 2, title: 'B', copyright: null })?.copyrightStatus, 'unknown');
});

test('Gutenberg provider delegates import arguments and returns the exact import result', async () => {
  const importedResult: OnlineBookImportResult = {
    book: {
      id: 'import-gutenberg-1342',
      title: 'Pride and Prejudice',
      progress: '新导入',
      accent: '#426f76',
      currentChapterId: 'import-gutenberg-1342-chapter-1',
      lastReadLabel: '准备开始第一章',
    },
    chapters: [],
    alreadyImported: false,
  };
  const calls: Array<{ sourceBookId: string; visualStyle: string }> = [];
  const gutendexProvider = createGutendexProvider(async (sourceBookId, visualStyle) => {
    calls.push({ sourceBookId, visualStyle });
    return importedResult;
  });

  const result = await gutendexProvider.importBook('1342', '插画');

  assert.deepEqual(calls, [{ sourceBookId: '1342', visualStyle: '插画' }]);
  assert.strictEqual(result, importedResult);
});

test('search uses provider pagination and preserves provider order', async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.GUTENDEX_BASE_URL;
  process.env.GUTENDEX_BASE_URL = 'https://gutendex.test';
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('search'), 'jane austen');
    assert.equal(url.searchParams.get('page'), '2');
    return new Response(JSON.stringify({
      count: 40,
      next: 'https://gutendex.test/books/?page=3',
      results: [
        { id: 2, title: 'Second', formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/2.txt' } },
        { id: 1, title: 'First', formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/1.txt' } },
      ],
    }), { headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await searchGutendex('jane austen', 2);
    assert.deepEqual(result.items.map((book) => book.sourceBookId), ['2', '1']);
    assert.equal(result.total, 40);
    assert.equal(result.hasNextPage, true);
    assert.deepEqual(result.sourceErrors, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.GUTENDEX_BASE_URL;
    else process.env.GUTENDEX_BASE_URL = originalBaseUrl;
  }
});

test('Gutenberg search failures retain the shared OnlineBookError class and code', async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.GUTENDEX_BASE_URL;
  process.env.GUTENDEX_BASE_URL = 'https://gutendex.test';
  globalThis.fetch = async () => new Response('', { status: 503 });

  try {
    await assert.rejects(searchGutendex('outage', 1), (error: unknown) => {
      assert.equal(error instanceof OnlineBookError, true);
      assert.equal((error as OnlineBookError).code, 'BOOK_SOURCE_UNAVAILABLE');
      assert.equal((error as OnlineBookError).status, 502);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.GUTENDEX_BASE_URL;
    else process.env.GUTENDEX_BASE_URL = originalBaseUrl;
  }
});

test('strips Gutenberg markers and splits English text chapters', () => {
  const text = `Project notes\n*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***\nCHAPTER I\nFirst paragraph.\n\nSecond paragraph.\nCHAPTER II\nThird paragraph.\n*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***\nLicense`;
  assert.equal(stripGutenbergBoilerplate(text).includes('License'), false);
  const chapters = parseOnlineText(text);
  assert.deepEqual(chapters.map((chapter) => chapter.title), ['CHAPTER I', 'CHAPTER II']);
  assert.deepEqual(chapters[0].paragraphs, ['First paragraph.', 'Second paragraph.']);
});

test('keeps an explicit preface as reading content', () => {
  const chapters = parseOnlineText('PREFACE\nWhy this book exists.\nCHAPTER I\nThe story begins.');
  assert.deepEqual(chapters.map((chapter) => chapter.title), ['PREFACE', 'CHAPTER I']);
});

test('parses EPUB reading headings while ignoring nav and cover documents', async () => {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" /></rootfiles></container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="pg-header" href="header.xhtml" media-type="application/xhtml+xml"/><item id="coverpage-wrapper" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="nav"/><itemref idref="pg-header"/><itemref idref="coverpage-wrapper"/><itemref idref="c1"/></spine></package>`);
  zip.file('OEBPS/nav.xhtml', '<html><body><h1>Contents</h1></body></html>');
  zip.file('OEBPS/header.xhtml', '<html><body><p>*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***</p><h2>PREFACE.</h2><p>Why this book exists.</p></body></html>');
  zip.file('OEBPS/cover.xhtml', '<html><body><h1>Cover</h1></body></html>');
  zip.file('OEBPS/chapter1.xhtml', '<html><head><title>Fallback</title></head><body><h1>Chapter One</h1><p>Hello &amp; welcome.</p><p>Next line.</p></body></html>');
  const bytes = await zip.generateAsync({ type: 'uint8array' });

  const chapters = await parseOnlineEpub(bytes);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, 'PREFACE');
  assert.deepEqual(chapters[0].paragraphs, ['Why this book exists.']);
  assert.equal(chapters[1].title, 'Chapter One');
  assert.deepEqual(chapters[1].paragraphs, ['Chapter One', 'Hello & welcome.', 'Next line.']);
});
