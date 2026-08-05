import type { Chapter, ChapterBlock } from '../types/app';

export type ReaderFontSize = '小' | '中' | '大';
export type ReaderLineSpacing = '紧凑' | '标准' | '宽松';
export type ReaderFontFamily = '默认' | '宋体';
export type ReaderTheme = '纸张' | '暖色' | '夜间';

export type ReaderPreferences = {
  fontSize: ReaderFontSize;
  lineSpacing: ReaderLineSpacing;
  fontFamily: ReaderFontFamily;
  theme: ReaderTheme;
};

export type ReaderAnchor = {
  blockId: string;
  offset: number;
};

export type ReaderPageItem =
  | { key: string; type: 'title'; text: string; blockId: string }
  | {
      key: string;
      type: 'paragraph';
      text: string;
      blockId: string;
      startOffset: number;
      endOffset: number;
      isLastFragment: boolean;
    }
  | { key: string; type: 'scene-placeholder'; block: Extract<ChapterBlock, { type: 'scene-placeholder' }> }
  | { key: string; type: 'scene-image'; block: Extract<ChapterBlock, { type: 'scene-image' }> };

export type ReaderPage = {
  key: string;
  items: ReaderPageItem[];
  anchor: ReaderAnchor;
};

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontSize: '中',
  lineSpacing: '标准',
  fontFamily: '默认',
  theme: '纸张',
};

export const FONT_SIZE_TOKENS: Record<ReaderFontSize, number> = {
  小: 15,
  中: 17,
  大: 19,
};

const LINE_HEIGHT_MULTIPLIERS: Record<ReaderLineSpacing, number> = {
  紧凑: 1.65,
  标准: 1.95,
  宽松: 2.2,
};

const PARAGRAPH_GAP = 16;
const TITLE_HEIGHT = 48;
const SCENE_FRAME_HEIGHT = 170;

export function getReaderTypography(preferences: ReaderPreferences) {
  const fontSize = FONT_SIZE_TOKENS[preferences.fontSize];
  return {
    fontSize,
    lineHeight: Math.round(fontSize * LINE_HEIGHT_MULTIPLIERS[preferences.lineSpacing]),
  };
}

function characterWidth(character: string, fontSize: number) {
  if (/\s/.test(character)) return fontSize * 0.35;
  if (/^[\u0000-\u00ff]$/.test(character)) return fontSize * 0.56;
  return fontSize;
}

function splitTextIntoLines(text: string, contentWidth: number, fontSize: number) {
  const lines: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  let line = '';
  let lineWidth = 0;
  let lineStart = 0;
  let offset = 0;

  Array.from(text).forEach((character) => {
    if (character === '\n') {
      lines.push({ text: line, startOffset: lineStart, endOffset: offset });
      line = '';
      lineWidth = 0;
      lineStart = offset + character.length;
      offset += character.length;
      return;
    }

    const width = characterWidth(character, fontSize);
    if (line && lineWidth + width > contentWidth) {
      lines.push({ text: line, startOffset: lineStart, endOffset: offset });
      line = character;
      lineWidth = width;
      lineStart = offset;
    } else {
      line += character;
      lineWidth += width;
    }
    offset += character.length;
  });

  if (line || lines.length === 0) {
    lines.push({ text: line, startOffset: lineStart, endOffset: text.length });
  }
  return lines;
}

function getItemAnchor(item: ReaderPageItem): ReaderAnchor {
  if (item.type === 'paragraph') return { blockId: item.blockId, offset: item.startOffset };
  if (item.type === 'title') return { blockId: item.blockId, offset: 0 };
  return { blockId: item.block.id, offset: 0 };
}

export function paginateChapter({
  chapter,
  contentWidth,
  contentHeight,
  preferences,
}: {
  chapter: Chapter;
  contentWidth: number;
  contentHeight: number;
  preferences: ReaderPreferences;
}): ReaderPage[] {
  const { fontSize, lineHeight } = getReaderTypography(preferences);
  const pages: ReaderPage[] = [];
  let currentItems: ReaderPageItem[] = [];
  let remainingHeight = Math.max(contentHeight, lineHeight * 2);

  const commitPage = () => {
    if (currentItems.length === 0) return;
    pages.push({
      key: `${chapter.id}-page-${pages.length}`,
      items: currentItems,
      anchor: getItemAnchor(currentItems[0]),
    });
    currentItems = [];
    remainingHeight = Math.max(contentHeight, lineHeight * 2);
  };

  const addFixedItem = (item: ReaderPageItem, height: number) => {
    if (currentItems.length > 0 && remainingHeight < height) commitPage();
    currentItems.push(item);
    remainingHeight -= height;
  };

  addFixedItem(
    { key: `${chapter.id}-title`, type: 'title', text: chapter.title, blockId: `${chapter.id}:title` },
    TITLE_HEIGHT,
  );

  chapter.blocks.forEach((block) => {
    if (block.type !== 'paragraph') {
      addFixedItem(
        block.type === 'scene-image'
          ? { key: block.id, type: 'scene-image', block }
          : { key: block.id, type: 'scene-placeholder', block },
        SCENE_FRAME_HEIGHT,
      );
      return;
    }

    const lines = splitTextIntoLines(block.text, contentWidth, fontSize);
    let lineIndex = 0;
    while (lineIndex < lines.length) {
      const availableLines = Math.floor((remainingHeight - PARAGRAPH_GAP) / lineHeight);
      if (availableLines <= 0 && currentItems.length > 0) {
        commitPage();
        continue;
      }

      const take = Math.max(1, Math.min(lines.length - lineIndex, availableLines));
      const selectedLines = lines.slice(lineIndex, lineIndex + take);
      const firstLine = selectedLines[0];
      const lastLine = selectedLines[selectedLines.length - 1];
      const isLastFragment = lineIndex + take >= lines.length;
      currentItems.push({
        key: `${block.id}-${firstLine.startOffset}`,
        type: 'paragraph',
        text: selectedLines.map((line) => line.text).join('\n'),
        blockId: block.id,
        startOffset: firstLine.startOffset,
        endOffset: lastLine.endOffset,
        isLastFragment,
      });
      remainingHeight -= selectedLines.length * lineHeight + (isLastFragment ? PARAGRAPH_GAP : 0);
      lineIndex += take;
      if (lineIndex < lines.length) commitPage();
    }
  });

  commitPage();
  return pages.length > 0 ? pages : [{ key: `${chapter.id}-empty`, items: [], anchor: { blockId: `${chapter.id}:title`, offset: 0 } }];
}

export function findPageForAnchor(pages: ReaderPage[], anchor: ReaderAnchor) {
  const exactIndex = pages.findIndex((page) =>
    page.items.some((item) => {
      if (item.type === 'paragraph') {
        return item.blockId === anchor.blockId && anchor.offset >= item.startOffset && anchor.offset <= item.endOffset;
      }
      if (item.type === 'title') return item.blockId === anchor.blockId;
      return item.block.id === anchor.blockId;
    }),
  );
  return exactIndex >= 0 ? exactIndex : 0;
}
