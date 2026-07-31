from __future__ import annotations

import re
from dataclasses import asdict
from typing import Literal

from .ai_client import AiSceneRecognitionError, recognize_scenes_with_openai
from .types import ChapterPayload, ImageType, SceneCandidate, WorkerLog, WorkerResult
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

CHARACTER_KEYWORDS = ["他", "她", "男人", "女人", "少年", "少女", "先生", "小姐", "母亲", "父亲", "主角"]
OBJECT_KEYWORDS = ["手机", "信", "照片", "钥匙", "戒指", "文件", "合同", "包", "车票", "药", "伞"]


def _compact_text(text: str, limit: int = 140) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit].rstrip()}..."


def _score_keywords(text: str, keywords: list[str]) -> int:
    return sum(1 for keyword in keywords if keyword in text)


def _infer_image_type(text: str, scene_score: int, character_score: int, object_score: int) -> ImageType:
    if object_score > 0 and object_score >= scene_score and object_score >= character_score:
        return "object"
    if character_score > 0 and character_score >= scene_score:
        return "character"
    return "scene"


def _candidate_reason(image_type: ImageType, score: int) -> str:
    prefix = {
        "scene": "地点或环境视觉锚点",
        "character": "关键人物视觉锚点",
        "object": "关键物品或线索视觉锚点",
    }[image_type]
    if score >= 3:
        return f"{prefix}；多个关键词命中，适合作为阅读辅助插图"
    return f"{prefix}；关键词命中，可作为阅读辅助插图候选"


def _build_prompt_draft(image_type: ImageType, source_text: str) -> str:
    type_prompt = {
        "scene": "表现地点、空间结构、环境光线和时代感，画面克制，像小说阅读插图。",
        "character": "表现人物姿态、服装和关系氛围，不做证件照式正脸，不夸张五官。",
        "object": "表现关键物品的材质、摆放位置和剧情意义，避免变成广告图。",
    }[image_type]
    return (
        f"阅读辅助插图，{type_prompt}"
        "不要文字、不要水印、不要漫画分镜文字、不要畸形手脸。"
        f"原文依据：{_compact_text(source_text, 90)}"
    )


def _process_chapter_with_heuristic(payload: ChapterPayload, max_candidates: int = 6) -> list[SceneCandidate]:
    scored_blocks: list[tuple[int, int, str, str, ImageType]] = []

    for position, block in enumerate(payload["blocks"]):
        if block.get("type") != "paragraph":
            continue

        text = block.get("text", "")
        scene_score = _score_keywords(text, SCENE_KEYWORDS)
        character_score = _score_keywords(text, CHARACTER_KEYWORDS)
        object_score = _score_keywords(text, OBJECT_KEYWORDS)
        score = max(scene_score, character_score, object_score)
        if score <= 0:
            continue

        image_type = _infer_image_type(text, scene_score, character_score, object_score)
        scored_blocks.append((score, position, block["id"], text, image_type))

    scored_blocks.sort(key=lambda item: (-item[0], item[1]))
    selected = scored_blocks[:max_candidates]

    return [
        SceneCandidate(
            id=f"{payload['chapterId']}-scene-{index + 1}",
            chapterId=payload["chapterId"],
            sourceBlockId=block_id,
            position=position,
            reason=_candidate_reason(image_type, score),
            sourceText=_compact_text(text),
            promptDraft=_build_prompt_draft(image_type, text),
            imageType=image_type,
            locationChange="Heuristic visual anchor detection",
            confidence=min(0.75, 0.35 + score * 0.12),
        )
        for index, (score, position, block_id, text, image_type) in enumerate(selected)
    ]


def process_chapter(
    payload: ChapterPayload,
    max_candidates: int = 6,
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
