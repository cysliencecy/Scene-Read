import unittest

from scene_reader_worker.composition import (
    COMPOSITION_CONTRACTS,
    build_generation_prompt,
    get_composition_contract,
)
from scene_reader_worker.types import (
    CANONICAL_IMAGE_TYPES,
    BookVisualProfile,
    VisualEvidence,
    VisualProfileFact,
    require_canonical_image_type,
)


class CanonicalTypeAndCompositionTest(unittest.TestCase):
    def test_new_classifications_accept_only_six_canonical_types(self) -> None:
        self.assertEqual(
            CANONICAL_IMAGE_TYPES,
            ("environment", "portrait", "interaction", "action", "object", "atmosphere"),
        )
        for image_type in CANONICAL_IMAGE_TYPES:
            self.assertEqual(require_canonical_image_type(image_type), image_type)
        for legacy_type in ("scene", "character"):
            with self.assertRaises(ValueError):
                require_canonical_image_type(legacy_type)

    def test_every_canonical_type_has_a_complete_shared_versioned_contract(self) -> None:
        self.assertEqual(tuple(COMPOSITION_CONTRACTS), CANONICAL_IMAGE_TYPES)
        versions = set()
        for image_type in CANONICAL_IMAGE_TYPES:
            contract = get_composition_contract(image_type)
            self.assertEqual(contract.imageType, image_type)
            self.assertTrue(contract.subjectCount)
            self.assertTrue(contract.shotScale)
            self.assertTrue(contract.subjectRatio)
            self.assertTrue(contract.cameraRequirements)
            self.assertTrue(contract.requiredComposition)
            self.assertTrue(contract.exclusions)
            self.assertEqual(contract.aspectRatio, "3:2")
            versions.add(contract.version)
        self.assertEqual(len(versions), 1)

    def test_prompt_assembly_is_deterministic_and_style_does_not_select_contract(self) -> None:
        profile = BookVisualProfile(
            id="profile-1",
            bookId="book-1",
            entityType="character",
            entityKey="lin",
            stableFacts=(
                VisualProfileFact(
                    field="coat",
                    value="dark wool coat",
                    sourceBlockId="p-1",
                    sourceText="Lin wore a dark wool coat.",
                    stability="stable",
                ),
            ),
            flexibleFacts=(),
            version="profile-v1",
        )
        evidence = (VisualEvidence(sourceBlockId="p-2", sourceText="Rain glints on the bridge."),)
        prompt_inputs = dict(
            image_type="environment",
            evidence=evidence,
            profiles=(profile,),
            style="realistic",
            auxiliary_tags=("rain", "night"),
        )

        first_prompt = build_generation_prompt(**prompt_inputs)
        self.assertEqual(first_prompt, build_generation_prompt(**prompt_inputs))
        self.assertEqual(
            get_composition_contract("environment"),
            get_composition_contract("environment"),
        )
        anime_prompt = build_generation_prompt(**(prompt_inputs | {"style": "anime"}))
        self.assertIn("contract=environment", first_prompt)
        self.assertIn("contract=environment", anime_prompt)
        self.assertNotEqual(first_prompt, anime_prompt)


if __name__ == "__main__":
    unittest.main()
