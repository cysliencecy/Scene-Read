import type { VisualStyle } from '../types/app';

export type RouteName = 'Shelf' | 'Import' | 'Style' | 'Reader' | 'SceneDebug' | 'BookSourceDebug';

export type AppRoute =
  | { name: 'Shelf' }
  | { name: 'Import' }
  | { name: 'Style' }
  | { name: 'Reader' }
  | { name: 'SceneDebug' }
  | { name: 'BookSourceDebug' };

export type AppNavigationState = {
  route: AppRoute;
  selectedBookId: string;
  selectedChapterId: string;
  visualStyle: VisualStyle;
};

export const initialNavigationState: AppNavigationState = {
  route: { name: 'Shelf' },
  selectedBookId: 'rain',
  selectedChapterId: 'rain-chapter-1',
  visualStyle: '写实',
};

export function getRouteTitle(route: AppRoute, chapterTitle?: string) {
  if (route.name === 'Import') return '导入书籍';
  if (route.name === 'Style') return '选择画面风格';
  if (route.name === 'Reader') return chapterTitle ?? '阅读';
  if (route.name === 'BookSourceDebug') return '私有书源调试';
  return '阅境';
}
