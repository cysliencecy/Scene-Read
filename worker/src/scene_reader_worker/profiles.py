from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .types import PROFILE_VERSION, BookVisualProfile, VisualProfileFact, normalize_tuple


@dataclass(frozen=True)
class ProfileFactConflict:
    field: str
    existing: VisualProfileFact
    incoming: VisualProfileFact


@dataclass(frozen=True)
class ProfileMergeResult:
    profile: BookVisualProfile
    conflicts: tuple[ProfileFactConflict, ...]


def validate_profile_fact(fact: VisualProfileFact) -> VisualProfileFact:
    if not fact.field.strip() or not fact.value.strip():
        raise ValueError("Profile facts require a non-empty field and value.")
    if fact.stability == "stable" and (not fact.sourceBlockId.strip() or not fact.sourceText.strip()):
        raise ValueError("Stable profile facts require sourceBlockId and sourceText evidence.")
    return fact


def _append_unique(
    facts: tuple[VisualProfileFact, ...], incoming: VisualProfileFact
) -> tuple[VisualProfileFact, ...]:
    if incoming in facts:
        return facts
    return (*facts, incoming)


def merge_profile_facts(
    profile: BookVisualProfile, suggestions: Iterable[VisualProfileFact]
) -> ProfileMergeResult:
    """Merge suggestions without replacing an evidence-backed fact on conflict."""
    stable_facts = normalize_tuple(profile.stableFacts)
    flexible_facts = normalize_tuple(profile.flexibleFacts)
    conflicts: list[ProfileFactConflict] = []

    for suggestion in normalize_tuple(suggestions):
        fact = validate_profile_fact(suggestion)
        if fact.stability == "inferred":
            flexible_facts = _append_unique(flexible_facts, fact)
            continue

        existing = next((item for item in stable_facts if item.field == fact.field), None)
        if existing is None:
            stable_facts = _append_unique(stable_facts, fact)
        elif existing.value != fact.value:
            conflicts.append(ProfileFactConflict(field=fact.field, existing=existing, incoming=fact))

    merged = BookVisualProfile(
        id=profile.id,
        bookId=profile.bookId,
        entityType=profile.entityType,
        entityKey=profile.entityKey,
        stableFacts=stable_facts,
        flexibleFacts=flexible_facts,
        version=PROFILE_VERSION,
    )
    return ProfileMergeResult(profile=merged, conflicts=tuple(conflicts))
