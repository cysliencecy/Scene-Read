export type Screen = 'shelf' | 'import' | 'style' | 'reader';

export type VisualStyle = '写实' | '动漫' | '插画';

export type Book = {
  id: string;
  title: string;
  progress: string;
  accent: string;
  currentChapterId: string;
  lastReadLabel: string;
  visualStyle?: VisualStyle;
};

export type StyleOption = {
  name: VisualStyle;
  description: string;
  colors: [string, string];
};

export type CanonicalImageType =
  | 'environment'
  | 'portrait'
  | 'interaction'
  | 'action'
  | 'object'
  | 'atmosphere';

export type StoredImageType = CanonicalImageType | 'scene' | 'character';
/** @deprecated Use StoredImageType for legacy reads or CanonicalImageType for new writes. */
export type ImageType = StoredImageType;
export type ClassificationStatus = 'eligible' | 'below_threshold' | 'invalid';
export type AttemptStatus = 'queued' | 'generation_failed' | 'audit_failed' | 'blocked' | 'publishable';

export type RankedImageType = {
  imageType: CanonicalImageType;
  confidence: number;
};

export type CandidateClassification = {
  primaryType: CanonicalImageType;
  rankedTypes: [RankedImageType, RankedImageType, RankedImageType];
  evidence: Array<{ sourceBlockId: string; sourceText: string }>;
  reason: string;
  auxiliaryTags: string[];
  status: ClassificationStatus;
  model: string;
  promptVersion: string;
};

export type ImageAuditResult = {
  verdict: 'publishable' | 'blocked';
  rules: Array<{
    rule: string;
    passed: boolean;
    severity: 'info' | 'warning' | 'severe';
    explanation: string;
  }>;
  severeFactConflict: boolean;
  provider: string;
  model: string;
  auditVersion: string;
};

export type ImageGenerationAttempt = {
  id: string;
  idempotencyKey: string;
  candidateId: string;
  taskId: string;
  parentAttemptId?: string;
  trigger: 'automatic' | 'manual';
  requestedType: CanonicalImageType;
  overriddenFrom?: StoredImageType;
  status: AttemptStatus;
  prompt: string;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
  imageUrl?: string;
  audit?: ImageAuditResult;
  classificationSnapshot?: CandidateClassification;
  contractVersion?: string;
  profileVersion?: string;
  artifactMetadata?: unknown;
  createdAt: string;
};

export type ChapterBlock =
  | {
      id: string;
      type: 'paragraph';
      text: string;
    }
  | {
      id: string;
      type: 'scene-placeholder';
      taskId: string;
    }
  | {
      id: string;
      type: 'scene-image';
      imageId: string;
    };

export type Chapter = {
  id: string;
  bookId: string;
  title: string;
  progress: number;
  blocks: ChapterBlock[];
};

export type SceneImage = {
  id: string;
  chapterId: string;
  sourceBlockId?: string;
  position?: number;
  imageType?: ImageType;
  effectiveImageType?: CanonicalImageType | null;
  candidateId?: string;
  attemptId?: string;
  attemptStatus?: AttemptStatus;
  variant: 'street' | 'office';
  prompt: string;
  imagePath?: string;
  imageUrl?: string;
};

export type GenerationTask = {
  id: string;
  bookId?: string;
  chapterId: string;
  progress: number;
  status: 'queued' | 'recognizing' | 'generating' | 'completed' | 'failed';
  taskType?: 'scene_image';
  label: string;
  errorMessage?: string;
  provider?: string;
  durationMs?: number;
};

export type SceneCandidate = {
  id: string;
  taskId: string;
  bookId?: string;
  chapterId: string;
  order: number;
  sourceBlockId: string;
  position: number;
  reason: string;
  sourceText: string;
  promptDraft: string;
  finalPrompt?: string;
  imageType?: ImageType;
  effectiveImageType?: CanonicalImageType | null;
  classification?: CandidateClassification;
  classificationStatus?: ClassificationStatus;
  contractVersion?: string;
  profileVersion?: string;
  locationChange?: string;
  confidence: number;
  provider?: string;
  model?: string;
  promptVersion?: string;
  rawResponse?: unknown;
};

export type SceneCandidateDebugDetail = SceneCandidate & {
  storedImageType?: StoredImageType;
  effectiveImageType?: CanonicalImageType | null;
  classification?: CandidateClassification;
  contractVersion?: string;
  profileVersion?: string;
  attempts: ImageGenerationAttempt[];
};

export type ManualRegenerationResult = {
  task: GenerationTask;
  attempt: ImageGenerationAttempt;
};

