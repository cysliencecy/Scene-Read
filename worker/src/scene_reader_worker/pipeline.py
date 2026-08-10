from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Callable

from .audit import parse_audit_result
from .types import (
    AttemptStatus,
    GeneratedImageArtifact,
    ImageAuditResult,
    ImageGenerationRequest,
)


@dataclass(frozen=True)
class GenerationAttempt:
    status: AttemptStatus
    artifact: GeneratedImageArtifact | None
    audit: ImageAuditResult | None
    error: str | None = None


def _artifact(raw: Any) -> GeneratedImageArtifact:
    if isinstance(raw, GeneratedImageArtifact):
        return raw
    if not isinstance(raw, dict):
        raise ValueError("Image provider must return GeneratedImageArtifact data.")
    return GeneratedImageArtifact(**raw)


def _audit_result(raw: Any) -> ImageAuditResult:
    if isinstance(raw, ImageAuditResult):
        return raw
    return parse_audit_result(raw)


def run_generation_attempt(
    request: ImageGenerationRequest,
    *,
    provider: str,
    generate: Callable[[ImageGenerationRequest], Any],
    audit: Callable[[GeneratedImageArtifact, ImageGenerationRequest], Any],
) -> GenerationAttempt:
    if provider == "heuristic":
        raise ValueError("Heuristic classifications cannot generate formal images.")
    try:
        artifact = _artifact(generate(request))
    except Exception as error:
        return GenerationAttempt("generation_failed", None, None, str(error))
    try:
        audit_result = _audit_result(audit(artifact, request))
    except Exception as error:
        return GenerationAttempt("audit_failed", artifact, None, str(error))
    return GenerationAttempt(audit_result.verdict, artifact, audit_result)


def _audit_callback_payload(audit: ImageAuditResult) -> dict:
    return {
        "verdict": audit.verdict,
        "rules": [asdict(rule) for rule in audit.rules],
        "severeFactConflict": audit.severeFactConflict,
        "provider": audit.provider,
        "model": audit.model,
        "auditVersion": audit.auditVersion,
    }


def generation_attempt_callback_payload(
    request: ImageGenerationRequest,
    attempt: GenerationAttempt,
    *,
    parent_attempt_id: str | None = None,
) -> dict:
    """Serialize exactly the approved POST /worker/image-generation-attempts body."""
    payload = {
        "idempotencyKey": request.idempotencyKey,
        "candidateId": request.candidateId,
        "taskId": request.taskId,
        "trigger": request.trigger,
        "requestedType": request.requestedType,
        "prompt": request.prompt,
        "status": attempt.status,
    }
    if parent_attempt_id is not None:
        payload["parentAttemptId"] = parent_attempt_id
    if attempt.artifact is not None:
        payload.update(asdict(attempt.artifact))
    if attempt.audit is not None:
        payload["audit"] = _audit_callback_payload(attempt.audit)
    return payload
