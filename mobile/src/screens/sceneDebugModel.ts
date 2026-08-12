import type {
  AttemptStatus,
  CanonicalImageType,
  ImageAuditResult,
  ImageGenerationAttempt,
  SceneCandidateDebugDetail,
  SceneImage,
  StoredImageType,
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
  queued: '等待生成',
  generation_failed: '生成失败',
  audit_failed: '审核失败',
  blocked: '已阻止在阅读页显示',
  publishable: '已发布到阅读页',
};

const severityLabels: Record<ImageAuditResult['rules'][number]['severity'], string> = {
  info: '提示',
  warning: '警告',
  severe: '严重',
};

const imageTypeLabels: Record<StoredImageType, string> = {
  environment: '环境', portrait: '人物肖像', interaction: '人物互动',
  action: '动作', object: '物品', atmosphere: '氛围',
  scene: '场景（旧版）', character: '人物（旧版）',
};

export function imageTypeLabel(imageType: StoredImageType | null | undefined) {
  return imageType ? imageTypeLabels[imageType] : '-';
}

const confidencePercent = (confidence: number) => Math.round(confidence * 100);

export function attemptStatusLabel(status: AttemptStatus) {
  return attemptStatusLabels[status];
}

export function auditSeverityLabel(severity: ImageAuditResult['rules'][number]['severity']) {
  return severityLabels[severity];
}

export function buildSceneDebugModel(detail: SceneCandidateDebugDetail) {
  const classification = detail.classification;
  const legacyClassificationMessage = '旧版候选场景没有标准分类，需要重新分类后才能确认类型调整。';
  const primaryConfidence = classification
    ? classification.rankedTypes[0]?.confidence ?? detail.confidence
    : null;
  const thresholdMessage = !classification
    ? legacyClassificationMessage
    : classification.status === 'below_threshold'
      ? `低于自动生成阈值（${CLASSIFICATION_CONFIDENCE_THRESHOLD.toFixed(2)}）。`
      : classification.status === 'invalid'
        ? '分类结果无效，无法自动生成。'
        : `达到自动生成阈值（${CLASSIFICATION_CONFIDENCE_THRESHOLD.toFixed(2)}）。`;

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
    reason: classification?.reason ?? detail.reason,
    rankedTypes: (classification?.rankedTypes ?? []).map((ranked, index) => ({
      imageType: ranked.imageType,
      confidencePercent: confidencePercent(ranked.confidence),
      isPrimary: index === 0,
    })),
    primaryConfidencePercent: primaryConfidence === null ? null : confidencePercent(primaryConfidence),
    thresholdMessage,
    classificationState: classification ? 'classified' as const : 'legacy_unclassified' as const,
    classificationMessage: classification ? thresholdMessage : legacyClassificationMessage,
    classificationStatus: classification?.status,
    evidence: classification?.evidence ?? [],
    auxiliaryTags: classification?.auxiliaryTags ?? [],
    classificationModel: classification?.model ?? null,
    promptVersion: classification?.promptVersion ?? null,
    contractVersion: detail.contractVersion ?? null,
    profileVersion: detail.profileVersion,
    canConfirmOverride: Boolean(classification),
    initialOverrideType: classification?.primaryType ?? null,
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
            error: error instanceof Error ? error.message : '重新生成请求失败',
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
