from __future__ import annotations
from .types import ImageAuditResult, ImageAuditRuleResult

def parse_audit_result(raw: dict) -> ImageAuditResult:
    rules = raw.get("rules")
    if not isinstance(rules, list) or not rules:
        raise ValueError("Audit requires non-empty rules.")
    parsed = tuple(ImageAuditRuleResult(rule=str(r["rule"]), passed=bool(r["passed"]), severity=r["severity"], explanation=str(r["explanation"])) for r in rules)
    severe = any(not rule.passed and rule.severity == "severe" for rule in parsed)
    return ImageAuditResult(verdict="blocked" if severe or bool(raw.get("severeFactConflict")) else "publishable", rules=parsed, severeFactConflict=bool(raw.get("severeFactConflict")), provider=str(raw["provider"]), model=str(raw["model"]), auditVersion=str(raw["auditVersion"]))

def publishable(audit: ImageAuditResult) -> bool:
    return audit.verdict == "publishable"
