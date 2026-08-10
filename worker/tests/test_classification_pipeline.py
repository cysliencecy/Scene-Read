import unittest
from dataclasses import replace
from unittest.mock import patch

from scene_reader_worker.processor import (
    ClassifiedCandidate,
    formal_generation_eligible,
    order_classified_candidates,
    process_chapter,
)
from scene_reader_worker.prompt import (
    DISCOVERY_SYSTEM_PROMPT,
    build_classification_context,
    build_classification_user_prompt,
    build_discovery_user_prompt,
)
from scene_reader_worker.types import (
    BookVisualProfile,
    CandidateSeed,
    RankedImageType,
    VisualEvidence,
    VisualProfileFact,
)
from scene_reader_worker.validator import validate_candidate_classification


PAYLOAD = {
    "taskId": "task-1",
    "bookId": "book-1",
    "chapterId": "chapter-1",
    "chapterTitle": "The bridge",
    "blocks": [
        {"id": "p0", "type": "paragraph", "text": "paragraph zero"},
        {"id": "p1", "type": "paragraph", "text": "paragraph one"},
        {"id": "p2", "type": "paragraph", "text": "paragraph two"},
        {"id": "p3", "type": "paragraph", "text": "target paragraph"},
        {"id": "p4", "type": "paragraph", "text": "paragraph four"},
        {"id": "p5", "type": "paragraph", "text": "paragraph five"},
    ],
}


def seed(source_block_id: str = "p3", position: int = 3, reading_value: float = 0.8) -> CandidateSeed:
    return CandidateSeed(
        id=f"seed-{source_block_id}",
        chapterId="chapter-1",
        sourceBlockId=source_block_id,
        position=position,
        readingValue=reading_value,
        reason="Supports reader understanding.",
        evidence=(VisualEvidence(sourceBlockId=source_block_id, sourceText="Visible evidence."),),
    )


def raw_classification(confidences=(0.9, 0.7, 0.5)) -> dict:
    return {
        "primaryType": "environment",
        "rankedTypes": [
            {"imageType": "environment", "confidence": confidences[0]},
            {"imageType": "atmosphere", "confidence": confidences[1]},
            {"imageType": "object", "confidence": confidences[2]},
        ],
        "evidence": [{"sourceBlockId": "p3", "sourceText": "Visible evidence."}],
        "reason": "The setting is visually useful.",
        "auxiliaryTags": ["rain", "clue"],
        "profileFactSuggestions": [],
    }


def classified(
    candidate_seed: CandidateSeed,
    primary_type: str,
    confidence: float,
) -> ClassifiedCandidate:
    ranked_fallbacks = [
        image_type
        for image_type in ("environment", "portrait", "interaction", "action", "object", "atmosphere")
        if image_type != primary_type
    ]
    return ClassifiedCandidate(
        seed=candidate_seed,
        classification=validate_candidate_classification(
            raw_classification((confidence, confidence - 0.1, confidence - 0.2))
            | {"primaryType": primary_type, "rankedTypes": [
                {"imageType": primary_type, "confidence": confidence},
                {"imageType": ranked_fallbacks[0], "confidence": confidence - 0.1},
                {"imageType": ranked_fallbacks[1], "confidence": confidence - 0.2},
            ]}
        ),
        provider="kimi",
    )


class ClassificationPipelineTest(unittest.TestCase):
    def test_discovery_prompt_includes_whole_chapter_without_final_type_selection(self) -> None:
        prompt = build_discovery_user_prompt(PAYLOAD)

        for block in PAYLOAD["blocks"]:
            self.assertIn(block["id"], prompt)
            self.assertIn(block["text"], prompt)
        self.assertNotIn("primaryType", prompt)
        self.assertNotIn("rankedTypes", prompt)
        self.assertNotIn("environment", DISCOVERY_SYSTEM_PROMPT)

    def test_classification_prompt_uses_target_and_exactly_two_available_paragraphs_each_side(self) -> None:
        profile = BookVisualProfile(
            id="profile-1",
            bookId="book-1",
            entityType="character",
            entityKey="lin",
            stableFacts=(
                VisualProfileFact(
                    field="coat",
                    value="dark wool",
                    sourceBlockId="p1",
                    sourceText="Lin wore dark wool.",
                    stability="stable",
                ),
            ),
            flexibleFacts=(),
        )
        context = build_classification_context(PAYLOAD, seed(), (profile,))
        prompt = build_classification_user_prompt(context)

        self.assertEqual([block["id"] for block in context.paragraphs], ["p1", "p2", "p3", "p4", "p5"])
        self.assertEqual(context.target.sourceBlockId, "p3")
        for paragraph_id in ("p1", "p2", "p3", "p4", "p5"):
            self.assertIn(paragraph_id, prompt)
        self.assertNotIn("p0", prompt)
        self.assertIn("character:lin", prompt)
        self.assertIn("coat=dark wool", prompt)

    def test_validator_requires_three_unique_descending_canonical_types(self) -> None:
        classification = validate_candidate_classification(raw_classification())
        self.assertEqual(classification.primaryType, "environment")
        self.assertEqual([item.imageType for item in classification.rankedTypes], ["environment", "atmosphere", "object"])
        self.assertEqual([item.confidence for item in classification.rankedTypes], [0.9, 0.7, 0.5])

        for invalid in (
            raw_classification() | {"rankedTypes": raw_classification()["rankedTypes"][:2]},
            raw_classification() | {"rankedTypes": [
                {"imageType": "environment", "confidence": 0.9},
                {"imageType": "environment", "confidence": 0.7},
                {"imageType": "object", "confidence": 0.5},
            ]},
            raw_classification((0.5, 0.7, 0.9)),
        ):
            with self.assertRaises(ValueError):
                validate_candidate_classification(invalid)

    def test_primary_confidence_threshold_boundaries(self) -> None:
        self.assertEqual(validate_candidate_classification(raw_classification((0.649, 0.5, 0.4))).status, "below_threshold")
        self.assertEqual(validate_candidate_classification(raw_classification((0.65, 0.5, 0.4))).status, "eligible")
        self.assertEqual(validate_candidate_classification(raw_classification((0.651, 0.5, 0.4))).status, "eligible")

    def test_profile_suggestions_reject_every_non_domain_stability_before_classification_construction(self) -> None:
        for stability in ("", "unknown", "stable-ish", None, 1):
            invalid = raw_classification() | {
                "profileFactSuggestions": [
                    {
                        "field": "coat",
                        "value": "dark wool",
                        "sourceBlockId": "p3",
                        "sourceText": "Visible evidence.",
                        "stability": stability,
                    }
                ]
            }
            with patch("scene_reader_worker.validator.CandidateClassification") as constructor:
                with self.assertRaises(ValueError):
                    validate_candidate_classification(invalid)
                constructor.assert_not_called()

    def test_ordering_uses_reading_value_then_quality_and_diversity_only_for_complete_ties(self) -> None:
        high_value = classified(seed("p1", 1, 0.95), "environment", 0.7)
        lower_value = classified(seed("p2", 2, 0.8), "action", 0.7)
        higher_quality = classified(seed("p3", 3, 0.8), "object", 0.95)
        tied_environment = classified(seed("p5", 5, 0.7), "environment", 0.8)
        tied_portrait = classified(seed("p0", 0, 0.7), "portrait", 0.8)

        ordered = order_classified_candidates(
            [tied_environment, tied_portrait, lower_value, high_value, higher_quality]
        )

        self.assertEqual(ordered[0], high_value)
        self.assertEqual(ordered[1], higher_quality)
        self.assertLess(ordered.index(tied_portrait), ordered.index(tied_environment))

    def test_heuristic_results_are_never_formal_generation_eligible(self) -> None:
        eligible = validate_candidate_classification(raw_classification((0.9, 0.7, 0.5)))

        self.assertTrue(formal_generation_eligible(eligible, provider="kimi"))
        self.assertFalse(formal_generation_eligible(eligible, provider="heuristic"))

    def test_process_chapter_preserves_full_classifications_and_profile_snapshot(self) -> None:
        eligible = replace(
            classified(seed("p1", 1, 0.91), "environment", 0.88),
            contractVersion="contract-snapshot-7",
            profileVersion="profile-snapshot-7",
        )
        below_threshold = replace(
            classified(seed("p2", 2, 0.82), "portrait", 0.64),
            contractVersion="contract-snapshot-7",
            profileVersion="profile-snapshot-7",
        )
        profile = BookVisualProfile(
            id="profile-2",
            bookId="book-1",
            entityType="location",
            entityKey="bridge",
            stableFacts=(
                VisualProfileFact(
                    field="material",
                    value="weathered stone",
                    sourceBlockId="p1",
                    sourceText="The bridge was weathered stone.",
                    stability="stable",
                ),
            ),
            flexibleFacts=(),
            version="profile-snapshot-7",
        )

        with patch(
            "scene_reader_worker.processor.classify_chapter",
            return_value=([eligible, below_threshold], []),
        ):
            result = process_chapter(PAYLOAD, provider="openai", profiles=(profile,))

        self.assertEqual(result.classifiedCandidates, (eligible, below_threshold))
        self.assertEqual(result.profiles, (profile,))
        self.assertEqual(result.classifiedCandidates[0].contractVersion, "contract-snapshot-7")
        self.assertEqual(result.classifiedCandidates[0].profileVersion, "profile-snapshot-7")
        self.assertEqual([candidate.id for candidate in result.candidates], [eligible.seed.id])
        self.assertEqual(
            result.classifiedCandidates[0].classification.rankedTypes,
            eligible.classification.rankedTypes,
        )
        self.assertEqual(
            result.classifiedCandidates[1].classification.status,
            "below_threshold",
        )


if __name__ == "__main__":
    unittest.main()
