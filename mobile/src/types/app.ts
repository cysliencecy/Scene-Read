export type Screen = 'shelf' | 'import' | 'style' | 'reader';

export type VisualStyle = '写实' | '动漫' | '插画';

export type Book = {
  id: string;
  title: string;
  progress: string;
  accent: string;
  currentChapterId: string;
  lastReadLabel: string;
  visualStyle?: VisualStyle;
};

export type StyleOption = {
  name: VisualStyle;
  description: string;
  colors: [string, string];
};

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

export type SceneImage = {
  id: string;
  chapterId: string;
  sourceBlockId?: string;
  position?: number;
  variant: 'street' | 'office';
  prompt: string;
  imagePath?: string;
  imageUrl?: string;
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
  locationChange?: string;
  confidence: number;
  provider?: string;
  model?: string;
  promptVersion?: string;
  rawResponse?: unknown;
};

