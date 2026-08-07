from __future__ import annotations

from types import MappingProxyType
from typing import Iterable, Mapping

from .types import (
    CANONICAL_IMAGE_TYPES,
    COMPOSITION_CONTRACT_VERSION,
    BookVisualProfile,
    CanonicalImageType,
    CompositionContract,
    VisualEvidence,
    normalize_tuple,
    require_canonical_image_type,
)


COMMON_EXCLUSIONS = (
    "text",
    "watermark",
    "comic panels",
    "distorted anatomy",
    "advertising layout",
)


def _contract(
    image_type: CanonicalImageType,
    subject_count: str,
    shot_scale: str,
    subject_ratio: str,
    camera_requirements: Iterable[str],
    required_composition: Iterable[str],
    exclusions: Iterable[str],
) -> CompositionContract:
    return CompositionContract(
        imageType=image_type,
        subjectCount=subject_count,
        shotScale=shot_scale,
        subjectRatio=subject_ratio,
        cameraRequirements=normalize_tuple(camera_requirements),
        requiredComposition=normalize_tuple(required_composition),
        exclusions=normalize_tuple(exclusions),
        aspectRatio="3:2",
        version=COMPOSITION_CONTRACT_VERSION,
    )


COMPOSITION_CONTRACTS: Mapping[CanonicalImageType, CompositionContract] = MappingProxyType(
    {
        "environment": _contract(
            "environment", "zero to two incidental figures", "wide", "environment dominant",
            ("landscape 3:2", "eye-level or elevated establishing view"),
            ("readable space", "clear depth layers", "setting leads the frame"),
            ("crowded character lineup",),
        ),
        "portrait": _contract(
            "portrait", "one principal subject", "medium close", "subject prominent",
            ("natural eye-level lens", "no identity-photo framing"),
            ("expressive pose", "contextual background", "face not exaggerated"),
            ("front-facing ID-photo pose", "beauty retouching"),
        ),
        "interaction": _contract(
            "interaction", "two to three interacting subjects", "medium", "subjects balanced",
            ("natural conversational angle", "readable hands and eyelines"),
            ("relationship gesture", "shared focal action", "clear spatial relation"),
            ("isolated unrelated poses",),
        ),
        "action": _contract(
            "action", "one to three active subjects", "medium wide", "action and setting balanced",
            ("dynamic but physically plausible camera angle", "motion remains legible"),
            ("single decisive moment", "clear action direction", "grounded motion"),
            ("impossible anatomy", "chaotic multi-action montage"),
        ),
        "object": _contract(
            "object", "one primary object", "close to medium", "object dominant",
            ("detail-preserving lens", "purposeful viewing angle"),
            ("material detail", "narrative context", "controlled negative space"),
            ("product advertising", "floating object without context"),
        ),
        "atmosphere": _contract(
            "atmosphere", "zero to one incidental figure", "wide", "light and environment dominant",
            ("observational landscape framing", "light source is coherent"),
            ("weather or light as focal element", "layered mood", "restrained narrative detail"),
            ("melodramatic action pose", "overcrowded foreground"),
        ),
    }
)

if tuple(COMPOSITION_CONTRACTS) != CANONICAL_IMAGE_TYPES:
    raise RuntimeError("Composition contracts must cover every canonical image type in canonical order.")


def get_composition_contract(image_type: str) -> CompositionContract:
    return COMPOSITION_CONTRACTS[require_canonical_image_type(image_type)]


def _join(values: Iterable[str]) -> str:
    return " | ".join(value.strip() for value in values if value and value.strip())


def _profile_snapshot(profiles: Iterable[BookVisualProfile]) -> str:
    snapshots: list[str] = []
    for profile in profiles:
        stable = _join(f"{fact.field}={fact.value}" for fact in profile.stableFacts)
        flexible = _join(f"{fact.field}={fact.value}" for fact in profile.flexibleFacts)
        snapshots.append(
            f"{profile.entityType}:{profile.entityKey};stable=[{stable}];flexible=[{flexible}];version={profile.version}"
        )
    return " || ".join(snapshots)


def build_generation_prompt(
    *,
    image_type: str,
    evidence: Iterable[VisualEvidence],
    profiles: Iterable[BookVisualProfile],
    style: str,
    auxiliary_tags: Iterable[str] = (),
    chapter_facts: Iterable[str] = (),
) -> str:
    """Build a byte-stable prompt from code-owned rules and ordered input snapshots."""
    contract = get_composition_contract(image_type)
    evidence_snapshot = _join(
        f"{item.sourceBlockId}:{item.sourceText}" for item in normalize_tuple(evidence)
    )
    return "\n".join(
        (
            f"contract={contract.imageType};version={contract.version};aspect={contract.aspectRatio}",
            f"subject-count={contract.subjectCount};shot-scale={contract.shotScale};subject-ratio={contract.subjectRatio}",
            f"camera={_join(contract.cameraRequirements)}",
            f"composition={_join(contract.requiredComposition)}",
            f"profile-snapshot={_profile_snapshot(normalize_tuple(profiles))}",
            f"evidence={evidence_snapshot}",
            f"chapter-facts={_join(normalize_tuple(chapter_facts))}",
            f"style={style.strip()}",
            f"auxiliary-tags={_join(normalize_tuple(auxiliary_tags))}",
            f"exclusions={_join((*contract.exclusions, *COMMON_EXCLUSIONS))}",
        )
    )
