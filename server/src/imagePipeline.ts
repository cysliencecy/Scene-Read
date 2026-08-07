import type { AttemptStatus, CanonicalImageType, StoredImageType } from './types.js';

const canonicalImageTypes = new Set<CanonicalImageType>([
  'environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere',
]);

export function effectiveImageType(type: StoredImageType | null | undefined): CanonicalImageType | null {
  if (type === 'scene') return 'environment';
  if (type === 'character' || !type) return null;
  return type;
}

export function validateCanonicalImageTypeForWrite(type: string): CanonicalImageType {
  if (!canonicalImageTypes.has(type as CanonicalImageType)) {
    throw new Error(`Expected a canonical image type for new writes; received ${type}`);
  }
  return type as CanonicalImageType;
}

export function isPublishableAttempt(attempt: Pick<{ status: AttemptStatus }, 'status'>): boolean {
  return attempt.status === 'publishable';
}
