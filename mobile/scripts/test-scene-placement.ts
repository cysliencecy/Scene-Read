import assert from 'node:assert/strict';
import { withReaderGeneratedBlocks } from '../src/reader/generatedBlocks';
import type { Chapter, GenerationTask, SceneCandidate, SceneImage } from '../src/types/app';

const chapter: Chapter = {
  id: 'chapter-placement',
  bookId: 'book-placement',
  title: 'Placement regression',
  progress: 0,
  blocks: Array.from({ length: 6 }, (_, index) => ({
    id: `p${index + 1}`,
    type: 'paragraph' as const,
    text: `paragraph ${index + 1}`,
  })),
};

const task: GenerationTask = {
  id: 'task-placement',
  chapterId: chapter.id,
  progress: 60,
  status: 'generating',
  taskType: 'scene_image',
  label: 'generating',
};

const image: SceneImage = {
  id: 'image-placement',
  chapterId: chapter.id,
  sourceBlockId: 'p5',
  position: 4,
  imageType: 'scene',
  variant: 'street',
  prompt: 'test',
  imageUrl: 'https://example.com/image.png',
};

const candidate: SceneCandidate = {
  id: 'candidate-placement',
  taskId: task.id,
  chapterId: chapter.id,
  order: 0,
  sourceBlockId: 'p5',
  position: 4,
  reason: 'test',
  sourceText: 'paragraph 5',
  promptDraft: 'test',
  imageType: 'scene',
  confidence: 0.9,
  selectedForGeneration: true,
};

const placeholderChapter = withReaderGeneratedBlocks(chapter, [task], [], [candidate]);
const completedChapter = withReaderGeneratedBlocks(chapter, [{ ...task, status: 'completed', progress: 100 }], [image]);

const blockBefore = (result: Chapter | null, type: 'scene-placeholder' | 'scene-image') => {
  assert.ok(result);
  const index = result.blocks.findIndex((block) => block.type === type);
  assert.ok(index > 0, `${type} was not inserted`);
  return result.blocks[index - 1].id;
};

assert.equal(
  blockBefore(placeholderChapter, 'scene-placeholder'),
  blockBefore(completedChapter, 'scene-image'),
  'the generating placeholder must reserve the final image position',
);

const unknownPlacementChapter = withReaderGeneratedBlocks(chapter, [task], [], []);
assert.equal(
  unknownPlacementChapter?.blocks.some((block) => block.type === 'scene-placeholder'),
  false,
  'a guessed placeholder must not be shown before final placement is known',
);

console.log('scene placement is stable');
