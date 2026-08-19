import assert from 'node:assert/strict';
import {
  DEFAULT_READER_PREFERENCES,
  findPageForAnchor,
  getChapterPaginationKey,
  getPageIndexForOffset,
  paginateChapter,
  type ReaderPageItem,
} from '../src/reader/pagination';
import type { Chapter } from '../src/types/app';

const paragraphText = '雨声落在窗外。'.repeat(90);
const chapter: Chapter = {
  id: 'reader-test-chapter',
  bookId: 'reader-test-book',
  title: '分页测试章节',
  progress: 0,
  blocks: [
    { id: 'paragraph-one', type: 'paragraph', text: paragraphText },
    { id: 'scene-one', type: 'scene-placeholder', taskId: 'task-one' },
    { id: 'paragraph-two', type: 'paragraph', text: '场景之后的正文。'.repeat(20) },
  ],
};

const pages = paginateChapter({
  chapter,
  contentWidth: 320,
  contentHeight: 420,
  preferences: DEFAULT_READER_PREFERENCES,
});

assert.equal(
  getChapterPaginationKey(chapter),
  getChapterPaginationKey({ ...chapter, blocks: chapter.blocks.map((block) => ({ ...block })) }),
  'semantically unchanged chapter refreshes must keep a stable pagination key',
);
assert.notEqual(
  getChapterPaginationKey(chapter),
  getChapterPaginationKey({
    ...chapter,
    blocks: [...chapter.blocks, { id: 'new-paragraph', type: 'paragraph', text: 'new content' }],
  }),
  'real chapter block changes must invalidate pagination',
);
assert.equal(
  getPageIndexForOffset(330, 320, pages.length),
  1,
  'a tap immediately after swiping must use the visibly scrolled page before momentum ends',
);

assert.ok(pages.length > 2, 'long chapters should be split into multiple pages');
assert.equal(
  pages.flatMap((page) => page.items).filter((item) => item.type === 'scene-placeholder').length,
  1,
  'fixed scene frames should appear exactly once',
);

const paragraphFragments = pages
  .flatMap((page) => page.items)
  .filter(
    (item): item is Extract<ReaderPageItem, { type: 'paragraph' }> =>
      item.type === 'paragraph' && item.blockId === 'paragraph-one',
  );
assert.equal(
  paragraphFragments.map((fragment) => fragment.text.replaceAll('\n', '')).join(''),
  paragraphText,
  'pagination must not lose or duplicate paragraph text',
);

const targetFragment = paragraphFragments[Math.floor(paragraphFragments.length / 2)];
const targetPage = findPageForAnchor(pages, {
  blockId: targetFragment.blockId,
  offset: targetFragment.startOffset,
});
assert.ok(targetPage > 0, 'logical anchors should restore a later reading page');

assert.equal(
  findPageForAnchor(pages, { blockId: 'replaced-scene-placeholder', offset: 0 }, targetPage),
  targetPage,
  'a replaced generated block should keep the current page instead of jumping to page one',
);

const imageChapter: Chapter = {
  ...chapter,
  blocks: chapter.blocks.map((block) =>
    block.type === 'scene-placeholder'
      ? { id: 'scene-image-block', type: 'scene-image' as const, imageId: 'scene-image-one' }
      : block,
  ),
};
const imagePages = paginateChapter({
  chapter: imageChapter,
  contentWidth: 320,
  contentHeight: 420,
  preferences: DEFAULT_READER_PREFERENCES,
});
assert.ok(
  imagePages.length >= pages.length,
  'a landscape image should reserve its real 3:2 display height during pagination',
);

console.log(`reader pagination checks passed (${pages.length} pages)`);
