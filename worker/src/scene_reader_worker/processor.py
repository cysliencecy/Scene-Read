from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Iterable, Literal

from .ai_client import AiSceneRecognitionError, classify_candidate_with_openai, discover_candidates_with_openai
from .prompt import ClassificationContext, build_classification_context
from .types import (
    BookVisualProfile,
    CandidateClassification,
    CandidateSeed,
    ChapterPayload,
    ImageType,
    SceneCandidate,
    WorkerLog,
    WorkerResult,
)
from .validator import validate_candidate_classification, validate_discovery_candidates


@dataclass(frozen=True)
class ClassifiedCandidate:
    seed: CandidateSeed
    classification: CandidateClassification
    provider: Literal["kimi", "heuristic"]


def formal_generation_eligible(classification: CandidateClassification, provider: str) -> bool:
    return provider != "heuristic" and classification.status == "eligible"


def order_classified_candidates(candidates: Iterable[ClassifiedCandidate]) -> list[ClassifiedCandidate]:
    """Order by reader value and classification quality; diversity resolves only exact ties."""
    grouped: dict[tuple[float, float], list[ClassifiedCandidate]] = {}
    for candidate in candidates:
        key = (candidate.seed.readingValue, candidate.classification.rankedTypes[0].confidence)
        grouped.setdefault(key, []).append(candidate)

    ordered: list[ClassifiedCandidate] = []
    used_types: dict[str, int] = {}
    for key in sorted(grouped, reverse=True):
        remaining = list(grouped[key])
        while remaining:
            next_candidate = min(
                remaining,
                key=lambda candidate: (
                    used_types.get(candidate.classification.primaryType, 0),
                    candidate.seed.position,
                    candidate.seed.id,
                ),
            )
            remaining.remove(next_candidate)
            ordered.append(next_candidate)
            image_type = next_candidate.classification.primaryType
            used_types[image_type] = used_types.get(image_type, 0) + 1
    return ordered


def discover_candidates(payload: ChapterPayload) -> tuple[list[CandidateSeed], list[WorkerLog]]:
    raw_discoveries, logs = discover_candidates_with_openai(payload)
    seeds, validation_logs = validate_discovery_candidates(payload, raw_discoveries)
    return seeds, [*logs, *validation_logs]


def classify_candidate(
    context: ClassificationContext,
) -> tuple[CandidateClassification, list[WorkerLog]]:
    raw_classification, logs = classify_candidate_with_openai(context)
    return validate_candidate_classification(raw_classification), logs


def classify_chapter(
    payload: ChapterPayload,
    profiles: tuple[BookVisualProfile, ...] = (),
) -> tuple[list[ClassifiedCandidate], list[WorkerLog]]:
    seeds, logs = discover_candidates(payload)
    classified: list[ClassifiedCandidate] = []
    for seed in seeds:
        classification, classification_logs = classify_candidate(
            build_classification_context(payload, seed, profiles)
        )
        logs.extend(classification_logs)
        classified.append(ClassifiedCandidate(seed=seed, classification=classification, provider="kimi"))
    return order_classified_candidates(classified), logs


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
            classified_candidates, ai_logs = classify_chapter(payload)
            logs.extend(ai_logs)
            candidates = [
                SceneCandidate(
                    id=classified.seed.id,
                    chapterId=classified.seed.chapterId,
                    sourceBlockId=classified.seed.sourceBlockId,
                    position=classified.seed.position,
                    reason=classified.classification.reason,
                    sourceText=classified.classification.evidence[0].sourceText,
                    promptDraft="",
                    imageType=classified.classification.primaryType,
                    locationChange="",
                    confidence=classified.classification.rankedTypes[0].confidence,
                )
                for classified in classified_candidates
                if formal_generation_eligible(classified.classification, classified.provider)
            ]
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
