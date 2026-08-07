from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Literal, TypeVar, TypedDict, cast


CANONICAL_IMAGE_TYPES = (
    "environment",
    "portrait",
    "interaction",
    "action",
    "object",
    "atmosphere",
)
STORED_IMAGE_TYPES = ("scene", "character", *CANONICAL_IMAGE_TYPES)
COMPOSITION_CONTRACT_VERSION = "composition-v1"
PROFILE_VERSION = "profile-v1"

CanonicalImageType = Literal[
    "environment", "portrait", "interaction", "action", "object", "atmosphere"
]
StoredImageType = Literal[
    "scene", "character", "environment", "portrait", "interaction", "action", "object", "atmosphere"
]
ClassificationStatus = Literal["eligible", "below_threshold", "invalid"]
AttemptTrigger = Literal["automatic", "manual"]
AttemptStatus = Literal["queued", "generation_failed", "audit_failed", "blocked", "publishable"]
VisualStyle = Literal["写实", "动漫", "插图"]

# Kept as a compatibility alias while legacy SceneCandidate records are still read.
# New classification code must use CanonicalImageType and require_canonical_image_type.
ImageType = StoredImageType

_TupleItem = TypeVar("_TupleItem")


def normalize_tuple(values: Iterable[_TupleItem] | None) -> tuple[_TupleItem, ...]:
    """Return an immutable sequence, using one normalization rule across domain records."""
    return tuple(values or ())


def require_canonical_image_type(value: str) -> CanonicalImageType:
    if value not in CANONICAL_IMAGE_TYPES:
        raise ValueError(f"New classifications require a canonical image type; received {value!r}.")
    return cast(CanonicalImageType, value)


class ChapterBlock(TypedDict):
    id: str
    type: Literal["paragraph"]
    text: str


class ChapterPayload(TypedDict):
    taskId: str
    bookId: str
    chapterId: str
    chapterTitle: str
    blocks: list[ChapterBlock]


@dataclass(frozen=True)
class RankedImageType:
    imageType: CanonicalImageType
    confidence: float


@dataclass(frozen=True)
class VisualEvidence:
    sourceBlockId: str
    sourceText: str


@dataclass(frozen=True)
class CandidateSeed:
    id: str
    chapterId: str
    sourceBlockId: str
    position: int
    readingValue: float
    reason: str
    evidence: tuple[VisualEvidence, ...]


@dataclass(frozen=True)
class VisualProfileFact:
    field: str
    value: str
    sourceBlockId: str
    sourceText: str
    stability: Literal["stable", "inferred"]


@dataclass(frozen=True)
class BookVisualProfile:
    id: str
    bookId: str
    entityType: Literal["character", "location"]
    entityKey: str
    stableFacts: tuple[VisualProfileFact, ...]
    flexibleFacts: tuple[VisualProfileFact, ...]
    version: str = PROFILE_VERSION


@dataclass(frozen=True)
class CandidateClassification:
    primaryType: CanonicalImageType
    rankedTypes: tuple[RankedImageType, ...]
    evidence: tuple[VisualEvidence, ...]
    reason: str
    auxiliaryTags: tuple[str, ...]
    profileFactSuggestions: tuple[VisualProfileFact, ...]
    status: ClassificationStatus
    model: str
    promptVersion: str


@dataclass(frozen=True)
class CompositionContract:
    imageType: CanonicalImageType
    subjectCount: str
    shotScale: str
    subjectRatio: str
    cameraRequirements: tuple[str, ...]
    requiredComposition: tuple[str, ...]
    exclusions: tuple[str, ...]
    aspectRatio: Literal["3:2"]
    version: str = COMPOSITION_CONTRACT_VERSION


@dataclass(frozen=True)
class ImageGenerationRequest:
    idempotencyKey: str
    candidateId: str
    taskId: str
    trigger: AttemptTrigger
    requestedType: CanonicalImageType
    prompt: str
    style: VisualStyle
    aspectRatio: Literal["3:2"]
    contractVersion: str


@dataclass(frozen=True)
class GeneratedImageArtifact:
    imageBase64: str
    mimeType: str
    provider: str
    model: str
    width: int
    height: int


@dataclass(frozen=True)
class ImageAuditRuleResult:
    rule: str
    passed: bool
    severity: Literal["info", "warning", "severe"]
    explanation: str


@dataclass(frozen=True)
class ImageAuditResult:
    verdict: Literal["publishable", "blocked"]
    rules: tuple[ImageAuditRuleResult, ...]
    severeFactConflict: bool
    provider: str
    model: str
    auditVersion: str


# Existing worker flow types. They retain StoredImageType so historical values can be read
# until Batch 2 migrates classification and selection orchestration.
@dataclass(frozen=True)
class SceneCandidate:
    id: str
    chapterId: str
    sourceBlockId: str
    position: int
    reason: str
    sourceText: str
    promptDraft: str
    imageType: ImageType = "scene"
    locationChange: str = ""
    confidence: float = 0.0


@dataclass(frozen=True)
class WorkerLog:
    level: Literal["info", "warning", "error"]
    message: str
    data: dict[str, Any] | None = None


@dataclass(frozen=True)
class WorkerResult:
    taskId: str
    bookId: str
    chapterId: str
    status: Literal["completed"]
    candidates: list[SceneCandidate]
    provider: Literal["openai", "heuristic"]
    logs: list[WorkerLog]
