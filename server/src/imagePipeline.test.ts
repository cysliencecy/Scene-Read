import assert from 'node:assert/strict';
import test from 'node:test';

import {
  effectiveImageType,
  isPublishableAttempt,
  parseAttemptCallback,
  validateCanonicalImageTypeForWrite,
} from './imagePipeline.js';

test('normalizes legacy stored image types without mutating their stored value', () => {
  assert.equal(effectiveImageType('scene'), 'environment');
  assert.equal(effectiveImageType('object'), 'object');
  assert.equal(effectiveImageType('character'), null);
});

test('rejects legacy scene and character values for new canonical writes', () => {
  assert.throws(() => validateCanonicalImageTypeForWrite('scene'), /canonical image type/i);
  assert.throws(() => validateCanonicalImageTypeForWrite('character'), /canonical image type/i);
  assert.equal(validateCanonicalImageTypeForWrite('environment'), 'environment');
});

test('only publishable attempts can update a reader projection', () => {
  const publishable = {
    status: 'publishable' as const,
    provider: 'glm', model: 'glm-image', width: 1536, height: 1024,
    imageUrl: 'data:image/png;base64,image',
    artifactMetadata: { mimeType: 'image/png' },
    audit: {
      verdict: 'publishable' as const,
      rules: [{ rule: 'composition', passed: true, severity: 'info' as const, explanation: 'Compliant.' }],
      severeFactConflict: false,
      provider: 'vision', model: 'vision-model', auditVersion: 'audit-v1',
    },
  };
  assert.equal(isPublishableAttempt(publishable), true);
  assert.equal(isPublishableAttempt({ ...publishable, audit: undefined }), false);
  assert.equal(isPublishableAttempt({ status: 'blocked' }), false);
  assert.equal(isPublishableAttempt({ status: 'generation_failed' }), false);
});

test('attempt parser preserves queued and failure-state artifact semantics', () => {
  const base = {
    idempotencyKey: 'attempt-key', candidateId: 'candidate-1', taskId: 'task-1',
    trigger: 'automatic', requestedType: 'environment', prompt: 'prompt',
  };
  assert.equal(parseAttemptCallback({ ...base, status: 'queued' }).status, 'queued');
  assert.equal(parseAttemptCallback({ ...base, status: 'generation_failed' }).status, 'generation_failed');
  const auditFailed = parseAttemptCallback({
    ...base, status: 'audit_failed', provider: 'glm', model: 'glm-image', width: 1536, height: 1024,
    imageBase64: 'artifact', mimeType: 'image/png',
  });
  assert.equal(auditFailed.status, 'audit_failed');
  assert.equal(auditFailed.imageBase64, 'artifact');
  assert.throws(
    () => parseAttemptCallback({ ...base, status: 'generation_failed', imageBase64: 'partial-artifact' }),
    /INVALID_PAYLOAD/,
  );
});
