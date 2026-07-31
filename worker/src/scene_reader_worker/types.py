from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, TypedDict


ImageType = Literal["scene", "character", "object"]


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
