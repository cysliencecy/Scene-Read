from __future__ import annotations

from typing import Any

from .prompt import CLASSIFICATION_PROMPT_VERSION
from .types import (
    CandidateClassification,
    CandidateSeed,
    ChapterPayload,
    ImageType,
    RankedImageType,
    SceneCandidate,
    VisualEvidence,
    VisualProfileFact,
    WorkerLog,
)


VALID_IMAGE_TYPES: set[ImageType] = {"scene", "character", "object"}
CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.65


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, parsed))


def _as_image_type(value: Any) -> ImageType:
    if value in VALID_IMAGE_TYPES:
        return value
    return "scene"


def _required_text(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"Classification requires {field}.")
    return text


def _normalized_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Classification confidence must be numeric.") from error
    if not 0.0 <= confidence <= 1.0:
        raise ValueError("Classification confidence must be between 0 and 1.")
    return confidence


def _validate_evidence(value: Any) -> tuple[VisualEvidence, ...]:
    if not isinstance(value, list) or not value:
        raise ValueError("Classification requires non-empty evidence.")
    evidence = tuple(
        VisualEvidence(
            sourceBlockId=_required_text(item.get("sourceBlockId") if isinstance(item, dict) else None, "evidence.sourceBlockId"),
            sourceText=_required_text(item.get("sourceText") if isinstance(item, dict) else None, "evidence.sourceText"),
        )
        for item in value
    )
    return evidence


def _validate_profile_suggestions(value: Any) -> tuple[VisualProfileFact, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ValueError("profileFactSuggestions must be a list.")
    facts: list[VisualProfileFact] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("profileFactSuggestions must contain objects.")
        facts.append(
            VisualProfileFact(
                field=_required_text(item.get("field"), "profileFactSuggestions.field"),
                value=_required_text(item.get("value"), "profileFactSuggestions.value"),
                sourceBlockId=str(item.get("sourceBlockId") or "").strip(),
                sourceText=str(item.get("sourceText") or "").strip(),
                stability=item.get("stability", "inferred"),
            )
        )
    return tuple(facts)


def validate_candidate_classification(
    raw: Any,
    *,
    model: str = "kimi-k3",
    prompt_version: str = CLASSIFICATION_PROMPT_VERSION,
) -> CandidateClassification:
    if not isinstance(raw, dict):
        raise ValueError("Classification response must be an object.")
    raw_ranked = raw.get("rankedTypes")
    if not isinstance(raw_ranked, list) or len(raw_ranked) != 3:
        raise ValueError("Classification rankedTypes must contain exactly three entries.")
    ranked_types = tuple(
        RankedImageType(
            imageType=_required_text(item.get("imageType") if isinstance(item, dict) else None, "rankedTypes.imageType"),
            confidence=_normalized_confidence(item.get("confidence") if isinstance(item, dict) else None),
        )
        for item in raw_ranked
    )
    if len({item.imageType for item in ranked_types}) != 3:
        raise ValueError("Classification rankedTypes must be unique.")
    if any(ranked_types[index].confidence < ranked_types[index + 1].confidence for index in range(2)):
        raise ValueError("Classification rankedTypes must be sorted by descending confidence.")
    primary_type = _required_text(raw.get("primaryType"), "primaryType")
    if primary_type != ranked_types[0].imageType:
        raise ValueError("Classification primaryType must equal the highest-ranked type.")
    tags = raw.get("auxiliaryTags", [])
    if not isinstance(tags, list) or any(not isinstance(tag, str) or not tag.strip() for tag in tags):
        raise ValueError("Classification auxiliaryTags must be a list of non-empty strings.")
    return CandidateClassification(
        primaryType=primary_type,
        rankedTypes=ranked_types,
        evidence=_validate_evidence(raw.get("evidence")),
        reason=_required_text(raw.get("reason"), "reason"),
        auxiliaryTags=tuple(tag.strip() for tag in tags),
        profileFactSuggestions=_validate_profile_suggestions(raw.get("profileFactSuggestions")),
        status="eligible" if ranked_types[0].confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD else "below_threshold",
        model=model,
        promptVersion=prompt_version,
    )


def validate_discovery_candidates(
    payload: ChapterPayload, raw_candidates: Any
) -> tuple[list[CandidateSeed], list[WorkerLog]]:
    if not isinstance(raw_candidates, list):
        return [], [WorkerLog(level="warning", message="AI discovery candidates is not a list.")]
    paragraph_positions = {
        block["id"]: position for position, block in enumerate(payload["blocks"]) if block.get("type") == "paragraph"
    }
    seeds: list[CandidateSeed] = []
    seen_ids: set[str] = set()
    logs: list[WorkerLog] = []
    for item in raw_candidates[:8]:
        if not isinstance(item, dict):
            logs.append(WorkerLog(level="warning", message="Skipped non-object discovery candidate."))
            continue
        source_block_id = str(item.get("sourceBlockId") or "").strip()
        if source_block_id not in paragraph_positions or source_block_id in seen_ids:
            logs.append(WorkerLog(level="warning", message="Skipped discovery candidate with invalid sourceBlockId.", data={"sourceBlockId": source_block_id}))
            continue
        try:
            seeds.append(
                CandidateSeed(
                    id=str(item.get("id") or f"{payload['chapterId']}-seed-{len(seeds) + 1}"),
                    chapterId=payload["chapterId"],
                    sourceBlockId=source_block_id,
                    position=paragraph_positions[source_block_id],
                    readingValue=_normalized_confidence(item.get("readingValue")),
                    reason=_required_text(item.get("reason"), "reason"),
                    evidence=_validate_evidence(item.get("evidence")),
                )
            )
            seen_ids.add(source_block_id)
        except ValueError as error:
            logs.append(WorkerLog(level="warning", message="Skipped invalid discovery candidate.", data={"error": str(error)}))
    logs.append(WorkerLog(level="info", message="Validated candidate discoveries.", data={"count": len(seeds)}))
    return seeds, logs


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

    for item in raw_candidates[:8]:
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
        image_type = _as_image_type(item.get("imageType"))

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
                imageType=image_type,
                locationChange=location_change[:120],
                confidence=confidence,
            )
        )

        if len(candidates) >= 6:
            break

    logs.append(
        WorkerLog(
            level="info",
            message="Validated scene candidates.",
            data={"count": len(candidates)},
        )
    )
    return candidates, logs
