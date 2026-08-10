import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const port = 4100 + Math.floor(Math.random() * 500);
const apiUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess;

async function requestAt(baseUrl: string, pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.json() as Record<string, unknown>;
  return { response, body };
}

const request = (pathname: string, init?: RequestInit) => requestAt(apiUrl, pathname, init);

async function waitForServer(baseUrl = apiUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const { response } = await requestAt(baseUrl, '/health');
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

function validAttemptPayload(candidateId: string, idempotencyKey: string) {
  return {
    idempotencyKey,
    candidateId,
    taskId: 'rain-task-1',
    trigger: 'automatic',
    requestedType: 'environment',
    prompt: 'A rain-soaked bridge, landscape 3:2.',
    status: 'publishable',
    provider: 'glm',
    model: 'glm-image',
    width: 1536,
    height: 1024,
    imageBase64: 'reader-artifact',
    mimeType: 'image/png',
    audit: {
      verdict: 'publishable',
      rules: [{ rule: 'environment-composition', passed: true, severity: 'info', explanation: 'Compliant.' }],
      severeFactConflict: false,
      provider: 'vision',
      model: 'vision-model',
      auditVersion: 'audit-v1',
    },
  };
}

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_URL: '',
      WORKER_AUTO_RUN: 'false',
    },
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

test('eligible callback produces one audited attempt and one published reader projection', async () => {
  const candidateId = 'e2e-eligible-candidate';
  const idempotencyKey = 'e2e-eligible-attempt';
  await request('/worker/scene-candidates', {
    method: 'POST',
    body: JSON.stringify(candidatePayload(candidateId)),
  });
  const callback = {
    idempotencyKey,
    candidateId,
    taskId: 'rain-task-1',
    trigger: 'automatic',
    requestedType: 'environment',
    prompt: 'A rain-soaked bridge, landscape 3:2.',
    status: 'publishable',
    provider: 'glm',
    model: 'glm-image',
    width: 1536,
    height: 1024,
    imageBase64: 'eligible-reader-artifact',
    mimeType: 'image/png',
    audit: {
      verdict: 'publishable',
      rules: [{ rule: 'environment-composition', passed: true, severity: 'info', explanation: 'Compliant.' }],
      severeFactConflict: false,
      provider: 'vision',
      model: 'vision-model',
      auditVersion: 'audit-v1',
    },
  };
  const first = await request('/worker/image-generation-attempts', {
    method: 'POST', body: JSON.stringify(callback),
  });
  const repeated = await request('/worker/image-generation-attempts', {
    method: 'POST', body: JSON.stringify(callback),
  });

  assert.equal(first.response.status, 200);
  assert.deepEqual(repeated.body.data, first.body.data);
  const debug = await request('/scene-candidates?chapterId=rain-chapter-1&includeAttempts=true');
  const candidate = (debug.body.data as Array<Record<string, any>>).find((item) => item.id === candidateId);
  assert.ok(candidate);
  assert.equal(candidate.attempts.length, 1);
  assert.equal(candidate.attempts[0].audit.verdict, 'publishable');
  const reader = await request('/scene-images');
  const projections = (reader.body.data as Array<Record<string, unknown>>)
    .filter((image) => image.candidateId === candidateId);
  assert.equal(projections.length, 1);
  assert.equal(projections[0].attemptId, candidate.attempts[0].id);
  assert.equal(projections[0].imageUrl, 'data:image/png;base64,eligible-reader-artifact');
});

test('publishable and blocked callbacks reject missing, malformed, or contradictory audit artifacts', async () => {
  const candidateId = 'e2e-invalid-attempt-candidate';
  await request('/worker/scene-candidates', {
    method: 'POST', body: JSON.stringify(candidatePayload(candidateId)),
  });
  const valid = validAttemptPayload(candidateId, 'invalid-attempt-base');
  const cases: Array<[string, Record<string, unknown>]> = [
    ['audit-less', { ...valid, idempotencyKey: 'invalid-audit-less', audit: undefined }],
    ['artifact-less', { ...valid, idempotencyKey: 'invalid-artifact-less', imageBase64: undefined }],
    ['empty-rules', {
      ...valid,
      idempotencyKey: 'invalid-empty-rules',
      audit: { ...valid.audit, rules: [] },
    }],
    ['malformed-rule', {
      ...valid,
      idempotencyKey: 'invalid-malformed-rule',
      audit: { ...valid.audit, rules: [{ rule: 'fact', passed: false, severity: 'critical', explanation: 'Invalid severity.' }] },
    }],
    ['contradictory-verdict', {
      ...valid,
      idempotencyKey: 'invalid-contradictory-verdict',
      audit: { ...valid.audit, verdict: 'blocked' },
    }],
    ['severe-conflict', {
      ...valid,
      idempotencyKey: 'invalid-severe-conflict',
      audit: { ...valid.audit, severeFactConflict: true },
    }],
    ['failed-severe-rule', {
      ...valid,
      idempotencyKey: 'invalid-failed-severe-rule',
      audit: { ...valid.audit, rules: [{ rule: 'fact', passed: false, severity: 'severe', explanation: 'Wrong landmark.' }] },
    }],
    ['blocked-with-publishable-audit', {
      ...valid,
      idempotencyKey: 'invalid-blocked-verdict',
      status: 'blocked',
    }],
    ['blocked-without-severe-basis', {
      ...valid,
      idempotencyKey: 'invalid-blocked-without-severe-basis',
      status: 'blocked',
      audit: { ...valid.audit, verdict: 'blocked' },
    }],
    ['blocked-artifact-less', {
      ...valid,
      idempotencyKey: 'invalid-blocked-artifact-less',
      status: 'blocked',
      imageBase64: undefined,
      audit: { ...valid.audit, verdict: 'blocked' },
    }],
    ['blocked-audit-less', {
      ...valid,
      idempotencyKey: 'invalid-blocked-audit-less',
      status: 'blocked',
      audit: undefined,
    }],
  ];

  for (const [name, payload] of cases) {
    const result = await request('/worker/image-generation-attempts', {
      method: 'POST', body: JSON.stringify(payload),
    });
    assert.equal(result.response.status, 400, name);
    assert.equal(result.body.error, 'INVALID_PAYLOAD', name);
  }

  const reader = await request('/scene-images');
  assert.equal((reader.body.data as Array<Record<string, unknown>>)
    .some((image) => image.candidateId === candidateId), false);
});

test('blocked callback requires a severe fact conflict or failed severe rule', async () => {
  const candidateId = 'e2e-invalid-blocked-basis-candidate';
  await request('/worker/scene-candidates', {
    method: 'POST', body: JSON.stringify(candidatePayload(candidateId)),
  });
  const valid = validAttemptPayload(candidateId, 'invalid-blocked-basis');
  const result = await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify({
      ...valid,
      status: 'blocked',
      audit: { ...valid.audit, verdict: 'blocked' },
    }),
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, 'INVALID_PAYLOAD');
  const reader = await request('/scene-images');
  assert.equal((reader.body.data as Array<Record<string, unknown>>)
    .some((image) => image.candidateId === candidateId), false);
});

test('below-threshold callback remains queryable with no attempt or reader projection', async () => {
  const candidateId = 'e2e-below-threshold-candidate';
  const payload = candidatePayload(candidateId);
  payload.candidates[0].classification.status = 'below_threshold';
  payload.candidates[0].classification.rankedTypes[0].confidence = 0.649;
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(payload) });

  const debug = await request('/scene-candidates?chapterId=rain-chapter-1&includeAttempts=true');
  const candidate = (debug.body.data as Array<Record<string, any>>).find((item) => item.id === candidateId);
  assert.ok(candidate);
  assert.equal(candidate.classification.status, 'below_threshold');
  assert.equal(candidate.classification.rankedTypes[0].confidence, 0.649);
  assert.deepEqual(candidate.attempts, []);
  const reader = await request('/scene-images');
  assert.equal((reader.body.data as Array<Record<string, unknown>>)
    .some((image) => image.candidateId === candidateId), false);
});

test('formal Worker candidate callback rejects legacy-shaped writes', async () => {
  const legacyTypes = ['scene', 'object', 'character'] as const;
  const result = await request('/worker/scene-candidates', {
    method: 'POST',
    body: JSON.stringify({
      taskId: 'rain-task-1', bookId: 'rain', chapterId: 'rain-chapter-1',
      candidates: legacyTypes.map((imageType, index) => ({
        id: `legacy-${imageType}-e2e`, sourceBlockId: 'rain-p-1', position: index,
        reason: `Legacy ${imageType}`, sourceText: 'Legacy source.', promptDraft: 'Legacy prompt.',
        imageType, confidence: 0.8,
      })),
      generatedImages: [],
    }),
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, 'INVALID_PAYLOAD');
});

test('legacy scene, object, and character candidates retain stored values and compatibility reads', async () => {

  const debug = await request('/scene-candidates?chapterId=rain-chapter-1&includeAttempts=true');
  const candidates = debug.body.data as Array<Record<string, any>>;
  const legacyScene = candidates.find((candidate) => candidate.id === 'legacy-scene-e2e');
  const legacyObject = candidates.find((candidate) => candidate.id === 'legacy-object-e2e');
  const legacyCharacter = candidates.find((candidate) => candidate.id === 'legacy-character-e2e');
  assert.ok(legacyScene);
  assert.ok(legacyObject);
  assert.ok(legacyCharacter);
  assert.equal(legacyScene.imageType, 'scene');
  assert.equal(legacyScene.effectiveImageType, 'environment');
  assert.equal(legacyObject.imageType, 'object');
  assert.equal(legacyObject.effectiveImageType, 'object');
  assert.equal(legacyCharacter.imageType, 'character');
  assert.equal(legacyCharacter.effectiveImageType, null);
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

test('automatic attempt sharing a task id is never serialized as manual generation', async () => {
  const candidateId = 'debug-candidate-automatic-task-payload';
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(candidatePayload(candidateId)) });
  await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: 'automatic-task-payload-key',
      candidateId,
      taskId: 'station-task-1',
      trigger: 'automatic',
      requestedType: 'environment',
      prompt: 'Automatic attempt prompt',
      status: 'generation_failed',
    }),
  });

  const { response, body } = await request('/worker/tasks/station-task-1/chapter-payload');
  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(body.data as object, 'manualGeneration'), false);
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
    body: JSON.stringify(payload),
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
      provider: 'glm',
      model: 'glm-image',
      width: 1536,
      height: 1024,
      imageBase64: 'blocked-reader-artifact',
      mimeType: 'image/png',
      audit: {
        verdict: 'blocked',
        rules: [{ rule: 'fact', passed: false, severity: 'severe', explanation: 'Wrong landmark.' }],
        severeFactConflict: true,
        provider: 'vision',
        model: 'vision-v2',
        auditVersion: 'audit-v3',
      },
    }),
  });
  assert.equal(callback.response.status, 200);

  const { body } = await request('/scene-images');
  const images = body.data as Array<Record<string, unknown>>;
  assert.equal(images.some((image) => image.candidateId === candidateId), false);
  assert.equal(JSON.stringify(images).includes('blocked-reader-artifact'), false);

  const debug = await request('/scene-candidates?chapterId=rain-chapter-1&includeAttempts=true');
  const candidate = (debug.body.data as Array<Record<string, any>>).find((item) => item.id === candidateId);
  assert.ok(candidate);
  assert.equal(candidate.attempts[0].imageUrl, 'data:image/png;base64,blocked-reader-artifact');
  assert.deepEqual(candidate.attempts[0].artifactMetadata, {
    mimeType: 'image/png',
    retainedForDebug: true,
  });
  assert.equal(candidate.attempts[0].status, 'blocked');
  assert.deepEqual(candidate.attempts[0].audit, {
    verdict: 'blocked',
    rules: [{ rule: 'fact', passed: false, severity: 'severe', explanation: 'Wrong landmark.' }],
    severeFactConflict: true,
    provider: 'vision',
    model: 'vision-v2',
    auditVersion: 'audit-v3',
  });
});

test('manual regeneration requires canonical override and key, links its parent, and is idempotent', async () => {
  const candidateId = 'debug-candidate-manual';
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(candidatePayload(candidateId)) });
  const parent = await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify(validAttemptPayload(candidateId, 'manual-parent-key')),
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

  const debug = await request('/scene-candidates?chapterId=rain-chapter-1&includeAttempts=true');
  const candidate = (debug.body.data as Array<Record<string, any>>).find((item) => item.id === candidateId);
  assert.ok(candidate);
  assert.deepEqual(candidate.attempts.map((attempt: Record<string, unknown>) => attempt.id), [
    (parent.body.data as Record<string, unknown>).id,
    data.attempt.id,
  ]);
});

test('manual command lifecycle preserves immutable queued provenance through terminal callback and debug query', async () => {
  const candidateId = 'debug-candidate-manual-lifecycle';
  await request('/worker/scene-candidates', { method: 'POST', body: JSON.stringify(candidatePayload(candidateId)) });
  const parent = await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify(validAttemptPayload(candidateId, 'manual-lifecycle-parent')),
  });
  const command = await request(`/scene-candidates/${candidateId}/regenerations`, {
    method: 'POST',
    body: JSON.stringify({ overrideImageType: 'interaction', idempotencyKey: 'manual-lifecycle-key' }),
  });
  assert.equal(command.response.status, 201);
  const queued = (command.body.data as Record<string, any>).attempt;
  assert.equal(queued.status, 'queued');
  assert.equal(queued.overriddenFrom, 'environment');
  assert.equal(queued.parentAttemptId, (parent.body.data as Record<string, unknown>).id);

  const terminal = await request('/worker/image-generation-attempts', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: queued.idempotencyKey,
      candidateId,
      taskId: queued.taskId,
      trigger: 'manual',
      requestedType: 'interaction',
      prompt: 'Terminal interaction prompt',
      status: 'blocked',
      provider: 'glm',
      model: 'glm-image',
      width: 1536,
      height: 1024,
      imageBase64: 'manual-blocked-artifact',
      mimeType: 'image/png',
      audit: {
        verdict: 'blocked',
        rules: [{ rule: 'type', passed: false, severity: 'severe', explanation: 'Interaction missing.' }],
        severeFactConflict: false,
        provider: 'vision',
        model: 'vision-v2',
        auditVersion: 'audit-v3',
      },
    }),
  });
  assert.equal(terminal.response.status, 200);
  const completed = terminal.body.data as Record<string, any>;
  assert.equal(completed.id, queued.id);
  assert.equal(completed.createdAt, queued.createdAt);
  assert.equal(completed.idempotencyKey, queued.idempotencyKey);
  assert.equal(completed.candidateId, queued.candidateId);
  assert.equal(completed.taskId, queued.taskId);
  assert.equal(completed.trigger, queued.trigger);
  assert.equal(completed.requestedType, queued.requestedType);
  assert.equal(completed.parentAttemptId, queued.parentAttemptId);
  assert.equal(completed.overriddenFrom, queued.overriddenFrom);
  assert.equal(completed.status, 'blocked');

  const debug = await request('/scene-candidates?chapterId=rain-chapter-1&includeAttempts=true');
  const candidate = (debug.body.data as Array<Record<string, any>>).find((item) => item.id === candidateId);
  assert.ok(candidate);
  const history = candidate.attempts.find((attempt: Record<string, unknown>) => attempt.id === queued.id);
  assert.deepEqual(history, completed);
});

test('legacy character regeneration emits reclassification instruction and never assumes portrait', async () => {
  const candidateId = 'legacy-character-e2e';

  const result = await request(`/scene-candidates/${candidateId}/regenerations`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: 'legacy-reclassify-key' }),
  });
  assert.equal(result.response.status, 202);
  const data = result.body.data as Record<string, any>;
  assert.equal(data.instruction.kind, 'reclassify');
  assert.equal(data.instruction.candidateId, candidateId);
  assert.equal(JSON.stringify(data).includes('portrait'), false);
});

test('legacy character reclassification repeated after worker exit returns existing instruction without redispatch', async () => {
  const isolatedPort = port + 1000;
  const isolatedUrl = `http://127.0.0.1:${isolatedPort}`;
  const stderr: string[] = [];
  const stdout: string[] = [];
  const isolatedServer = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      PORT: String(isolatedPort),
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_URL: '',
      WORKER_AUTO_RUN: 'true',
      WORKER_PYTHON: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  isolatedServer.stderr?.on('data', (data) => stderr.push(String(data)));
  isolatedServer.stdout?.on('data', (data) => stdout.push(String(data)));

  try {
    await waitForServer(isolatedUrl);
    const candidateId = 'legacy-character-e2e';
    const requestBody = { idempotencyKey: 'legacy-dispatch-once-key' };
    const first = await requestAt(isolatedUrl, `/scene-candidates/${candidateId}/regenerations`, {
      method: 'POST', body: JSON.stringify(requestBody),
    });
    const taskId = (first.body.data as Record<string, any>).task.id;
    const dispatchPattern = new RegExp(`\\[worker:${taskId}\\] (?:exited|failed to start)`, 'g');
    const serverOutput = () => `${stdout.join('')}\n${stderr.join('')}`;
    for (let attempt = 0; attempt < 200 && (serverOutput().match(dispatchPattern) ?? []).length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal((serverOutput().match(dispatchPattern) ?? []).length, 1, serverOutput());

    const repeated = await requestAt(isolatedUrl, `/scene-candidates/${candidateId}/regenerations`, {
      method: 'POST', body: JSON.stringify(requestBody),
    });
    for (let attempt = 0; attempt < 40 && (serverOutput().match(dispatchPattern) ?? []).length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.deepEqual(repeated.body.data, first.body.data);
    assert.equal((serverOutput().match(dispatchPattern) ?? []).length, 1, serverOutput());
  } finally {
    if (isolatedServer.exitCode === null) {
      isolatedServer.kill();
      await once(isolatedServer, 'exit');
    }
  }
});
