from __future__ import annotations

from typing import Any

from .types import ChapterPayload, SceneCandidate, WorkerLog


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, parsed))


def validate_ai_candidates(payload: ChapterPayload, raw_candidates: Any) -> tuple[list[SceneCandidate], list[WorkerLog]]:
    logs: list[WorkerLog] = []

    if not isinstance(raw_candidates, list):
        return [], [WorkerLog(level="warning", message="AI result candidates is not a list.")]

    paragraph_positions = {
        block["id"]: position
        for position, block in enumerate(payload["blocks"])
        if block.get("type") == "paragraph"
    }
    paragraph_text = {
        block["id"]: block.get("text", "")
        for block in payload["blocks"]
        if block.get("type") == "paragraph"
    }

    candidates: list[SceneCandidate] = []
    seen_ids: set[str] = set()

    for item in raw_candidates[:6]:
        if not isinstance(item, dict):
            logs.append(WorkerLog(level="warning", message="Skipped non-object AI candidate."))
            continue

        source_block_id = str(item.get("sourceBlockId", "")).strip()
        if source_block_id not in paragraph_positions:
            logs.append(
                WorkerLog(
                    level="warning",
                    message="Skipped candidate with unknown sourceBlockId.",
                    data={"sourceBlockId": source_block_id},
                )
            )
            continue

        if source_block_id in seen_ids:
            continue

        source_text = str(item.get("sourceText") or paragraph_text[source_block_id]).strip()
        reason = str(item.get("reason") or "AI 识别到地点或环境变化").strip()
        location_change = str(item.get("locationChange") or "").strip()
        prompt_draft = str(item.get("promptDraft") or "").strip()
        confidence = _as_float(item.get("confidence"), 0.5)

        if not prompt_draft:
            prompt_draft = (
                "阅读辅助插图，克制写实风格，根据以下原文呈现场景氛围，"
                f"不要文字、水印或夸张构图：{source_text[:90]}"
            )

        seen_ids.add(source_block_id)
        candidates.append(
            SceneCandidate(
                id=f"{payload['chapterId']}-scene-{len(candidates) + 1}",
                chapterId=payload["chapterId"],
                sourceBlockId=source_block_id,
                position=paragraph_positions[source_block_id],
                reason=reason[:160],
                sourceText=source_text[:180],
                promptDraft=prompt_draft[:360],
                locationChange=location_change[:120],
                confidence=confidence,
            )
        )

        if len(candidates) >= 3:
            break

    logs.append(
        WorkerLog(
            level="info",
            message="Validated scene candidates.",
            data={"count": len(candidates)},
        )
    )
    return candidates, logs
