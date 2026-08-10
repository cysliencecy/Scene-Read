import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiInputError } from './imagePipeline.js';
import { upsertImageGenerationAttemptWithPersistence } from './repository.js';
import type { ImageAttemptPersistence } from './repository.js';

type PersistedAttemptRow = NonNullable<Awaited<ReturnType<ImageAttemptPersistence['findAttemptByKey']>>>;

const candidate = {
  id: 'candidate-1',
  chapter_id: 'chapter-1',
  source_block_id: 'block-1',
};

const attempt = {
  idempotencyKey: 'attempt-key',
  candidateId: candidate.id,
  taskId: 'task-1',
  trigger: 'automatic' as const,
  requestedType: 'environment' as const,
  status: 'publishable' as const,
  prompt: 'Rainy street, 3:2',
  provider: 'glm',
  model: 'glm-image',
  width: 1536,
  height: 1024,
  imageUrl: 'https://example.test/rain.png',
  audit: {
    verdict: 'publishable' as const,
    rules: [{ rule: 'environment-composition', passed: true, severity: 'info' as const, explanation: 'Compliant.' }],
    severeFactConflict: false,
    provider: 'vision',
    model: 'vision-model',
    auditVersion: 'audit-v1',
  },
  artifactMetadata: { mimeType: 'image/png', retainedForDebug: false },
};

class FakeSupabaseAttemptPersistence implements ImageAttemptPersistence {
  readonly attemptsByKey = new Map<string, PersistedAttemptRow>();
  readonly projections = new Map<string, Record<string, unknown>>();
  readonly candidates = new Map([[candidate.id, candidate]]);
  projectionFailuresRemaining = 0;
  successfulProjectionWrites = 0;
  uniqueViolations = 0;

  async findAttemptByKey(idempotencyKey: string) {
    return this.attemptsByKey.get(idempotencyKey) ?? null;
  }

  async insertAttempt(payload: Record<string, unknown>) {
    const idempotencyKey = payload.idempotency_key as string;
    if (this.attemptsByKey.has(idempotencyKey)) {
      this.uniqueViolations += 1;
      throw { code: '23505', message: 'duplicate key value violates unique constraint' };
    }
    const row = { ...payload, created_at: '2026-08-10T00:00:00.000Z' } as PersistedAttemptRow;
    this.attemptsByKey.set(idempotencyKey, row);
    return row;
  }

  async updateAttempt(id: string, payload: Record<string, unknown>) {
    const current = [...this.attemptsByKey.values()].find((row) => row.id === id);
    if (!current) throw new Error('ATTEMPT_NOT_FOUND');
    const row = { ...current, ...payload, created_at: current.created_at } as PersistedAttemptRow;
    this.attemptsByKey.set(payload.idempotency_key as string, row);
    return row;
  }

  async findCandidate(candidateId: string) {
    const row = this.candidates.get(candidateId);
    if (!row) throw new Error('CANDIDATE_NOT_FOUND');
    return row;
  }

  async upsertProjection(payload: Record<string, unknown>) {
    if (this.projectionFailuresRemaining > 0) {
      this.projectionFailuresRemaining -= 1;
      throw new Error('PROJECTION_UNAVAILABLE');
    }
    this.projections.set(payload.candidate_id as string, { ...payload });
    this.successfulProjectionWrites += 1;
  }
}

test('same-key retry repairs a projection after the terminal attempt committed', async () => {
  const persistence = new FakeSupabaseAttemptPersistence();
  persistence.projectionFailuresRemaining = 1;

  await assert.rejects(
    upsertImageGenerationAttemptWithPersistence(persistence, attempt),
    /PROJECTION_UNAVAILABLE/,
  );
  assert.equal(persistence.attemptsByKey.size, 1);
  assert.equal(persistence.projections.size, 0);

  const repaired = await upsertImageGenerationAttemptWithPersistence(persistence, attempt);

  assert.equal(repaired.id, persistence.attemptsByKey.get(attempt.idempotencyKey)?.id);
  assert.equal(persistence.attemptsByKey.size, 1);
  assert.equal(persistence.projections.size, 1);
  assert.equal(persistence.projections.get(candidate.id)?.attempt_id, repaired.id);
  assert.equal(persistence.successfulProjectionWrites, 1);
});

test('concurrent identical first callbacks converge after a unique-key race', async () => {
  const persistence = new FakeSupabaseAttemptPersistence();

  const [first, second] = await Promise.all([
    upsertImageGenerationAttemptWithPersistence(persistence, attempt),
    upsertImageGenerationAttemptWithPersistence(persistence, attempt),
  ]);

  assert.equal(first.id, second.id);
  assert.equal(persistence.attemptsByKey.size, 1);
  assert.equal(persistence.projections.size, 1);
  assert.equal(persistence.projections.get(candidate.id)?.attempt_id, first.id);
  assert.equal(persistence.uniqueViolations, 1);
});

test('concurrent conflicting identity preserves idempotency conflict semantics', async () => {
  const persistence = new FakeSupabaseAttemptPersistence();
  persistence.candidates.set('candidate-2', { ...candidate, id: 'candidate-2' });

  const results = await Promise.allSettled([
    upsertImageGenerationAttemptWithPersistence(persistence, attempt),
    upsertImageGenerationAttemptWithPersistence(persistence, { ...attempt, candidateId: 'candidate-2' }),
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof ApiInputError);
  assert.equal(rejected[0].reason.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(rejected[0].reason.status, 409);
  assert.equal(persistence.attemptsByKey.size, 1);
  assert.equal(persistence.projections.size, 1);
});
