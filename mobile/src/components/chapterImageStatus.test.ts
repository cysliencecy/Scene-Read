import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerationTask, SceneImage } from '../types/app';
import { getChapterImageStatus } from './chapterImageStatus';

const task = (status: GenerationTask['status']): GenerationTask => ({
  id: `task-${status}`,
  chapterId: 'chapter-1',
  progress: 20,
  status,
  label: status,
});

const image: SceneImage = {
  id: 'image-1',
  chapterId: 'chapter-1',
  variant: 'street',
  prompt: 'A scene',
};

test('reports generating for active task states', () => {
  for (const status of ['queued', 'recognizing', 'generating'] as const) {
    assert.equal(getChapterImageStatus('chapter-1', [task(status)], []), 'generating');
  }
});

test('reports generated when an image exists, even if a task is active', () => {
  assert.equal(getChapterImageStatus('chapter-1', [task('generating')], [image]), 'generated');
});

test('does not show an icon for terminal tasks without an image', () => {
  for (const status of ['completed', 'failed', 'cancelled'] as const) {
    assert.equal(getChapterImageStatus('chapter-1', [task(status)], []), null);
  }
});

test('ignores tasks and images belonging to another chapter', () => {
  assert.equal(getChapterImageStatus('chapter-2', [task('generating')], [image]), null);
});
