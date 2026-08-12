export type VisualStyle = '写实' | '动漫' | '插画';

export type BookCopyrightStatus = 'public_domain' | 'authorized' | 'unknown';

export type OnlineBookSource = 'gutenberg' | 'wikisource' | 'chinese_poetry' | 'private_json';

export type OnlineBookSourceError = {
  source: OnlineBookSource;
  code: string;
};

export type Book = {
  id: string;
  title: string;
  progress: string;
  accent: string;
  currentChapterId: string;
  lastReadLabel: string;
  visualStyle?: VisualStyle;
  authors?: string[];
  languages?: string[];
  coverUrl?: string;
  source?: OnlineBookSource;
  sourceBookId?: string;
  sourceUrl?: string;
  sourceAttribution?: string;
  copyrightStatus?: BookCopyrightStatus;
  illustrationsEnabled?: boolean;
};

export type IllustrationSettings = {
  enabled: boolean;
  monthlyTaskLimit: number;
};

export type IllustrationUsageStats = {
  month: string;
  taskCount: number;
  successCount: number;
  failureCount: number;
  monthlyTaskLimit: number;
  remainingTasks: number;
};

export type OnlineBook = {
  source: OnlineBookSource;
  sourceBookId: string;
  title: string;
  authors: string[];
  languages: string[];
  coverUrl?: string;
  sourceUrl: string;
  sourceAttribution?: string;
  copyrightStatus: BookCopyrightStatus;
  downloadCount: number;
  canImport: boolean;
  importedBookId?: string;
};

export type OnlineBookSearchPage = {
  items: OnlineBook[];
  page: number;
  total: number;
  hasNextPage: boolean;
  sourceErrors: OnlineBookSourceError[];
};

export type OnlineBookImportResult = {
  book: Book;
  chapters: Chapter[];
  alreadyImported: boolean;
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
  rules: Array<{ rule: string; passed: boolean; severity: 'info' | 'warning' | 'severe'; explanation: string }>;
  severeFactConflict: boolean;
  provider: string;
  model: string;
  auditVersion: string;
};

export type VisualProfileFact = {
  field: string;
  value: string;
  sourceBlockId: string;
  sourceText: string;
  stability: 'stable' | 'inferred';
};

export type BookVisualProfile = {
  id: string;
  bookId: string;
  entityType: 'character' | 'location';
  entityKey: string;
  stableFacts: VisualProfileFact[];
  flexibleFacts: VisualProfileFact[];
  version: string;
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

export type GenerationTask = {
  id: string;
  bookId?: string;
  chapterId: string;
  progress: number;
  status: 'queued' | 'recognizing' | 'generating' | 'completed' | 'failed' | 'cancelled';
  taskType?: 'scene_image';
  label: string;
  errorMessage?: string;
  provider?: string;
  durationMs?: number;
  createdAt?: string;
};

export type SceneImage = {
  id: string;
  chapterId: string;
  sourceBlockId?: string;
  position?: number;
  imageType?: StoredImageType;
  effectiveImageType?: CanonicalImageType | null;
  candidateId?: string;
  attemptId?: string;
  variant: 'street' | 'office';
  prompt: string;
  imagePath?: string;
  imageUrl?: string;
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
  imageType?: StoredImageType;
  effectiveImageType?: CanonicalImageType | null;
  classification?: CandidateClassification;
  classificationStatus?: ClassificationStatus;
  contractVersion?: string;
  profileVersion?: string;
  locationChange?: string;
  confidence: number;
  selectedForGeneration?: boolean;
  provider?: string;
  model?: string;
  promptVersion?: string;
  rawResponse?: unknown;
};

