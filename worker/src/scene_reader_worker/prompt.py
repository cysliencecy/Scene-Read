from __future__ import annotations

from dataclasses import dataclass

from .types import BookVisualProfile, CandidateSeed, ChapterBlock, ChapterPayload


DISCOVERY_PROMPT_VERSION = "kimi-discovery-v1"
CLASSIFICATION_PROMPT_VERSION = "kimi-classification-v1"

DISCOVERY_SYSTEM_PROMPT = """
You discover visual anchors for a reading illustration in a complete chapter.
Return only JSON candidates with sourceBlockId, readingValue, evidence, and reason.
Read the whole chapter, prefer anchors that help a reader understand setting, relationships,
or a pivotal visible detail, and do not make final image-type decisions in this stage.
""".strip()

CLASSIFICATION_SYSTEM_PROMPT = """
You classify one visual anchor using only its local textual context and profile snapshots.
Return exactly three distinct canonical image types in descending confidence order. Valid types
are environment, portrait, interaction, action, object, and atmosphere. Return supported
evidence, a reason, auxiliary tags, and any profile fact suggestions. Do not invent facts.
""".strip()

# Retained so callers of the former prompt API continue to receive the discovery stage.
SCENE_RECOGNITION_SYSTEM_PROMPT = DISCOVERY_SYSTEM_PROMPT


@dataclass(frozen=True)
class ClassificationContext:
    target: CandidateSeed
    paragraphs: tuple[ChapterBlock, ...]
    profiles: tuple[BookVisualProfile, ...]


def _chapter_paragraphs(payload: ChapterPayload) -> tuple[ChapterBlock, ...]:
    return tuple(block for block in payload["blocks"] if block.get("type") == "paragraph" and block.get("text", "").strip())


def build_discovery_user_prompt(payload: ChapterPayload) -> str:
    blocks = [f"[{index}] id={block['id']}\n{block['text'].strip()}" for index, block in enumerate(_chapter_paragraphs(payload))]
    return "\n\n".join(
        (
            f"bookId={payload['bookId']}",
            f"chapterId={payload['chapterId']}",
            f"chapterTitle={payload['chapterTitle']}",
            "whole-chapter paragraphs:",
            "\n\n".join(blocks),
        )
    )


def build_scene_recognition_user_prompt(payload: ChapterPayload) -> str:
    return build_discovery_user_prompt(payload)


def build_classification_context(
    payload: ChapterPayload,
    candidate: CandidateSeed,
    profiles: tuple[BookVisualProfile, ...] = (),
) -> ClassificationContext:
    paragraphs = _chapter_paragraphs(payload)
    try:
        target_index = next(index for index, block in enumerate(paragraphs) if block["id"] == candidate.sourceBlockId)
    except StopIteration as error:
        raise ValueError(f"Candidate source block {candidate.sourceBlockId!r} is not a chapter paragraph.") from error
    return ClassificationContext(
        target=candidate,
        paragraphs=paragraphs[max(0, target_index - 2) : target_index + 3],
        profiles=profiles,
    )


def _profile_snapshot(profile: BookVisualProfile) -> str:
    facts = (*profile.stableFacts, *profile.flexibleFacts)
    serialized_facts = " | ".join(f"{fact.field}={fact.value}" for fact in facts)
    return f"{profile.entityType}:{profile.entityKey};facts=[{serialized_facts}];version={profile.version}"


def build_classification_user_prompt(context: ClassificationContext) -> str:
    paragraphs = "\n\n".join(
        f"id={block['id']}\n{block['text'].strip()}" for block in context.paragraphs
    )
    profiles = "\n".join(_profile_snapshot(profile) for profile in context.profiles) or "none"
    evidence = " | ".join(f"{item.sourceBlockId}:{item.sourceText}" for item in context.target.evidence)
    return "\n\n".join(
        (
            f"candidateId={context.target.id}",
            f"targetBlockId={context.target.sourceBlockId}",
            f"discoveryReason={context.target.reason}",
            f"discoveryEvidence={evidence}",
            "target paragraph plus up to two available paragraphs on each side:",
            paragraphs,
            "book visual profiles:",
            profiles,
        )
    )
