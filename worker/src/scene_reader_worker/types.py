from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypedDict


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


@dataclass(frozen=True)
class WorkerResult:
    taskId: str
    bookId: str
    chapterId: str
    status: Literal["completed"]
    candidates: list[SceneCandidate]
