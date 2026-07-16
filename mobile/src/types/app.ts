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
  variant: 'street' | 'office';
  prompt: string;
};

export type GenerationTask = {
  id: string;
  chapterId: string;
  progress: number;
  status: 'queued' | 'generating' | 'completed';
  label: string;
};
