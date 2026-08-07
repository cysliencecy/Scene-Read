import assert from 'node:assert/strict';
import test from 'node:test';

import {
  effectiveImageType,
  isPublishableAttempt,
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
  assert.equal(isPublishableAttempt({ status: 'publishable' }), true);
  assert.equal(isPublishableAttempt({ status: 'blocked' }), false);
  assert.equal(isPublishableAttempt({ status: 'generation_failed' }), false);
});
