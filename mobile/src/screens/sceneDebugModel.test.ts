import assert from 'node:assert/strict';
import test from 'node:test';
import type { SceneCandidateDebugDetail } from '../types/app';

const candidateDetail = (): SceneCandidateDebugDetail => ({
  id: 'candidate-1',
  taskId: 'task-1',
  bookId: 'book-1',
  chapterId: 'chapter-1',
  order: 0,
  sourceBlockId: 'paragraph-2',
  position: 1,
  reason: 'The exchange changes both characters.',
  sourceText: 'Lin handed Mo the sealed letter.',
  promptDraft: 'draft',
  confidence: 0.64,
  storedImageType: 'scene' as const,
  effectiveImageType: 'environment' as const,
  classification: {
    primaryType: 'interaction' as const,
    rankedTypes: [
      { imageType: 'interaction' as const, confidence: 0.64 },
      { imageType: 'action' as const, confidence: 0.23 },
      { imageType: 'portrait' as const, confidence: 0.13 },
    ],
    evidence: [{ sourceBlockId: 'paragraph-2', sourceText: 'Lin handed Mo the sealed letter.' }],
    reason: 'The exchange changes both characters.',
    auxiliaryTags: ['letter', 'suspense'],
    status: 'below_threshold' as const,
    model: 'kimi-k3',
    promptVersion: 'classification-v2',
  },
  contractVersion: 'composition-v1',
  profileVersion: 'profile-v3',
  attempts: [
    {
      id: 'attempt-old-publishable',
      idempotencyKey: 'automatic-1',
      candidateId: 'candidate-1',
      taskId: 'task-1',
      trigger: 'automatic' as const,
      requestedType: 'interaction' as const,
      status: 'publishable' as const,
      prompt: 'old prompt',
      imageUrl: 'https://example.test/publishable.png',
      createdAt: '2026-08-07T09:00:00.000Z',
    },
    {
      id: 'attempt-new-blocked',
      idempotencyKey: 'manual-1',
      candidateId: 'candidate-1',
      taskId: 'task-2',
      parentAttemptId: 'attempt-old-publishable',
      trigger: 'manual' as const,
      requestedType: 'action' as const,
      overriddenFrom: 'interaction' as const,
      status: 'blocked' as const,
      prompt: 'new prompt',
      imageUrl: 'https://example.test/blocked.png',
      audit: {
        verdict: 'blocked' as const,
        rules: [
          { rule: 'subject-count', passed: false, severity: 'severe' as const, explanation: 'Too many subjects.' },
          { rule: 'camera-angle', passed: true, severity: 'info' as const, explanation: 'Angle is compliant.' },
        ],
        severeFactConflict: false,
        provider: 'vision-provider',
        model: 'vision-model',
        auditVersion: 'audit-v1',
      },
      createdAt: '2026-08-07T10:00:00.000Z',
    },
    {
      id: 'attempt-audit-failed',
      idempotencyKey: 'manual-2',
      candidateId: 'candidate-1',
      taskId: 'task-3',
      trigger: 'manual' as const,
      requestedType: 'portrait' as const,
      status: 'audit_failed' as const,
      prompt: 'failed prompt',
      imageUrl: 'https://example.test/audit-failed.png',
      createdAt: '2026-08-07T08:00:00.000Z',
    },
  ],
});

const legacyCandidateDetail = () => ({
  id: 'legacy-character-candidate',
  taskId: 'rain-task-1',
  bookId: 'rain',
  chapterId: 'rain-chapter-1',
  order: 0,
  sourceBlockId: 'rain-p-1',
  position: 1,
  reason: 'Legacy person image',
  sourceText: 'A figure waits in the rain.',
  promptDraft: 'Legacy prompt',
  imageType: 'character' as const,
  effectiveImageType: null,
  confidence: 0.8,
  attempts: [],
} satisfies SceneCandidateDebugDetail);

test('maps a Server-shaped legacy candidate to an explicit unclassified state with no override confirmation', async () => {
  const { buildSceneDebugModel } = await import('./sceneDebugModel');

  const model = buildSceneDebugModel(legacyCandidateDetail());

  assert.equal(model.classificationState, 'legacy_unclassified');
  assert.equal(model.classificationMessage, 'Legacy candidate has no canonical classification. Reclassification is required before a canonical override can be confirmed.');
  assert.deepEqual(model.rankedTypes, []);
  assert.equal(model.primaryConfidencePercent, null);
  assert.equal(model.canConfirmOverride, false);
  assert.equal(model.initialOverrideType, null);
});

test('maps exactly three ranked types, primary confidence, and the 0.65 threshold message', async () => {
  const { buildSceneDebugModel } = await import('./sceneDebugModel');
  const model = buildSceneDebugModel(candidateDetail());

  assert.deepEqual(
    model.rankedTypes.map((ranked: { imageType: string; confidencePercent: number; isPrimary: boolean }) => ranked),
    [
      { imageType: 'interaction', confidencePercent: 64, isPrimary: true },
      { imageType: 'action', confidencePercent: 23, isPrimary: false },
      { imageType: 'portrait', confidencePercent: 13, isPrimary: false },
    ],
  );
  assert.equal(model.primaryConfidencePercent, 64);
  assert.equal(model.thresholdMessage, 'Below automatic generation threshold (0.65).');
});

test('maps audit severity and blocked status while ordering generation history newest first', async () => {
  const { buildSceneDebugModel } = await import('./sceneDebugModel');
  const model = buildSceneDebugModel(candidateDetail());

  assert.deepEqual(model.history.map((attempt: { id: string }) => attempt.id), [
    'attempt-new-blocked',
    'attempt-old-publishable',
    'attempt-audit-failed',
  ]);
  assert.equal(model.history[0].statusLabel, 'Blocked from reader');
  assert.deepEqual(model.history[0].auditRules[0], {
    rule: 'subject-count',
    passed: false,
    severity: 'severe',
    severityLabel: 'Severe',
    explanation: 'Too many subjects.',
  });
});

test('changing the selected override type creates no regeneration request', async () => {
  const { createRegenerationController } = await import('./sceneDebugModel');
  const requests: unknown[] = [];
  const controller = createRegenerationController({
    candidateId: 'candidate-1',
    initialType: 'interaction',
    createIdempotencyKey: () => 'manual-stable-key',
    submit: async (...args: unknown[]) => {
      requests.push(args);
      return { task: {}, attempt: {} };
    },
  });

  controller.selectOverride('action');

  assert.equal(requests.length, 0);
  assert.equal(controller.getState().selectedType, 'action');
});

test('explicit confirmation creates one canonical request with a stable idempotency key', async () => {
  const { createRegenerationController } = await import('./sceneDebugModel');
  const requests: Array<{ candidateId: string; overrideImageType: string; idempotencyKey: string }> = [];
  const controller = createRegenerationController({
    candidateId: 'candidate-1',
    initialType: 'environment',
    createIdempotencyKey: () => 'manual-stable-key',
    submit: async (candidateId: string, overrideImageType: string, idempotencyKey: string) => {
      requests.push({ candidateId, overrideImageType, idempotencyKey });
      return { task: {}, attempt: {} };
    },
  });

  controller.selectOverride('atmosphere');
  await controller.confirm();

  assert.deepEqual(requests, [{
    candidateId: 'candidate-1',
    overrideImageType: 'atmosphere',
    idempotencyKey: 'manual-stable-key',
  }]);
  assert.equal(controller.getState().idempotencyKey, 'manual-stable-key');
});

test('never maps blocked or failed attempts into reader images', async () => {
  const { mapPublishableAttemptsToReaderImages } = await import('./sceneDebugModel');
  const detail = candidateDetail();

  const readerImages = mapPublishableAttemptsToReaderImages(detail, detail.attempts);

  assert.deepEqual(readerImages.map((image: { attemptId?: string }) => image.attemptId), ['attempt-old-publishable']);
  assert.equal(readerImages[0].imageUrl, 'https://example.test/publishable.png');
});
