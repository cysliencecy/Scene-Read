import unittest
from unittest.mock import patch

from scene_reader_worker.audit import parse_audit_result
from scene_reader_worker.pipeline import run_generation_attempt
from scene_reader_worker.types import ImageGenerationRequest


def request() -> ImageGenerationRequest:
    return ImageGenerationRequest("key", "candidate", "task", "automatic", "environment", "prompt", "写实", "3:2", "composition-v1")


class GenerationAuditTest(unittest.TestCase):
    def test_glm_landscape_and_pollinations_contract(self):
        from scene_reader_worker.image_generator import build_glm_payload, build_pollinations_url
        self.assertEqual(build_glm_payload(request())["size"], "1536x1024")
        self.assertIn("prompt", build_glm_payload(request()))
        self.assertIn("width=1536", build_pollinations_url(request()))
        self.assertIn("height=1024", build_pollinations_url(request()))

    def test_heuristic_is_rejected(self):
        with self.assertRaises(ValueError):
            run_generation_attempt(request(), provider="heuristic", generate=lambda r: None, audit=lambda a, r: {})

    def test_success_and_severe_are_single_call_and_keep_bytes(self):
        calls = {"g": 0, "a": 0}
        def generate(r):
            calls["g"] += 1
            return {"imageBase64": "bytes", "mimeType": "image/png", "provider": "glm", "model": "glm-image", "width": 1536, "height": 1024}
        def audit(a, r):
            calls["a"] += 1
            return {"rules": [{"rule": "type", "passed": True, "severity": "info", "explanation": "ok"}], "severeFactConflict": False, "provider": "vision", "model": "vision", "auditVersion": "audit-v1"}
        result = run_generation_attempt(request(), provider="glm", generate=generate, audit=audit)
        self.assertEqual((calls["g"], calls["a"], result.status), (1, 1, "publishable"))
        blocked = run_generation_attempt(request(), provider="glm", generate=generate, audit=lambda a,r: {"rules": [{"rule":"type","passed":False,"severity":"severe","explanation":"bad"}], "severeFactConflict": False, "provider":"vision","model":"vision","auditVersion":"audit-v1"})
        self.assertEqual(blocked.status, "blocked")
        self.assertEqual(blocked.artifact.imageBase64, "bytes")

    def test_failures_do_not_retry(self):
        calls = {"g": 0, "a": 0}
        def fail(r): calls["g"] += 1; raise RuntimeError("no")
        self.assertEqual(run_generation_attempt(request(), provider="glm", generate=fail, audit=lambda a,r: {}).status, "generation_failed")
        self.assertEqual(calls["g"], 1)

    def test_blocked_and_audit_failures_are_single_call_and_retain_artifact(self):
        calls={"g":0,"a":0}
        def generate(r): calls["g"]+=1; return {"imageBase64":"kept","mimeType":"image/png","provider":"glm","model":"glm","width":1536,"height":1024}
        def blocked(a,r): calls["a"]+=1; return {"rules":[{"rule":"type","passed":False,"severity":"severe","explanation":"bad"}],"severeFactConflict":False,"provider":"vision","model":"v","auditVersion":"1"}
        result=run_generation_attempt(request(),provider="glm",generate=generate,audit=blocked)
        self.assertEqual((calls["g"],calls["a"],result.status,result.artifact.imageBase64),(1,1,"blocked","kept"))
        for bad in (lambda a,r: (_ for _ in ()).throw(RuntimeError("audit")), lambda a,r: {"rules":"bad"}):
            calls={"g":0,"a":0}
            def counted(a,r,bad=bad): calls["a"]+=1; return bad(a,r)
            result=run_generation_attempt(request(),provider="glm",generate=generate,audit=counted)
            self.assertEqual((calls["g"],calls["a"],result.status,result.artifact.imageBase64),(1,1,"audit_failed","kept"))

    def test_strict_parser_and_live_adapter_contracts(self):
        for raw in ({},{"rules":[]},{"rules":[{"rule":"x","passed":"false","severity":"info","explanation":"x"}],"severeFactConflict":False,"provider":"v","model":"m","auditVersion":"1"},{"rules":[{"rule":"x","passed":False,"severity":"odd","explanation":"x"}],"severeFactConflict":False,"provider":"v","model":"m","auditVersion":"1"}):
            with self.assertRaises(ValueError): parse_audit_result(raw)
        from scene_reader_worker.image_generator import generate_formal_image
        with patch("scene_reader_worker.image_generator._download_glm_image", return_value=(b"png","image/png")), patch.dict("os.environ", {"GLM_IMAGE_SIZE":"1536x1024"}):
            artifact=generate_formal_image(request(),"glm")
        self.assertEqual((artifact.width,artifact.height,artifact.provider),(1536,1024,"glm"))
        with patch.dict("os.environ", {"GLM_IMAGE_SIZE":"1024x1024"}):
            with self.assertRaises(ValueError): generate_formal_image(request(),"glm")


if __name__ == "__main__": unittest.main()
