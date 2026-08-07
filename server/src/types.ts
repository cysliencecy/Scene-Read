export type VisualStyle = '写实' | '动漫' | '插画';

export type BookCopyrightStatus = 'public_domain' | 'authorized' | 'unknown';

export type Book = {
  id: string;
  title: string;
  progress: string;
  accent: string;
  currentChapterId: string;
  lastReadLabel: string;
  visualStyle?: VisualStyle;
  authors?: string[];
  languages?: string[];
  coverUrl?: string;
  source?: 'gutenberg';
  sourceBookId?: string;
  sourceUrl?: string;
  copyrightStatus?: BookCopyrightStatus;
};

export type OnlineBook = {
  source: 'gutenberg';
  sourceBookId: string;
  title: string;
  authors: string[];
  languages: string[];
  coverUrl?: string;
  sourceUrl: string;
  copyrightStatus: BookCopyrightStatus;
  downloadCount: number;
  canImport: boolean;
  importedBookId?: string;
};

export type OnlineBookSearchPage = {
  items: OnlineBook[];
  page: number;
  total: number;
  hasNextPage: boolean;
};

export type OnlineBookImportResult = {
  book: Book;
  chapters: Chapter[];
  alreadyImported: boolean;
};

export type ImageType = 'scene' | 'character' | 'object';

export type ChapterBlock =
  | {
      id: string;
      type: 'paragraph';
      text: string;
    }
  | {
      id: string;
      type: 'scene-placeholder';
      taskId: string;
    }
  | {
      id: string;
      type: 'scene-image';
      imageId: string;
    };

export type Chapter = {
  id: string;
  bookId: string;
  title: string;
  progress: number;
  blocks: ChapterBlock[];
};

export type GenerationTask = {
  id: string;
  bookId?: string;
  chapterId: string;
  progress: number;
  status: 'queued' | 'recognizing' | 'generating' | 'completed' | 'failed';
  taskType?: 'scene_image';
  label: string;
  errorMessage?: string;
  provider?: string;
  durationMs?: number;
};

export type SceneImage = {
  id: string;
  chapterId: string;
  sourceBlockId?: string;
  position?: number;
  imageType?: ImageType;
  variant: 'street' | 'office';
  prompt: string;
  imagePath?: string;
  imageUrl?: string;
};

export type SceneCandidate = {
  id: string;
  taskId: string;
  bookId?: string;
  chapterId: string;
  order: number;
  sourceBlockId: string;
  position: number;
  reason: string;
  sourceText: string;
  promptDraft: string;
  finalPrompt?: string;
  imageType?: ImageType;
  locationChange?: string;
  confidence: number;
  provider?: string;
  model?: string;
  promptVersion?: string;
  rawResponse?: unknown;
};

