import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const port = 4100 + Math.floor(Math.random() * 500);
const apiUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess;

async function request(pathname: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.json() as Record<string, unknown>;
  return { response, body };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const { response } = await request('/health');
      if (response.ok) return;
    } catch {
      // Server startup is asynchronous.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not start');
}

function candidatePayload(id: string, overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'rain-task-1',
    bookId: 'rain',
    chapterId: 'rain-chapter-1',
    candidates: [{
      id,
      sourceBlockId: 'rain-p-1',
      position: 2,
      readingValue: 0.93,
      classification: {
        primaryType: 'environment',
        rankedTypes: [
          { imageType: 'environment', confidence: 0.91 },
          { imageType: 'atmosphere', confidence: 0.74 },
          { imageType: 'object', confidence: 0.31 },
        ],
        evidence: [{ sourceBlockId: 'rain-p-1', sourceText: 'Rain crossed the old bridge.' }],
        reason: 'The bridge establishes the setting.',
        auxiliaryTags: ['rain', 'clue'],
        status: 'eligible',
        model: 'kimi-k3',
        promptVersion: 'kimi-classification-v1',
      },
      contractVersion: 'composition-v1',
      profileVersion: 'profile-v1',
      ...overrides,
    }],
    profileFactSuggestions: [{
      field: 'weather',
      value: 'steady rain',
      sourceBlockId: 'rain-p-1',
      sourceText: 'Rain crossed the old bridge.',
      stability: 'stable',
    }],
  };
}

before(async () => {
  const tsxCli = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
  server = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: path.resolve('.'),
    env: { ...process.env, PORT: String(port), WORKER_AUTO_RUN: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer();
});

after(async () => {
  if (server.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
});

test('candidate debug detail includes ranked evidence, threshold state, versions, and attempts', async () => {
  const candidateId = 'debug-candidate-complete';
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(candidatePayload(candidateId)) });
  await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: 'debug-attempt-complete',
      candidateId,
      taskId: 'rain-task-1',
      trigger: 'automatic',
      requestedType: 'environment',
      prompt: 'A rain-soaked bridge, landscape 3:2.',
      status: 'blocked',
      provider: 'glm',
      model: 'glm-image-1',
      width: 768,
      height: 512,
      imageBase64: 'blocked-image',
      mimeType: 'image/png',
      audit: {
        verdict: 'blocked',
        rules: [{ rule: 'fact', passed: false, severity: 'severe', explanation: 'Wrong bridge.' }],
        severeFactConflict: true,
        provider: 'vision',
        model: 'vision-v2',
        auditVersion: 'audit-v3',
      },
    }),
  });

  const { response, body } = await request(`/scene-candidates?chapterId=rain-chapter-1&includeAttempts=true`);
  assert.equal(response.status, 200);
  const candidate = (body.data as Array<Record<string, any>>).find((item) => item.id === candidateId);
  assert.ok(candidate);
  assert.deepEqual(candidate.classification.rankedTypes, candidatePayload(candidateId).candidates[0].classification.rankedTypes);
  assert.deepEqual(candidate.classification.evidence, candidatePayload(candidateId).candidates[0].classification.evidence);
  assert.equal(candidate.classification.status, 'eligible');
  assert.equal(candidate.contractVersion, 'composition-v1');
  assert.equal(candidate.profileVersion, 'profile-v1');
  assert.equal(candidate.attempts.length, 1);
  assert.equal(candidate.attempts[0].audit.auditVersion, 'audit-v3');
});

test('repeated candidate/profile callback returns one candidate and one fact suggestion', async () => {
  const payload = candidatePayload('debug-candidate-idempotent');
  const first = await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(payload) });
  const repeated = await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(payload) });

  assert.equal(first.response.status, 200);
  assert.equal(repeated.response.status, 200);
  assert.equal((first.body.data as unknown[]).length, 1);
  assert.equal((repeated.body.data as unknown[]).length, 1);
  const detail = (repeated.body.data as Array<Record<string, any>>)[0];
  assert.equal(detail.profileFactSuggestions.length, 1);
  assert.deepEqual(repeated.body.data, first.body.data);
});

test('repeated attempt idempotency key returns the same attempt', async () => {
  const candidateId = 'debug-candidate-attempt-idempotent';
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(candidatePayload(candidateId)) });
  const payload = {
    idempotencyKey: 'attempt-idempotent-key',
    candidateId,
    taskId: 'rain-task-1',
    trigger: 'automatic',
    requestedType: 'environment',
    prompt: 'Bridge prompt',
    status: 'generation_failed',
  };
  const first = await request('/worker/image-generation-attempts', { method: 'POST', body: JSON.stringify(payload) });
  const repeated = await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify({ ...payload, status: 'publishable', imageBase64: 'must-not-win', mimeType: 'image/png' }),
  });

  assert.equal(first.response.status, 200);
  assert.equal(repeated.response.status, 200);
  assert.deepEqual(repeated.body.data, first.body.data);
  assert.equal((repeated.body.data as Record<string, unknown>).status, 'generation_failed');
});

test('blocked attempt artifact never appears in reader scene-images', async () => {
  const candidateId = 'debug-candidate-blocked-reader';
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(candidatePayload(candidateId)) });
  const callback = await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: 'blocked-reader-key',
      candidateId,
      taskId: 'rain-task-1',
      trigger: 'automatic',
      requestedType: 'environment',
      prompt: 'Blocked reader prompt',
      status: 'blocked',
      imageBase64: 'blocked-reader-artifact',
      mimeType: 'image/png',
    }),
  });
  assert.equal(callback.response.status, 200);

  const { body } = await request('/scene-images');
  const images = body.data as Array<Record<string, unknown>>;
  assert.equal(images.some((image) => image.candidateId === candidateId), false);
  assert.equal(JSON.stringify(images).includes('blocked-reader-artifact'), false);
});

test('manual regeneration requires canonical override and key, links its parent, and is idempotent', async () => {
  const candidateId = 'debug-candidate-manual';
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(candidatePayload(candidateId)) });
  const parent = await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: 'manual-parent-key', candidateId, taskId: 'rain-task-1', trigger: 'automatic',
      requestedType: 'environment', prompt: 'Parent prompt', status: 'publishable',
    }),
  });

  const missingOverride = await request(`/scene-candidates/${candidateId}/regenerations`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: 'manual-key' }),
  });
  assert.equal(missingOverride.response.status, 400);
  assert.equal(missingOverride.body.error, 'CANONICAL_OVERRIDE_REQUIRED');
  const missingKey = await request(`/scene-candidates/${candidateId}/regenerations`, {
    method: 'POST', body: JSON.stringify({ overrideImageType: 'interaction' }),
  });
  assert.equal(missingKey.response.status, 400);
  assert.equal(missingKey.body.error, 'IDEMPOTENCY_KEY_REQUIRED');

  const requestBody = { overrideImageType: 'interaction', idempotencyKey: 'manual-key' };
  const first = await request(`/scene-candidates/${candidateId}/regenerations`, { method: 'POST', body: JSON.stringify(requestBody) });
  const repeated = await request(`/scene-candidates/${candidateId}/regenerations`, { method: 'POST', body: JSON.stringify(requestBody) });
  assert.equal(first.response.status, 201);
  assert.deepEqual(repeated.body.data, first.body.data);
  const data = first.body.data as Record<string, any>;
  assert.equal(data.attempt.parentAttemptId, (parent.body.data as Record<string, unknown>).id);
  assert.equal(data.attempt.requestedType, 'interaction');
  assert.equal(data.attempt.trigger, 'manual');
  assert.equal(data.task.id, data.attempt.taskId);
});

test('legacy character regeneration emits reclassification instruction and never assumes portrait', async () => {
  const candidateId = 'legacy-character-candidate';
  await request('/worker/scene-candidates', {
    method: 'POST',
    body: JSON.stringify({
      taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
      candidates: [{
        id: candidateId, sourceBlockId: 'rain-p-1', position: 1, reason: 'Legacy person image',
        sourceText: 'A figure waits in the rain.', promptDraft: 'Legacy prompt', imageType: 'character', confidence: 0.8,
      }],
      generatedImages: [],
    }),
  });

  const result = await request(`/scene-candidates/${candidateId}/regenerations`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: 'legacy-reclassify-key' }),
  });
  assert.equal(result.response.status, 202);
  const data = result.body.data as Record<string, any>;
  assert.equal(data.instruction.kind, 'reclassify');
  assert.equal(data.instruction.candidateId, candidateId);
  assert.equal(JSON.stringify(data).includes('portrait'), false);
});
