import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryImageRepository, createSceneImage, type PersistedCandidateInput } from './repository.js';

const candidate: PersistedCandidateInput = {
  id: 'candidate-1',
  taskId: 'task-1',
  chapterId: 'chapter-1',
  sourceBlockId: 'block-1',
  sourceText: 'A rain-soaked street.',
  promptDraft: 'Rainy street',
  classification: {
    primaryType: 'environment' as const,
    rankedTypes: [
      { imageType: 'environment' as const, confidence: 0.9 },
      { imageType: 'atmosphere' as const, confidence: 0.08 },
      { imageType: 'object' as const, confidence: 0.02 },
    ],
    evidence: [{ sourceBlockId: 'block-1', sourceText: 'A rain-soaked street.' }],
    reason: 'The place establishes the reading beat.',
    auxiliaryTags: [],
    status: 'eligible' as const,
    model: 'kimi-k3',
    promptVersion: 'candidate-v1',
  },
  contractVersion: 'composition-v1',
};

const attempt = {
  idempotencyKey: 'attempt-key-1',
  candidateId: 'candidate-1',
  taskId: 'task-1',
  trigger: 'automatic' as const,
  requestedType: 'environment' as const,
  status: 'publishable' as const,
  prompt: 'Rainy street, 3:2',
  imageUrl: 'https://example.test/rain.png',
};

test('duplicate attempt idempotency keys return one logical append-only record', async () => {
  const repository = createInMemoryImageRepository();
  await repository.upsertCandidate(candidate);

  const first = await repository.upsertAttempt(attempt);
  const repeated = await repository.upsertAttempt({ ...attempt, status: 'blocked' });

  assert.equal(repeated.id, first.id);
  assert.equal((await repository.listAttempts(candidate.id)).length, 1);
  assert.equal(repeated.status, 'publishable');
});

test('only publishable attempts update the reader projection', async () => {
  const repository = createInMemoryImageRepository();
  await repository.upsertCandidate(candidate);

  await repository.upsertAttempt({ ...attempt, status: 'blocked' });
  assert.equal(await repository.getProjection(candidate.id), null);

  const published = await repository.upsertAttempt({ ...attempt, idempotencyKey: 'attempt-key-2' });
  assert.equal((await repository.getProjection(candidate.id))?.attemptId, published.id);
});

test('profile upserts preserve stable facts and version data', async () => {
  const repository = createInMemoryImageRepository();
  const original = await repository.upsertProfile({
    bookId: 'book-1',
    entityType: 'character',
    entityKey: 'lin',
    stableFacts: [{ field: 'hair', value: 'black', sourceBlockId: 'block-1', sourceText: 'Lin has black hair.', stability: 'stable' }],
    flexibleFacts: [],
    version: 'profile-v1',
  });
  const merged = await repository.upsertProfile({
    bookId: 'book-1',
    entityType: 'character',
    entityKey: 'lin',
    stableFacts: [{ field: 'hair', value: 'brown', sourceBlockId: 'block-2', sourceText: 'Contradictory description.', stability: 'stable' }],
    flexibleFacts: [{ field: 'coat', value: 'navy', sourceBlockId: 'block-2', sourceText: 'Lin wears a navy coat.', stability: 'inferred' }],
    version: 'profile-v2',
  });

  assert.equal(merged.id, original.id);
  assert.equal(merged.version, 'profile-v2');
  assert.deepEqual(merged.stableFacts, original.stableFacts);
  assert.equal(merged.flexibleFacts[0]?.value, 'navy');
});

test('legacy images without an attempt reference remain queryable', async () => {
  const repository = createInMemoryImageRepository({
    legacyImages: [{
      id: 'legacy-scene-image',
      chapterId: 'chapter-1',
      imageType: 'scene',
      variant: 'street',
      prompt: 'Legacy scene',
    }],
  });

  const images = await repository.listReaderImages();
  assert.equal(images[0]?.id, 'legacy-scene-image');
  assert.equal(images[0]?.attemptId, undefined);
  assert.equal(images[0]?.effectiveImageType, 'environment');
});

test('new reader projections reject direct scene-image writes without a publishable attempt', async () => {
  await assert.rejects(
    createSceneImage({
      chapterId: 'chapter-1',
      imageType: 'environment',
      variant: 'street',
      prompt: 'Unaudited image',
    }),
    /READER_PROJECTION_MANAGED_BY_PUBLISHABLE_ATTEMPT/,
  );
});
