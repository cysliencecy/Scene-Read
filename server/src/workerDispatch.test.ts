import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFormalWorkerArguments, shouldAutoRunWorker } from './workerDispatch.js';

test('formal invocation ignores hostile debug provider environment values', () => {
  const args = buildFormalWorkerArguments({
    taskId: 'task-hostile-env',
    apiUrl: 'http://localhost:4000',
    maxImages: '2',
    environment: {
      WORKER_SCENE_PROVIDER: 'heuristic',
      IMAGE_PROVIDER: 'mock-svg',
    },
  });

  assert.deepEqual(args, [
    '-m', 'scene_reader_worker',
    '--task-id', 'task-hostile-env',
    '--api-url', 'http://localhost:4000',
    '--provider', 'openai',
    '--generate-images',
    '--image-provider', 'glm',
    '--max-images', '2',
  ]);
  assert.equal(args.includes('heuristic'), false);
  assert.equal(args.includes('mock-svg'), false);
});

test('automatic formal dispatch requires an explicit true activation value', () => {
  assert.equal(shouldAutoRunWorker({}), false);
  assert.equal(shouldAutoRunWorker({ WORKER_AUTO_RUN: 'false' }), false);
  assert.equal(shouldAutoRunWorker({ WORKER_AUTO_RUN: 'true' }), true);
  assert.equal(shouldAutoRunWorker({ WORKER_AUTO_RUN: 'TRUE' }), false);
});
