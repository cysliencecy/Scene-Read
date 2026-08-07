import unittest

from scene_reader_worker.profiles import merge_profile_facts, validate_profile_fact
from scene_reader_worker.types import BookVisualProfile, VisualProfileFact


def stable_fact(field: str, value: str, source_block_id: str = "p-1", source_text: str = "Evidence") -> VisualProfileFact:
    return VisualProfileFact(
        field=field,
        value=value,
        sourceBlockId=source_block_id,
        sourceText=source_text,
        stability="stable",
    )


class ProfileMergeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = BookVisualProfile(
            id="profile-1",
            bookId="book-1",
            entityType="character",
            entityKey="lin",
            stableFacts=(stable_fact("coat", "dark wool coat"),),
            flexibleFacts=(),
            version="profile-v1",
        )

    def test_stable_facts_need_source_evidence_while_inferred_facts_are_flexible(self) -> None:
        with self.assertRaises(ValueError):
            validate_profile_fact(
                VisualProfileFact(
                    field="eyeColor",
                    value="grey",
                    sourceBlockId="",
                    sourceText="",
                    stability="stable",
                )
            )

        inferred = validate_profile_fact(
            VisualProfileFact(
                field="mood",
                value="guarded",
                sourceBlockId="",
                sourceText="",
                stability="inferred",
            )
        )
        result = merge_profile_facts(self.profile, (inferred,))
        self.assertEqual(result.profile.stableFacts, self.profile.stableFacts)
        self.assertEqual(result.profile.flexibleFacts, (inferred,))
        self.assertEqual(result.conflicts, ())

    def test_conflicting_stable_fact_is_reported_without_overwrite(self) -> None:
        conflicting_fact = stable_fact("coat", "red silk coat", "p-9", "Lin wore a red silk coat.")

        result = merge_profile_facts(self.profile, (conflicting_fact,))

        self.assertEqual(result.profile.stableFacts, self.profile.stableFacts)
        self.assertEqual(len(result.conflicts), 1)
        self.assertEqual(result.conflicts[0].field, "coat")
        self.assertEqual(result.conflicts[0].existing, self.profile.stableFacts[0])
        self.assertEqual(result.conflicts[0].incoming, conflicting_fact)


if __name__ == "__main__":
    unittest.main()
