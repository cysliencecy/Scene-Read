import fs from 'node:fs';
import path from 'node:path';
import { buildImportedBookDraft, splitTxtChapters } from '../src/import/bookParser';

const filePath = process.argv[2];

if (!filePath) {
  throw new Error('Usage: npx tsx scripts/test-txt-import.ts <txt-file-path>');
}

const absolutePath = path.resolve(filePath);
const fileName = path.basename(absolutePath);
const content = fs.readFileSync(absolutePath, 'utf8');
const chapters = splitTxtChapters(content);
const draft = buildImportedBookDraft({
  fileName,
  fileSize: fs.statSync(absolutePath).size,
  fileType: 'TXT',
  parsedTitle: fileName.replace(/\.[^.]+$/, ''),
  parsedChapters: chapters,
});

const firstBlock = draft.chapters[0].blocks[0];

console.log(
  JSON.stringify(
    {
      bookTitle: draft.book.title,
      currentChapterId: draft.book.currentChapterId,
      chapterCount: draft.chapters.length,
      firstChapterTitle: draft.chapters[0].title,
      firstChapterBlockCount: draft.chapters[0].blocks.length,
      firstParagraph: firstBlock.type === 'paragraph' ? firstBlock.text : null,
    },
    null,
    2,
  ),
);
