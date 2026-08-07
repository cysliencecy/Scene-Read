import type {
  AttemptStatus,
  CanonicalImageType,
  ImageAuditResult,
  ImageGenerationAttempt,
  SceneCandidateDebugDetail,
  SceneImage,
} from '../types/app';

export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.65;

export const CANONICAL_IMAGE_TYPES: readonly CanonicalImageType[] = [
  'environment',
  'portrait',
  'interaction',
  'action',
  'object',
  'atmosphere',
];

const attemptStatusLabels: Record<AttemptStatus, string> = {
  queued: 'Queued',
  generation_failed: 'Generation failed',
  audit_failed: 'Audit failed',
  blocked: 'Blocked from reader',
  publishable: 'Published to reader',
};

const severityLabels: Record<ImageAuditResult['rules'][number]['severity'], string> = {
  info: 'Info',
  warning: 'Warning',
  severe: 'Severe',
};

const confidencePercent = (confidence: number) => Math.round(confidence * 100);

export function attemptStatusLabel(status: AttemptStatus) {
  return attemptStatusLabels[status];
}

export function auditSeverityLabel(severity: ImageAuditResult['rules'][number]['severity']) {
  return severityLabels[severity];
}

export function buildSceneDebugModel(detail: SceneCandidateDebugDetail) {
  const primaryConfidence = detail.classification.rankedTypes[0]?.confidence ?? detail.confidence;
  const thresholdMessage = detail.classification.status === 'below_threshold'
    ? `Below automatic generation threshold (${CLASSIFICATION_CONFIDENCE_THRESHOLD.toFixed(2)}).`
    : detail.classification.status === 'invalid'
      ? 'Classification is invalid and cannot generate automatically.'
      : `Eligible for automatic generation at or above ${CLASSIFICATION_CONFIDENCE_THRESHOLD.toFixed(2)}.`;

  const history = [...detail.attempts]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((attempt) => ({
      ...attempt,
      statusLabel: attemptStatusLabel(attempt.status),
      auditRules: (attempt.audit?.rules ?? []).map((rule) => ({
        ...rule,
        severityLabel: auditSeverityLabel(rule.severity),
      })),
    }));

  return {
    id: detail.id,
    sourceBlockId: detail.sourceBlockId,
    sourceText: detail.sourceText,
    reason: detail.classification.reason,
    rankedTypes: detail.classification.rankedTypes.map((ranked, index) => ({
      imageType: ranked.imageType,
      confidencePercent: confidencePercent(ranked.confidence),
      isPrimary: index === 0,
    })),
    primaryConfidencePercent: confidencePercent(primaryConfidence),
    thresholdMessage,
    classificationStatus: detail.classification.status,
    evidence: detail.classification.evidence,
    auxiliaryTags: detail.classification.auxiliaryTags,
    classificationModel: detail.classification.model,
    promptVersion: detail.classification.promptVersion,
    contractVersion: detail.contractVersion,
    profileVersion: detail.profileVersion,
    history,
  };
}

type RegenerationControllerOptions = {
  candidateId: string;
  initialType: CanonicalImageType;
  createIdempotencyKey: () => string;
  submit: (
    candidateId: string,
    overrideImageType: CanonicalImageType,
    idempotencyKey: string,
  ) => Promise<unknown>;
};

type RegenerationState = {
  selectedType: CanonicalImageType;
  idempotencyKey?: string;
  status: 'idle' | 'pending' | 'success' | 'error';
  error?: string;
};

export function createRegenerationController(options: RegenerationControllerOptions) {
  let state: RegenerationState = { selectedType: options.initialType, status: 'idle' };
  let inFlight: Promise<unknown> | null = null;

  return {
    getState: () => ({ ...state }),
    selectOverride(selectedType: CanonicalImageType) {
      if (selectedType === state.selectedType) return;
      state = { selectedType, status: 'idle' };
    },
    confirm() {
      if (inFlight) return inFlight;
      const idempotencyKey = state.idempotencyKey ?? options.createIdempotencyKey();
      state = { ...state, idempotencyKey, status: 'pending', error: undefined };
      inFlight = options.submit(options.candidateId, state.selectedType, idempotencyKey)
        .then((result) => {
          state = { ...state, status: 'success' };
          return result;
        })
        .catch((error: unknown) => {
          state = {
            ...state,
            status: 'error',
            error: error instanceof Error ? error.message : 'Regeneration request failed',
          };
          throw error;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}

export function mapPublishableAttemptsToReaderImages(
  detail: Pick<SceneCandidateDebugDetail, 'id' | 'chapterId' | 'sourceBlockId' | 'position'>,
  attempts: ImageGenerationAttempt[],
): SceneImage[] {
  return attempts
    .filter((attempt) => attempt.status === 'publishable' && Boolean(attempt.imageUrl))
    .map((attempt) => ({
      id: `attempt-image-${attempt.id}`,
      chapterId: detail.chapterId,
      sourceBlockId: detail.sourceBlockId,
      position: detail.position,
      imageType: attempt.requestedType,
      effectiveImageType: attempt.requestedType,
      candidateId: detail.id,
      attemptId: attempt.id,
      attemptStatus: attempt.status,
      variant: detail.position % 2 === 0 ? 'street' : 'office',
      prompt: attempt.prompt,
      imageUrl: attempt.imageUrl,
    }));
}

export function filterPublishableReaderImages(images: SceneImage[]) {
  return images.filter((image) => image.attemptStatus === undefined || image.attemptStatus === 'publishable');
}
