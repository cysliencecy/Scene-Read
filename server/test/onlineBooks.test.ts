import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import JSZip from 'jszip';
import {
  createGutendexProvider,
  normalizeGutendexBook,
  OnlineBookError,
  searchGutendex,
} from '../src/gutendex.js';
import { parseOnlineEpub, parseOnlineText, stripGutenbergBoilerplate } from '../src/onlineBookParser.js';
import { buildImportOnlineBookRpcArgs, mapBookRow } from '../src/repository.js';
import type { Database } from '../src/supabaseClient.js';
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
  const originalBaseUrl = process.env.GUTENDEX_BASE_URL;
  process.env.GUTENDEX_BASE_URL = 'https://gutendex.test';
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
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
  }) as typeof fetch;

  try {
    const result = await searchGutendex('jane austen', 2, { fetchImpl });
    assert.deepEqual(result.items.map((book) => book.sourceBookId), ['2', '1']);
    assert.equal(result.total, 40);
    assert.equal(result.hasNextPage, true);
    assert.deepEqual(result.sourceErrors, []);
  } finally {
    if (originalBaseUrl === undefined) delete process.env.GUTENDEX_BASE_URL;
    else process.env.GUTENDEX_BASE_URL = originalBaseUrl;
  }
});

test('Gutenberg search failures retain the shared OnlineBookError class and code', async () => {
  const originalBaseUrl = process.env.GUTENDEX_BASE_URL;
  process.env.GUTENDEX_BASE_URL = 'https://gutendex.test';
  const fetchImpl = (async () => new Response('', { status: 503 })) as typeof fetch;

  try {
    await assert.rejects(searchGutendex('outage', 1, { fetchImpl }), (error: unknown) => {
      assert.equal(error instanceof OnlineBookError, true);
      assert.equal((error as OnlineBookError).code, 'BOOK_SOURCE_UNAVAILABLE');
      assert.equal((error as OnlineBookError).status, 502);
      return true;
    });
  } finally {
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

test('maps Wikisource source attribution from a Supabase book row', () => {
  const row: Database['public']['Tables']['books']['Row'] = {
    id: 'import-wikisource-7683',
    title: '红楼梦',
    progress: '新导入',
    accent: '#426f76',
    current_chapter_id: 'import-wikisource-7683-chapter-1',
    last_read_label: '准备开始第一章',
    visual_style: '插画',
    authors: [],
    languages: ['zh'],
    cover_path: null,
    source: 'wikisource',
    source_book_id: '7683',
    source_url: 'https://zh.wikisource.org/wiki/%E7%B4%85%E6%A8%93%E5%A4%A2',
    source_attribution: '来源：中文维基文库；作品版权与许可状态以来源页标注为准',
    copyright_status: 'authorized',
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
  };

  const book = mapBookRow(row);

  assert.equal(book.source, 'wikisource');
  assert.equal(book.sourceBookId, '7683');
  assert.equal(book.sourceUrl, row.source_url);
  assert.equal(book.sourceAttribution, row.source_attribution);
  assert.equal(book.copyrightStatus, 'authorized');
});

test('builds atomic RPC arguments with attribution while keeping Gutenberg null-compatible', () => {
  const wikibook = preparedRpcBook('wikisource', '来源：中文维基文库');
  const wikiArgs = buildImportOnlineBookRpcArgs({ ...wikibook, coverPath: null });
  assert.equal(wikiArgs.p_source, 'wikisource');
  assert.equal(wikiArgs.p_source_attribution, '来源：中文维基文库');
  assert.equal((wikiArgs.p_chapters as unknown[]).length, 1);

  const gutenberg = preparedRpcBook('gutenberg', undefined);
  const gutenbergArgs = buildImportOnlineBookRpcArgs({ ...gutenberg, coverPath: null });
  assert.equal(gutenbergArgs.p_source, 'gutenberg');
  assert.equal(gutenbergArgs.p_source_attribution, null);
});

test('schema keeps one atomic import function and adds nullable source attribution', () => {
  const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /source_attribution\s+text/u);
  assert.match(schema, /alter table public\.books add column if not exists source_attribution text/u);
  assert.match(schema, /drop function if exists public\.import_online_book/u);
  assert.match(schema, /p_source_attribution\s+text\s+default\s+null/u);
  const functionBody = schema.match(/create or replace function public\.import_online_book[\s\S]*?\$\$;/u)?.[0] ?? '';
  assert.match(functionBody, /insert into public\.books/u);
  assert.match(functionBody, /insert into public\.chapters/u);
  assert.match(functionBody, /source_attribution/u);
});

test('persists and reads durable chapter order with a deterministic legacy fallback', () => {
  const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
  const repository = readFileSync(new URL('../src/repository.ts', import.meta.url), 'utf8');
  const input = preparedRpcBook('wikisource', '来源：中文维基文库');
  input.chapters = [
    { ...input.chapters[0], id: 'chapter-1', title: '第001回' },
    { ...input.chapters[0], id: 'chapter-2', title: '第002回' },
    { ...input.chapters[0], id: 'chapter-10', title: '第010回' },
  ];

  const args = buildImportOnlineBookRpcArgs({ ...input, coverPath: null });
  assert.deepEqual(
    (args.p_chapters as Array<{ title: string }>).map((chapter) => chapter.title),
    ['第001回', '第002回', '第010回'],
  );
  assert.match(schema, /chapter_order\s+integer/u);
  assert.match(schema, /alter table public\.chapters add column if not exists chapter_order integer/u);
  assert.match(schema, /jsonb_array_elements\(p_chapters\)\s+with ordinality/iu);
  assert.match(schema, /insert into public\.chapters\s*\([^)]*chapter_order[^)]*\)/iu);
  assert.match(repository, /\.order\('chapter_order',\s*\{\s*ascending:\s*true,\s*nullsFirst:\s*false\s*\}\)/u);
  assert.match(repository, /\.order\('created_at',\s*\{\s*ascending:\s*true\s*\}\)/u);
  assert.match(repository, /\.order\('id',\s*\{\s*ascending:\s*true\s*\}\)/u);
});

const preparedRpcBook = (source: 'gutenberg' | 'wikisource', sourceAttribution: string | undefined) => ({
  book: {
    id: `import-${source}-1`,
    title: 'Test Book',
    progress: '新导入',
    accent: '#426f76',
    currentChapterId: `import-${source}-1-chapter-1`,
    lastReadLabel: '准备开始第一章',
    visualStyle: '写实' as const,
    authors: [],
    languages: ['zh'],
    source,
    sourceBookId: '1',
    sourceUrl: `https://example.test/${source}/1`,
    sourceAttribution,
    copyrightStatus: source === 'wikisource' ? 'authorized' as const : 'public_domain' as const,
  },
  chapters: [{
    id: `import-${source}-1-chapter-1`,
    bookId: `import-${source}-1`,
    title: 'Chapter 1',
    progress: 0,
    blocks: [{ id: `import-${source}-1-chapter-1-p-1`, type: 'paragraph' as const, text: 'Body' }],
  }],
});
