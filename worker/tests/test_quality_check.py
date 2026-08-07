from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "run_expanded_image_quality_check.py"
SPEC = importlib.util.spec_from_file_location("expanded_image_quality_check", SCRIPT_PATH)
assert SPEC and SPEC.loader
quality_check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(quality_check)


CANONICAL_TYPES = (
    "environment",
    "portrait",
    "interaction",
    "action",
    "object",
    "atmosphere",
)


def sample(sample_id: str, expected_type: str = "environment") -> dict:
    return {
        "id": sample_id,
        "expectedPrimaryType": expected_type,
        "evidence": {"sourceBlockId": f"{sample_id}-p1", "sourceText": "Evidence-backed scene."},
        "expectedComposition": "versioned composition contract is satisfied",
    }


def result(
    sample_id: str,
    expected_type: str = "environment",
    *,
    classification_correct: bool = True,
    composition_compliant: bool = True,
    severe_fact_conflict: bool = False,
    blind_correct: bool = True,
) -> dict:
    alternate_type = "portrait" if expected_type != "portrait" else "environment"
    return {
        "sampleId": sample_id,
        "predictedPrimaryType": expected_type if classification_correct else alternate_type,
        "compositionCompliant": composition_compliant,
        "severeFactConflict": severe_fact_conflict,
        "blindPrimaryType": expected_type if blind_correct else alternate_type,
        "modelVersion": "kimi-k3-2026-08",
        "promptVersion": "classification-v2",
        "contractVersion": "composition-v1",
        "auditVersion": "audit-v1",
    }


class QualityCheckTests(unittest.TestCase):
    def test_activation_gate_accepts_exact_metric_boundaries(self) -> None:
        samples = [sample(f"boundary-{index}") for index in range(60)]
        results = [
            result(
                item["id"],
                classification_correct=index < 48,
                composition_compliant=index < 51,
                severe_fact_conflict=index >= 57,
                blind_correct=index < 45,
            )
            for index, item in enumerate(samples)
        ]

        report = quality_check.evaluate_results(samples, results)

        self.assertEqual(report["metrics"], {
            "classificationAccuracy": 0.8,
            "compositionCompliance": 0.85,
            "severeFactConflictRate": 0.05,
            "blindTypeRecognitionRate": 0.75,
        })
        self.assertTrue(report["passed"])

    def test_activation_gate_rejects_one_unit_beyond_each_boundary(self) -> None:
        samples = [sample(f"failure-{index}") for index in range(60)]
        failure_cases = {
            "classificationAccuracy": {"classification_correct": 47},
            "compositionCompliance": {"composition_compliant": 50},
            "severeFactConflictRate": {"severe_fact_conflict": 4},
            "blindTypeRecognitionRate": {"blind_correct": 44},
        }

        for metric, condition in failure_cases.items():
            with self.subTest(metric=metric):
                results = []
                for index, item in enumerate(samples):
                    kwargs = {}
                    if "classification_correct" in condition:
                        kwargs["classification_correct"] = index < condition["classification_correct"]
                    if "composition_compliant" in condition:
                        kwargs["composition_compliant"] = index < condition["composition_compliant"]
                    if "severe_fact_conflict" in condition:
                        kwargs["severe_fact_conflict"] = index >= 60 - condition["severe_fact_conflict"]
                    if "blind_correct" in condition:
                        kwargs["blind_correct"] = index < condition["blind_correct"]
                    results.append(result(item["id"], **kwargs))

                report = quality_check.evaluate_results(samples, results)

                self.assertFalse(report["passed"])
                self.assertEqual(report["failedGates"], [metric])

    def test_sample_schema_requires_exactly_sixty_unique_balanced_samples(self) -> None:
        valid_samples = [
            sample(f"{image_type}-{index}", image_type)
            for image_type in CANONICAL_TYPES
            for index in range(10)
        ]

        quality_check.validate_samples(valid_samples)

        duplicate = [*valid_samples[:-1], dict(valid_samples[0])]
        with self.assertRaisesRegex(ValueError, "unique"):
            quality_check.validate_samples(duplicate)
        with self.assertRaisesRegex(ValueError, "exactly 60"):
            quality_check.validate_samples(valid_samples[:-1])

        unbalanced = [*valid_samples]
        unbalanced[-1] = sample("environment-extra", "environment")
        with self.assertRaisesRegex(ValueError, "10 samples per canonical type"):
            quality_check.validate_samples(unbalanced)

    def test_report_includes_deterministic_failed_ids_and_all_versions(self) -> None:
        samples = [sample("z-last"), sample("a-first")]
        results = [
            result("z-last", classification_correct=False),
            {
                **result("a-first", composition_compliant=False, severe_fact_conflict=True),
                "modelVersion": "kimi-k3-2026-09",
                "promptVersion": "classification-v3",
                "contractVersion": "composition-v2",
                "auditVersion": "audit-v2",
            },
        ]

        report = quality_check.evaluate_results(samples, results)

        self.assertEqual(report["failedSampleIds"], ["a-first", "z-last"])
        self.assertEqual(report["versions"], {
            "modelVersions": ["kimi-k3-2026-08", "kimi-k3-2026-09"],
            "promptVersions": ["classification-v2", "classification-v3"],
            "contractVersions": ["composition-v1", "composition-v2"],
            "auditVersions": ["audit-v1", "audit-v2"],
        })
        markdown = quality_check.render_markdown_report(report)
        self.assertIn("a-first, z-last", markdown)
        self.assertIn("classification-v2, classification-v3", markdown)

    def test_evaluation_mode_never_calls_production_callbacks_or_accepts_api_url(self) -> None:
        callback = Mock()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            samples_path = root / "samples.json"
            results_path = root / "results.json"
            output_path = root / "reports" / "quality-report.json"
            isolated_samples = [
                sample(f"{image_type}-{index}", image_type)
                for image_type in CANONICAL_TYPES
                for index in range(10)
            ]
            samples_path.write_text(json.dumps(isolated_samples), encoding="utf-8")
            results_path.write_text(
                json.dumps([result(item["id"], item["expectedPrimaryType"]) for item in isolated_samples]),
                encoding="utf-8",
            )

            quality_check.run_evaluation(
                samples_path=samples_path,
                results_path=results_path,
                output_path=output_path,
                production_callback=callback,
            )

            self.assertTrue(output_path.exists())
            self.assertTrue(output_path.with_suffix(".md").exists())
            callback.assert_not_called()

        with self.assertRaises(SystemExit) as error:
            quality_check.main(["--api-url", "https://production.example"])
        self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
