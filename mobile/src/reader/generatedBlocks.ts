import type { Chapter, ChapterBlock, GenerationTask, SceneCandidate, SceneImage } from '../types/app';

const isPendingTask = (task: GenerationTask) =>
  task.status === 'queued' || task.status === 'recognizing' || task.status === 'generating';

const getFallbackInsertAfterBlockId = (blocks: ChapterBlock[]) => {
  const paragraphIds = blocks.filter((block) => block.type === 'paragraph').map((block) => block.id);
  if (paragraphIds.length === 0) return null;
  return paragraphIds[Math.min(1, paragraphIds.length - 1)];
};

const getDistributedFallbackBlockIds = (blocks: ChapterBlock[], count: number) => {
  const paragraphIds = blocks.filter((block) => block.type === 'paragraph').map((block) => block.id);
  if (paragraphIds.length === 0 || count <= 0) return [];
  const ratios = count <= 1 ? [0.3] : count === 2 ? [0.3, 0.75] : [0.3, 0.6, 0.85];
  return ratios.slice(0, count).map((ratio) => paragraphIds[Math.min(paragraphIds.length - 1, Math.floor(paragraphIds.length * ratio))]);
};

export const withReaderGeneratedBlocks = (
  chapter: Chapter | null,
  tasks: GenerationTask[],
  images: SceneImage[],
  candidates: SceneCandidate[] = [],
): Chapter | null => {
  if (!chapter) return null;

  const chapterImages = images.filter((image) => image.chapterId === chapter.id);
  const chapterTasks = tasks.filter((task) => task.chapterId === chapter.id);
  const fallbackBlockId = getFallbackInsertAfterBlockId(chapter.blocks);
  const fallbackImages = chapterImages.filter((image) => !image.sourceBlockId);
  const fallbackBlockIds = getDistributedFallbackBlockIds(chapter.blocks, fallbackImages.length);
  const pendingTask = chapterTasks.find(isPendingTask);
  const selectedCandidates = pendingTask
    ? candidates.filter(
        (candidate) =>
          candidate.chapterId === chapter.id &&
          candidate.taskId === pendingTask.id &&
          candidate.selectedForGeneration &&
          candidate.sourceBlockId,
      )
    : [];
  const imageIds = new Set(chapterImages.map((image) => image.id));
  const taskIds = new Set(chapterTasks.map((task) => task.id));
  const hasInlineImage = chapter.blocks.some((block) => block.type === 'scene-image' && imageIds.has(block.imageId));
  const hasInlineTask = chapter.blocks.some((block) => block.type === 'scene-placeholder' && taskIds.has(block.taskId));

  if (hasInlineImage || hasInlineTask || (!fallbackBlockId && chapterImages.length === 0 && !pendingTask)) {
    return chapter;
  }

  const blocks: ChapterBlock[] = [];
  chapter.blocks.forEach((block) => {
    blocks.push(block);
    if (block.type !== 'paragraph') return;

    chapterImages
      .filter((image) => image.sourceBlockId === block.id)
      .forEach((image) => blocks.push({ id: `${image.id}-block`, type: 'scene-image', imageId: image.id }));

    if (!hasInlineImage && block.id === fallbackBlockId) {
      fallbackImages
        .filter((_image, index) => !fallbackBlockIds[index])
        .forEach((image) => blocks.push({ id: `${image.id}-fallback-block`, type: 'scene-image', imageId: image.id }));
    }

    if (!hasInlineImage) {
      fallbackImages
        .filter((_image, index) => fallbackBlockIds[index] === block.id)
        .forEach((image) => blocks.push({ id: `${image.id}-distributed-fallback-block`, type: 'scene-image', imageId: image.id }));
    }

    if (!hasInlineTask && pendingTask && chapterImages.length === 0) {
      selectedCandidates
        .filter((candidate) => candidate.sourceBlockId === block.id)
        .forEach((candidate) =>
          blocks.push({
            id: `${pendingTask.id}-${candidate.id}-block`,
            type: 'scene-placeholder',
            taskId: pendingTask.id,
          }),
        );
    }
  });

  return { ...chapter, blocks };
};
