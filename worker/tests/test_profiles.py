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


def unsafe_stable_fact(source_block_id: str, source_text: str) -> VisualProfileFact:
    """Construct malformed persisted data to exercise enclosing profile/merge boundaries."""
    fact = object.__new__(VisualProfileFact)
    object.__setattr__(fact, "field", "coat")
    object.__setattr__(fact, "value", "dark wool coat")
    object.__setattr__(fact, "sourceBlockId", source_block_id)
    object.__setattr__(fact, "sourceText", source_text)
    object.__setattr__(fact, "stability", "stable")
    return fact


def unsafe_profile(fact: VisualProfileFact) -> BookVisualProfile:
    """Represent a malformed legacy/persisted profile that bypassed dataclass construction."""
    profile = object.__new__(BookVisualProfile)
    object.__setattr__(profile, "id", "unsafe-profile")
    object.__setattr__(profile, "bookId", "book-1")
    object.__setattr__(profile, "entityType", "character")
    object.__setattr__(profile, "entityKey", "lin")
    object.__setattr__(profile, "stableFacts", (fact,))
    object.__setattr__(profile, "flexibleFacts", ())
    object.__setattr__(profile, "version", "profile-v1")
    return profile


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

    def test_stable_facts_need_source_evidence_at_fact_and_profile_boundaries(self) -> None:
        for source_block_id, source_text in (("", "Evidence"), ("p-1", "")):
            with self.assertRaises(ValueError):
                VisualProfileFact(
                    field="eyeColor",
                    value="grey",
                    sourceBlockId=source_block_id,
                    sourceText=source_text,
                    stability="stable",
                )
            with self.assertRaises(ValueError):
                BookVisualProfile(
                    id="profile-invalid",
                    bookId="book-1",
                    entityType="character",
                    entityKey="lin",
                    stableFacts=(unsafe_stable_fact(source_block_id, source_text),),
                    flexibleFacts=(),
                )
            with self.assertRaises(ValueError):
                merge_profile_facts(unsafe_profile(unsafe_stable_fact(source_block_id, source_text)), ())

        inferred = VisualProfileFact(
            field="mood",
            value="guarded",
            sourceBlockId="",
            sourceText="",
            stability="inferred",
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
