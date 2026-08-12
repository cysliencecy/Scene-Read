import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHINESE_POETRY_ATTRIBUTION,
  CHINESE_POETRY_CATALOG,
  CHINESE_POETRY_COMMIT,
  parseChinesePoetryBook,
  searchChinesePoetry,
} from './chinesePoetry.js';

test('authorized Chinese catalog search preserves the pinned source and MIT attribution', async () => {
  const result = await searchChinesePoetry('短歌行', 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].source, 'chinese_poetry');
  assert.equal(result.items[0].sourceBookId, 'caocao');
  assert.match(result.items[0].sourceUrl, new RegExp(CHINESE_POETRY_COMMIT));
  assert.equal(result.items[0].sourceAttribution, CHINESE_POETRY_ATTRIBUTION);
  assert.equal(result.items[0].copyrightStatus, 'authorized');
});

test('poem JSON becomes ordered readable chapters', () => {
  const entry = CHINESE_POETRY_CATALOG.find((item) => item.id === 'caocao');
  assert.ok(entry);
  const chapters = parseChinesePoetryBook(entry, [
    { title: '短歌行', paragraphs: ['对酒当歌，人生几何？', '譬如朝露，去日苦多。'] },
    { title: '观沧海', paragraphs: ['东临碣石，以观沧海。'] },
  ], 'book-caocao');
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '短歌行');
  assert.equal(chapters[0].blocks[0].type, 'paragraph');
  assert.equal(chapters[1].id, 'book-caocao-chapter-2');
});

test('aphorisms are grouped so the full snapshot stays below the chapter limit', () => {
  const entry = CHINESE_POETRY_CATALOG.find((item) => item.id === 'youmengying');
  assert.ok(entry);
  const payload = Array.from({ length: 219 }, (_, index) => ({ content: `原文 ${index + 1}`, comment: [`评语 ${index + 1}`] }));
  const chapters = parseChinesePoetryBook(entry, payload, 'book-youmengying');
  assert.equal(chapters.length, 22);
  assert.equal(chapters[0].title, '第 1–10 则');
  assert.equal(chapters.at(-1)?.title, '第 211–219 则');
});

test('malformed authorized-source JSON fails closed', () => {
  const entry = CHINESE_POETRY_CATALOG.find((item) => item.id === 'mengzi');
  assert.ok(entry);
  assert.throws(
    () => parseChinesePoetryBook(entry, [{ chapter: '梁惠王上', paragraphs: [42] }], 'book-mengzi'),
    (error: unknown) => error instanceof Error && error.message === 'ONLINE_BOOK_PARSE_FAILED',
  );
});
