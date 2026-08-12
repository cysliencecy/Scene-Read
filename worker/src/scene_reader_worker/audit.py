from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import asdict
from typing import Any

from .types import (
    GeneratedImageArtifact,
    ImageAuditResult,
    ImageAuditRuleResult,
    ImageGenerationRequest,
)


DEMO_AUDIT_BYPASS_VERSION = "demo-audit-bypass-v1"


def demo_audit_bypass_enabled() -> bool:
    return os.getenv("DEMO_SKIP_IMAGE_AUDIT", "").strip().lower() == "true"


def _required_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Audit requires non-empty string {name}.")
    return value.strip()


def parse_audit_result(raw: dict) -> ImageAuditResult:
    if not isinstance(raw, dict):
        raise ValueError("Audit response root must be an object.")
    raw_rules = raw.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise ValueError("Audit requires a non-empty rules list.")
    if type(raw.get("severeFactConflict")) is not bool:
        raise ValueError("Audit requires boolean severeFactConflict.")

    rules: list[ImageAuditRuleResult] = []
    for value in raw_rules:
        if not isinstance(value, dict):
            raise ValueError("Every audit rule must be an object.")
        if type(value.get("passed")) is not bool:
            raise ValueError("Every audit rule requires boolean passed.")
        severity = value.get("severity")
        if severity not in ("info", "warning", "severe"):
            raise ValueError("Every audit rule requires a supported severity.")
        rules.append(
            ImageAuditRuleResult(
                rule=_required_text(value.get("rule"), "rule"),
                passed=value["passed"],
                severity=severity,
                explanation=_required_text(value.get("explanation"), "explanation"),
            )
        )

    severe = raw["severeFactConflict"] or any(
        not rule.passed and rule.severity == "severe" for rule in rules
    )
    return ImageAuditResult(
        verdict="blocked" if severe else "publishable",
        rules=tuple(rules),
        severeFactConflict=raw["severeFactConflict"],
        provider=_required_text(raw.get("provider"), "provider"),
        model=_required_text(raw.get("model"), "model"),
        auditVersion=_required_text(raw.get("auditVersion"), "auditVersion"),
    )


def _audit_configuration() -> tuple[str, str, str]:
    values = (
        os.getenv("VISION_AUDIT_ENDPOINT"),
        os.getenv("VISION_AUDIT_MODEL"),
        os.getenv("VISION_AUDIT_VERSION"),
    )
    names = ("VISION_AUDIT_ENDPOINT", "VISION_AUDIT_MODEL", "VISION_AUDIT_VERSION")
    missing = [
        name
        for name, value in zip(names, values)
        if not isinstance(value, str) or not value.strip()
    ]
    if missing:
        raise RuntimeError(
            f"Formal image audit requires non-empty configuration: {', '.join(missing)}."
        )
    return values[0].strip(), values[1].strip(), values[2].strip()


def audit_image(
    artifact: GeneratedImageArtifact,
    request: ImageGenerationRequest,
) -> ImageAuditResult:
    if demo_audit_bypass_enabled():
        return ImageAuditResult(
            verdict="publishable",
            rules=(
                ImageAuditRuleResult(
                    rule="demo-audit-bypass",
                    passed=True,
                    severity="warning",
                    explanation="Image audit was explicitly skipped for the private demo build.",
                ),
            ),
            severeFactConflict=False,
            provider="demo-bypass",
            model="none",
            auditVersion=DEMO_AUDIT_BYPASS_VERSION,
        )
    endpoint, model, version = _audit_configuration()
    body = {
        "model": model,
        "auditVersion": version,
        "image": asdict(artifact),
        "request": asdict(request),
    }
    transport_request = urllib.request.Request(
        endpoint,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(transport_request, timeout=60) as response:
        response_payload = json.loads(response.read().decode("utf-8"))
    return parse_audit_result(response_payload)
