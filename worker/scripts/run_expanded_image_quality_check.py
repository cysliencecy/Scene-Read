"""Evaluate the fixed offline image-quality activation dataset.

This module is deliberately independent of the Worker CLI and its callback
transports.  It only reads local JSON snapshots and writes local reports.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any, Callable, Iterable


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_IMAGE_TYPES = (
    "environment",
    "portrait",
    "interaction",
    "action",
    "object",
    "atmosphere",
)
SAMPLE_SCHEMA_VERSION = "expanded-image-quality-samples/v1"
RESULT_SCHEMA_VERSION = "expanded-image-quality-results/v1"
REPORT_SCHEMA_VERSION = "expanded-image-quality-report/v1"
GATE_THRESHOLDS = {
    "classificationAccuracy": 0.80,
    "compositionCompliance": 0.85,
    "severeFactConflictRate": 0.05,
    "blindTypeRecognitionRate": 0.75,
}
VERSION_FIELDS = {
    "modelVersion": "modelVersions",
    "promptVersion": "promptVersions",
    "contractVersion": "contractVersions",
    "auditVersion": "auditVersions",
}


def _as_collection(payload: Any, key: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        values = payload
    elif isinstance(payload, dict):
        values = payload.get(key)
    else:
        raise ValueError(f"{key} document must be an object or list.")
    if not isinstance(values, list):
        raise ValueError(f"{key} must be a list.")
    if not all(isinstance(value, dict) for value in values):
        raise ValueError(f"Every {key[:-1]} must be an object.")
    return values


def _required_string(payload: dict[str, Any], field: str, context: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context} requires non-empty {field}.")
    return value.strip()


def _require_canonical_type(value: str, context: str) -> None:
    if value not in CANONICAL_IMAGE_TYPES:
        raise ValueError(f"{context} must be one of the canonical image types.")


def validate_samples(raw_samples: Any) -> list[dict[str, Any]]:
    """Validate the immutable 60-sample annotation set."""
    samples = _as_collection(raw_samples, "samples")
    if len(samples) != 60:
        raise ValueError("Quality dataset requires exactly 60 samples.")

    ids: list[str] = []
    expected_types: list[str] = []
    for item in samples:
        sample_id = _required_string(item, "id", "Sample")
        expected_type = _required_string(item, "expectedPrimaryType", f"Sample {sample_id}")
        _require_canonical_type(expected_type, f"Sample {sample_id} expectedPrimaryType")
        evidence = item.get("evidence")
        if not isinstance(evidence, dict):
            raise ValueError(f"Sample {sample_id} requires an evidence object.")
        _required_string(evidence, "sourceBlockId", f"Sample {sample_id} evidence")
        _required_string(evidence, "sourceText", f"Sample {sample_id} evidence")
        _required_string(item, "expectedComposition", f"Sample {sample_id}")
        ids.append(sample_id)
        expected_types.append(expected_type)

    if len(set(ids)) != len(ids):
        raise ValueError("Quality dataset sample IDs must be unique.")
    counts = Counter(expected_types)
    if set(counts) != set(CANONICAL_IMAGE_TYPES) or any(
        counts[image_type] != 10 for image_type in CANONICAL_IMAGE_TYPES
    ):
        raise ValueError("Quality dataset requires exactly 10 samples per canonical type.")
    return samples


def validate_results(samples: Iterable[dict[str, Any]], raw_results: Any) -> list[dict[str, Any]]:
    """Validate local pipeline/audit snapshots before calculating metrics."""
    sample_ids = {_required_string(sample, "id", "Sample") for sample in samples}
    results = _as_collection(raw_results, "results")
    result_ids: list[str] = []
    for item in results:
        sample_id = _required_string(item, "sampleId", "Result")
        for field in ("predictedPrimaryType", "blindPrimaryType"):
            value = _required_string(item, field, f"Result {sample_id}")
            _require_canonical_type(value, f"Result {sample_id} {field}")
        for field in ("compositionCompliant", "severeFactConflict"):
            if type(item.get(field)) is not bool:
                raise ValueError(f"Result {sample_id} requires boolean {field}.")
        for field in VERSION_FIELDS:
            _required_string(item, field, f"Result {sample_id}")
        result_ids.append(sample_id)
    if len(result_ids) != len(set(result_ids)):
        raise ValueError("Quality result sample IDs must be unique.")
    if set(result_ids) != sample_ids:
        raise ValueError("Quality results must contain exactly one result for every sample.")
    return results


def _metric(numerator: int, denominator: int) -> float:
    if denominator == 0:
        raise ValueError("Quality evaluation requires at least one sample.")
    return round(numerator / denominator, 6)


def evaluate_results(samples: Iterable[dict[str, Any]], raw_results: Any) -> dict[str, Any]:
    """Return pure, deterministic metrics and per-sample failures."""
    sample_list = list(samples)
    results = validate_results(sample_list, raw_results)
    by_id = {result["sampleId"]: result for result in results}
    total = len(sample_list)
    classification_correct = 0
    composition_compliant = 0
    severe_fact_conflicts = 0
    blind_correct = 0
    failures: list[dict[str, Any]] = []

    for item in sample_list:
        sample_id = _required_string(item, "id", "Sample")
        expected_type = _required_string(item, "expectedPrimaryType", f"Sample {sample_id}")
        result = by_id[sample_id]
        reasons: list[str] = []
        if result["predictedPrimaryType"] == expected_type:
            classification_correct += 1
        else:
            reasons.append("classification")
        if result["compositionCompliant"]:
            composition_compliant += 1
        else:
            reasons.append("composition")
        if result["severeFactConflict"]:
            severe_fact_conflicts += 1
            reasons.append("severeFactConflict")
        if result["blindPrimaryType"] == expected_type:
            blind_correct += 1
        else:
            reasons.append("blindRecognition")
        if reasons:
            failures.append(
                {
                    "sampleId": sample_id,
                    "expectedPrimaryType": expected_type,
                    "reasons": reasons,
                }
            )

    metrics = {
        "classificationAccuracy": _metric(classification_correct, total),
        "compositionCompliance": _metric(composition_compliant, total),
        "severeFactConflictRate": _metric(severe_fact_conflicts, total),
        "blindTypeRecognitionRate": _metric(blind_correct, total),
    }
    failed_gates = [
        "classificationAccuracy" if metrics["classificationAccuracy"] < GATE_THRESHOLDS["classificationAccuracy"] else None,
        "compositionCompliance" if metrics["compositionCompliance"] < GATE_THRESHOLDS["compositionCompliance"] else None,
        "severeFactConflictRate" if metrics["severeFactConflictRate"] > GATE_THRESHOLDS["severeFactConflictRate"] else None,
        "blindTypeRecognitionRate" if metrics["blindTypeRecognitionRate"] < GATE_THRESHOLDS["blindTypeRecognitionRate"] else None,
    ]
    failures.sort(key=lambda item: (CANONICAL_IMAGE_TYPES.index(item["expectedPrimaryType"]), item["sampleId"]))
    versions = {
        report_key: sorted({result[field] for result in results})
        for field, report_key in VERSION_FIELDS.items()
    }
    return {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "evaluationMode": "offline",
        "sampleCount": total,
        "metrics": metrics,
        "thresholds": GATE_THRESHOLDS,
        "failedGates": [gate for gate in failed_gates if gate],
        "failedSampleIds": [item["sampleId"] for item in failures],
        "failures": failures,
        "versions": versions,
        "passed": not any(failed_gates),
    }


def render_markdown_report(report: dict[str, Any]) -> str:
    """Render the report without timestamps so reruns are byte-stable."""
    metric_rows = "\n".join(
        f"| {metric} | {report['metrics'][metric]:.2%} | {report['thresholds'][metric]:.2%} |"
        for metric in report["metrics"]
    )
    versions = "\n".join(
        f"- {name}: {', '.join(values)}" for name, values in report["versions"].items()
    )
    failed_ids = ", ".join(report["failedSampleIds"]) or "None"
    failures = "\n".join(
        f"| {item['sampleId']} | {item['expectedPrimaryType']} | {', '.join(item['reasons'])} |"
        for item in report["failures"]
    ) or "| None | — | — |"
    failed_gates = ", ".join(report["failedGates"]) or "None"
    return f"""# Expanded image quality report

Status: **{'PASS' if report['passed'] else 'FAIL'}** (offline evaluation only)

## Gate metrics

| Metric | Actual | Threshold |
| --- | ---: | ---: |
{metric_rows}

Failed gates: {failed_gates}

## Versions

{versions}

## Failed samples

Failed sample IDs: {failed_ids}

| Sample ID | Expected type | Reasons |
| --- | --- | --- |
{failures}
"""


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def run_evaluation(
    *,
    samples_path: Path,
    results_path: Path,
    output_path: Path,
    production_callback: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """Write only local JSON/Markdown reports; production callbacks are ignored."""
    del production_callback  # Evaluation deliberately cannot invoke Server/Supabase transports.
    samples = validate_samples(_read_json(samples_path))
    report = evaluate_results(samples, _read_json(results_path))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output_path.with_suffix(".md").write_text(render_markdown_report(report), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the isolated expanded-image quality activation gate.")
    parser.add_argument("--samples", type=Path, default=ROOT / "worker" / "samples" / "expanded-image-quality-samples.json")
    parser.add_argument("--results", type=Path, default=ROOT / "worker" / "samples" / "expanded-image-quality-results.example.json")
    parser.add_argument("--output", type=Path, default=ROOT / "worker" / ".tmp" / "expanded-image-quality-report.json")
    args = parser.parse_args(argv)
    report = run_evaluation(samples_path=args.samples, results_path=args.results, output_path=args.output)
    print(json.dumps({"output": str(args.output), "passed": report["passed"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
