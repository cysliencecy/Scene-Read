from __future__ import annotations

import re

from .types import ChapterPayload, SceneCandidate, WorkerResult


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
        return "多个地点或环境关键词命中"
    return "地点或环境关键词命中"


def process_chapter(payload: ChapterPayload, max_candidates: int = 3) -> WorkerResult:
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

    candidates = [
        SceneCandidate(
            id=f"{payload['chapterId']}-scene-{index + 1}",
            chapterId=payload["chapterId"],
            sourceBlockId=block_id,
            position=position,
            reason=_candidate_reason(score),
            sourceText=_compact_text(text),
            promptDraft=f"根据原文生成克制的阅读插图：{_compact_text(text, 90)}",
        )
        for index, (score, position, block_id, text) in enumerate(selected)
    ]

    return WorkerResult(
        taskId=payload["taskId"],
        bookId=payload["bookId"],
        chapterId=payload["chapterId"],
        status="completed",
        candidates=candidates,
    )
