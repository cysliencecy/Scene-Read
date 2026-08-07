from __future__ import annotations
import json, os, urllib.request
from .types import ImageAuditResult, ImageAuditRuleResult, GeneratedImageArtifact, ImageGenerationRequest

def _text(value, name):
    if not isinstance(value, str) or not value.strip(): raise ValueError(f"Audit requires string {name}.")
    return value

def parse_audit_result(raw: dict) -> ImageAuditResult:
    if not isinstance(raw, dict) or not isinstance(raw.get("rules"), list) or not raw["rules"]: raise ValueError("Audit requires rules list.")
    if type(raw.get("severeFactConflict")) is not bool: raise ValueError("Audit requires boolean severeFactConflict.")
    rules=[]
    for value in raw["rules"]:
        if not isinstance(value, dict) or type(value.get("passed")) is not bool or value.get("severity") not in ("info","warning","severe"): raise ValueError("Invalid audit rule.")
        rules.append(ImageAuditRuleResult(_text(value.get("rule"),"rule"),value["passed"],value["severity"],_text(value.get("explanation"),"explanation")))
    severe=raw["severeFactConflict"] or any(not r.passed and r.severity=="severe" for r in rules)
    return ImageAuditResult("blocked" if severe else "publishable",tuple(rules),raw["severeFactConflict"],_text(raw.get("provider"),"provider"),_text(raw.get("model"),"model"),_text(raw.get("auditVersion"),"auditVersion"))

def audit_image(artifact: GeneratedImageArtifact, request: ImageGenerationRequest) -> dict:
    endpoint=os.getenv("VISION_AUDIT_ENDPOINT")
    if not endpoint: raise RuntimeError("VISION_AUDIT_ENDPOINT is required for formal generation.")
    body={"model":os.getenv("VISION_AUDIT_MODEL"),"auditVersion":os.getenv("VISION_AUDIT_VERSION"),"imageBase64":artifact.imageBase64,"requestedType":request.requestedType,"aspectRatio":request.aspectRatio}
    req=urllib.request.Request(endpoint,data=json.dumps(body).encode(),headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=60) as response: return json.loads(response.read().decode())
