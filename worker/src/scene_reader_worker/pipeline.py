from __future__ import annotations
from dataclasses import dataclass
from typing import Callable, Any
from .audit import parse_audit_result
from .types import GeneratedImageArtifact, ImageAuditResult, ImageGenerationRequest

@dataclass(frozen=True)
class GenerationAttempt:
    status: str
    artifact: GeneratedImageArtifact | None
    audit: ImageAuditResult | None
    error: str | None = None

def _artifact(raw: Any) -> GeneratedImageArtifact:
    if isinstance(raw, GeneratedImageArtifact): return raw
    return GeneratedImageArtifact(**raw)

def run_generation_attempt(request: ImageGenerationRequest, *, provider: str, generate: Callable[[ImageGenerationRequest], Any], audit: Callable[[GeneratedImageArtifact, ImageGenerationRequest], dict]) -> GenerationAttempt:
    if provider == "heuristic":
        raise ValueError("Heuristic classifications cannot generate formal images.")
    try:
        artifact = _artifact(generate(request))
    except Exception as error:
        return GenerationAttempt("generation_failed", None, None, str(error))
    try:
        audit_result = parse_audit_result(audit(artifact, request))
    except Exception as error:
        return GenerationAttempt("audit_failed", artifact, None, str(error))
    return GenerationAttempt(audit_result.verdict, artifact, audit_result)
