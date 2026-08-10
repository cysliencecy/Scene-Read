import type {
  AttemptStatus,
  CandidateClassification,
  CanonicalImageType,
  ImageAuditResult,
  StoredImageType,
  VisualProfileFact,
} from './types.js';

const canonicalImageTypes = new Set<CanonicalImageType>([
  'environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere',
]);

const attemptStatuses = new Set<AttemptStatus>([
  'queued', 'generation_failed', 'audit_failed', 'blocked', 'publishable',
]);

export const API_ERROR_CODES = {
  invalidImageType: 'INVALID_IMAGE_TYPE',
  invalidPayload: 'INVALID_PAYLOAD',
  candidateNotFound: 'CANDIDATE_NOT_FOUND',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  canonicalOverrideRequired: 'CANONICAL_OVERRIDE_REQUIRED',
  idempotencyKeyRequired: 'IDEMPOTENCY_KEY_REQUIRED',
} as const;

export class ApiInputError extends Error {
  constructor(public readonly code: string, public readonly status = 400, message = code) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : requiredString(value);
}

function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return value;
}

function positiveInteger(value: unknown): number {
  const parsed = finiteNumber(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return parsed;
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return value;
}

function parseAudit(value: unknown): ImageAuditResult {
  const item = record(value);
  if (item.verdict !== 'publishable' && item.verdict !== 'blocked') {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  if (!Array.isArray(item.rules) || item.rules.length === 0) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  const rules = item.rules.map((value) => {
    const rule = record(value);
    if (rule.severity !== 'info' && rule.severity !== 'warning' && rule.severity !== 'severe') {
      throw new ApiInputError(API_ERROR_CODES.invalidPayload);
    }
    return {
      rule: requiredString(rule.rule),
      passed: requiredBoolean(rule.passed),
      severity: rule.severity as ImageAuditResult['rules'][number]['severity'],
      explanation: requiredString(rule.explanation),
    };
  });
  const severeFactConflict = requiredBoolean(item.severeFactConflict);
  const severe = severeFactConflict
    || rules.some((rule) => rule.severity === 'severe' && !rule.passed);
  const expectedVerdict = severe ? 'blocked' : 'publishable';
  if (item.verdict !== expectedVerdict) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return {
    verdict: expectedVerdict,
    rules,
    severeFactConflict,
    provider: requiredString(item.provider),
    model: requiredString(item.model),
    auditVersion: requiredString(item.auditVersion),
  };
}

function parseProfileFact(value: unknown): VisualProfileFact {
  const item = record(value);
  if (item.stability !== 'stable' && item.stability !== 'inferred') {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return {
    field: requiredString(item.field),
    value: requiredString(item.value),
    sourceBlockId: requiredString(item.sourceBlockId),
    sourceText: requiredString(item.sourceText),
    stability: item.stability,
  };
}

function parseClassification(value: unknown): CandidateClassification {
  const item = record(value);
  const ranked = Array.isArray(item.rankedTypes) ? item.rankedTypes.map((rank) => {
    const rankedItem = record(rank);
    return {
      imageType: validateCanonicalImageTypeForWrite(requiredString(rankedItem.imageType)),
      confidence: finiteNumber(rankedItem.confidence),
    };
  }) : [];
  if (ranked.length !== 3 || new Set(ranked.map((rank) => rank.imageType)).size !== 3) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  const evidence = Array.isArray(item.evidence) ? item.evidence.map((entry) => {
    const evidenceItem = record(entry);
    return { sourceBlockId: requiredString(evidenceItem.sourceBlockId), sourceText: requiredString(evidenceItem.sourceText) };
  }) : [];
  if (evidence.length === 0 || !['eligible', 'below_threshold', 'invalid'].includes(String(item.status))) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  if (ranked[0]?.imageType !== item.primaryType) throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  return {
    primaryType: validateCanonicalImageTypeForWrite(requiredString(item.primaryType)),
    rankedTypes: ranked as CandidateClassification['rankedTypes'],
    evidence,
    reason: requiredString(item.reason),
    auxiliaryTags: Array.isArray(item.auxiliaryTags) ? item.auxiliaryTags.map(requiredString) : [],
    status: item.status as CandidateClassification['status'],
    model: requiredString(item.model),
    promptVersion: requiredString(item.promptVersion),
  };
}

export type ParsedWorkerCandidateCallback = {
  taskId: string;
  bookId: string;
  chapterId: string;
  candidates: Array<{
    id: string;
    sourceBlockId: string;
    position: number;
    readingValue: number;
    classification: CandidateClassification;
    contractVersion: string;
    profileVersion?: string;
  }>;
  profileFactSuggestions: VisualProfileFact[];
};

export function parseWorkerCandidateCallback(value: unknown): ParsedWorkerCandidateCallback {
  const body = record(value);
  if (!Array.isArray(body.candidates) || !Array.isArray(body.profileFactSuggestions)) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return {
    taskId: requiredString(body.taskId),
    bookId: requiredString(body.bookId),
    chapterId: requiredString(body.chapterId),
    candidates: body.candidates.map((candidate) => {
      const item = record(candidate);
      return {
        id: requiredString(item.id),
        sourceBlockId: requiredString(item.sourceBlockId),
        position: finiteNumber(item.position),
        readingValue: finiteNumber(item.readingValue),
        classification: parseClassification(item.classification),
        contractVersion: requiredString(item.contractVersion),
        profileVersion: optionalString(item.profileVersion),
      };
    }),
    profileFactSuggestions: body.profileFactSuggestions.map(parseProfileFact),
  };
}

export type ParsedAttemptCallback = {
  idempotencyKey: string;
  candidateId: string;
  taskId: string;
  trigger: 'automatic' | 'manual';
  requestedType: CanonicalImageType;
  parentAttemptId?: string;
  prompt: string;
  status: AttemptStatus;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
  imageBase64?: string;
  mimeType?: string;
  audit?: ImageAuditResult;
};

export function parseAttemptCallback(value: unknown): ParsedAttemptCallback {
  const body = record(value);
  if (body.trigger !== 'automatic' && body.trigger !== 'manual') throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  if (!attemptStatuses.has(body.status as AttemptStatus)) throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  const parsed: ParsedAttemptCallback = {
    idempotencyKey: requiredString(body.idempotencyKey),
    candidateId: requiredString(body.candidateId),
    taskId: requiredString(body.taskId),
    trigger: body.trigger,
    requestedType: validateCanonicalImageTypeForWrite(requiredString(body.requestedType)),
    parentAttemptId: optionalString(body.parentAttemptId),
    prompt: requiredString(body.prompt),
    status: body.status as AttemptStatus,
    provider: optionalString(body.provider),
    model: optionalString(body.model),
    width: body.width === undefined ? undefined : positiveInteger(body.width),
    height: body.height === undefined ? undefined : positiveInteger(body.height),
    imageBase64: optionalString(body.imageBase64),
    mimeType: optionalString(body.mimeType),
    audit: body.audit === undefined ? undefined : parseAudit(body.audit),
  };
  const artifactFields = [
    parsed.provider,
    parsed.model,
    parsed.width,
    parsed.height,
    parsed.imageBase64,
    parsed.mimeType,
  ];
  const hasAnyArtifact = artifactFields.some((field) => field !== undefined);
  const hasCompleteArtifact = artifactFields.every((field) => field !== undefined);
  if (parsed.status === 'publishable' || parsed.status === 'blocked') {
    if (!hasCompleteArtifact || !parsed.audit || parsed.audit.verdict !== parsed.status) {
      throw new ApiInputError(API_ERROR_CODES.invalidPayload);
    }
    if (parsed.status === 'publishable' && (
      parsed.audit.severeFactConflict
      || parsed.audit.rules.some((rule) => rule.severity === 'severe' && !rule.passed)
    )) {
      throw new ApiInputError(API_ERROR_CODES.invalidPayload);
    }
  } else if (parsed.status === 'audit_failed') {
    if (!hasCompleteArtifact || parsed.audit !== undefined) {
      throw new ApiInputError(API_ERROR_CODES.invalidPayload);
    }
  } else if (hasAnyArtifact || parsed.audit !== undefined) {
    throw new ApiInputError(API_ERROR_CODES.invalidPayload);
  }
  return parsed;
}

export type ManualRegenerationCommand = {
  overrideImageType: CanonicalImageType;
  idempotencyKey: string;
};

export function parseManualRegeneration(value: unknown): ManualRegenerationCommand {
  const body = record(value);
  if (body.overrideImageType === undefined) throw new ApiInputError(API_ERROR_CODES.canonicalOverrideRequired);
  if (body.idempotencyKey === undefined || body.idempotencyKey === '') throw new ApiInputError(API_ERROR_CODES.idempotencyKeyRequired);
  return {
    overrideImageType: validateCanonicalImageTypeForWrite(requiredString(body.overrideImageType)),
    idempotencyKey: requiredString(body.idempotencyKey),
  };
}

export function effectiveImageType(type: StoredImageType | null | undefined): CanonicalImageType | null {
  if (type === 'scene') return 'environment';
  if (type === 'character' || !type) return null;
  return type;
}

export function validateCanonicalImageTypeForWrite(type: string): CanonicalImageType {
  if (!canonicalImageTypes.has(type as CanonicalImageType)) {
    throw new ApiInputError(
      API_ERROR_CODES.invalidImageType,
      400,
      `Expected a canonical image type for new writes; received ${type}`,
    );
  }
  return type as CanonicalImageType;
}

export function isPublishableAttempt(attempt: Pick<{
  status: AttemptStatus;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
  imageUrl?: string;
  audit?: ImageAuditResult;
  artifactMetadata?: unknown;
}, 'status' | 'provider' | 'model' | 'width' | 'height' | 'imageUrl' | 'audit' | 'artifactMetadata'>): boolean {
  const artifactMetadata = attempt.artifactMetadata && typeof attempt.artifactMetadata === 'object'
    ? attempt.artifactMetadata as Record<string, unknown>
    : undefined;
  let audit: ImageAuditResult;
  try {
    audit = parseAudit(attempt.audit);
  } catch {
    return false;
  }
  return attempt.status === 'publishable'
    && Boolean(attempt.provider?.trim())
    && Boolean(attempt.model?.trim())
    && Number.isInteger(attempt.width) && (attempt.width ?? 0) > 0
    && Number.isInteger(attempt.height) && (attempt.height ?? 0) > 0
    && Boolean(attempt.imageUrl?.trim())
    && typeof artifactMetadata?.mimeType === 'string' && artifactMetadata.mimeType.trim() !== ''
    && audit.verdict === 'publishable'
    && audit.severeFactConflict === false
    && !audit.rules.some((rule) => rule.severity === 'severe' && !rule.passed);
}
