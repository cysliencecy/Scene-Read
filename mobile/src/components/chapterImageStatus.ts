import type { GenerationTask, SceneImage } from '../types/app';

export type ChapterImageStatus = 'generating' | 'generated' | null;

const ACTIVE_GENERATION_STATUSES = new Set<GenerationTask['status']>([
  'queued',
  'recognizing',
  'generating',
]);

export function getChapterImageStatus(
  chapterId: string,
  generationTasks: GenerationTask[],
  sceneImages: SceneImage[],
): ChapterImageStatus {
  if (sceneImages.some((image) => image.chapterId === chapterId)) return 'generated';

  if (
    generationTasks.some(
      (task) => task.chapterId === chapterId && ACTIVE_GENERATION_STATUSES.has(task.status),
    )
  ) {
    return 'generating';
  }

  return null;
}
