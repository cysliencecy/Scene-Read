export type Screen = 'shelf' | 'import' | 'style' | 'reader';

export type VisualStyle = '写实' | '动漫' | '插画';

export type Book = {
  id: string;
  title: string;
  progress: string;
  accent: string;
};

export type StyleOption = {
  name: VisualStyle;
  description: string;
  colors: [string, string];
};
