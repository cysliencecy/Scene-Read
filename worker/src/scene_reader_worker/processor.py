from __future__ import annotations

import re
from dataclasses import asdict
from typing import Literal

from .ai_client import AiSceneRecognitionError, recognize_scenes_with_openai
from .types import ChapterPayload, SceneCandidate, WorkerLog, WorkerResult
from .validator import validate_ai_candidates


SCENE_KEYWORDS = [
    "街",
    "路",
    "门",
    "窗",
    "房间",
    "客厅",
    "办公室",
    "车",
    "站",
    "港口",
    "海",
    "雨",
    "风",
    "夜",
    "灯",
    "学校",
    "医院",
    "酒店",
]


def _compact_text(text: str, limit: int = 140) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit].rstrip()}..."


def _score_scene_text(text: str) -> int:
    return sum(1 for keyword in SCENE_KEYWORDS if keyword in text)


def _candidate_reason(score: int) -> str:
    if score >= 3:
        return "多个地点或环境关键词命中，适合作为场景变化候选"
    return "地点或环境关键词命中，可能适合插入场景插图"


def _process_chapter_with_heuristic(payload: ChapterPayload, max_candidates: int = 3) -> list[SceneCandidate]:
    scored_blocks: list[tuple[int, int, str, str]] = []

    for position, block in enumerate(payload["blocks"]):
        if block.get("type") != "paragraph":
            continue

        text = block.get("text", "")
        score = _score_scene_text(text)
        if score <= 0:
            continue

        scored_blocks.append((score, position, block["id"], text))

    scored_blocks.sort(key=lambda item: (-item[0], item[1]))
    selected = scored_blocks[:max_candidates]

    return [
        SceneCandidate(
            id=f"{payload['chapterId']}-scene-{index + 1}",
            chapterId=payload["chapterId"],
            sourceBlockId=block_id,
            position=position,
            reason=_candidate_reason(score),
            sourceText=_compact_text(text),
            promptDraft=f"阅读辅助插图，克制写实风格，根据原文呈现场景氛围，不要文字、水印或夸张构图：{_compact_text(text, 90)}",
            locationChange="关键词启发式识别到环境或地点描写",
            confidence=min(0.75, 0.35 + score * 0.12),
        )
        for index, (score, position, block_id, text) in enumerate(selected)
    ]


def process_chapter(
    payload: ChapterPayload,
    max_candidates: int = 3,
    provider: Literal["auto", "openai", "heuristic"] = "auto",
) -> WorkerResult:
    logs: list[WorkerLog] = []

    if provider in ("auto", "openai"):
        try:
            raw_candidates, ai_logs = recognize_scenes_with_openai(payload)
            candidates, validation_logs = validate_ai_candidates(payload, raw_candidates)
            logs.extend(ai_logs)
            logs.extend(validation_logs)
            return WorkerResult(
                taskId=payload["taskId"],
                bookId=payload["bookId"],
                chapterId=payload["chapterId"],
                status="completed",
                candidates=candidates[:max_candidates],
                provider="openai",
                logs=logs,
            )
        except (AiSceneRecognitionError, KeyError, ValueError) as error:
            if provider == "openai":
                raise
            logs.append(
                WorkerLog(
                    level="warning",
                    message="AI scene recognition unavailable; using heuristic fallback.",
                    data={"error": str(error)},
                )
            )

    candidates = _process_chapter_with_heuristic(payload, max_candidates=max_candidates)
    logs.append(
        WorkerLog(
            level="info",
            message="Heuristic scene recognition completed.",
            data={"count": len(candidates)},
        )
    )

    return WorkerResult(
        taskId=payload["taskId"],
        bookId=payload["bookId"],
        chapterId=payload["chapterId"],
        status="completed",
        candidates=candidates,
        provider="heuristic",
        logs=logs,
    )


def result_to_dict(result: WorkerResult) -> dict:
    return asdict(result)
