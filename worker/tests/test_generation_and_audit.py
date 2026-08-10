import base64
import json
import unittest
from unittest.mock import patch

from scene_reader_worker.audit import audit_image, parse_audit_result
from scene_reader_worker.image_generator import (
    DEFAULT_GLM_IMAGE_ENDPOINT,
    generate_formal_image,
)
from scene_reader_worker.pipeline import (
    GenerationAttempt,
    generation_attempt_callback_payload,
    run_generation_attempt,
)
from scene_reader_worker.types import (
    GeneratedImageArtifact,
    ImageAuditResult,
    ImageAuditRuleResult,
    ImageGenerationRequest,
)


def formal_request(prompt: str = "contract=environment; visible rain") -> ImageGenerationRequest:
    return ImageGenerationRequest(
        idempotencyKey="attempt-key",
        candidateId="candidate-7",
        taskId="task-3",
        trigger="automatic",
        requestedType="environment",
        prompt=prompt,
        style="写实",
        aspectRatio="3:2",
        contractVersion="composition-v1",
    )


def svg_bytes(width: int, height: int) -> bytes:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><rect width="100%" height="100%"/></svg>'
    ).encode("utf-8")


class FakeResponse:
    def __init__(self, body: bytes, content_type: str = "application/json") -> None:
        self.body = body
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        return None

    def read(self) -> bytes:
        return self.body


class LiveProviderBoundaryTest(unittest.TestCase):
    def test_glm_posts_canonical_payload_and_records_decoded_dimensions(self) -> None:
        prompt = "contract=environment;version=composition-v1\nvisible bridge & rain"
        requests = []

        def urlopen(request, timeout=0):
            requests.append((request, timeout))
            url = request.full_url if hasattr(request, "full_url") else request
            if url == DEFAULT_GLM_IMAGE_ENDPOINT:
                return FakeResponse(
                    b'{"data":[{"url":"https://images.example/generated.svg"}]}'
                )
            if url == "https://images.example/generated.svg":
                return FakeResponse(svg_bytes(768, 512), "image/svg+xml; charset=utf-8")
            raise AssertionError(f"Unexpected URL: {url}")

        with patch.dict(
            "os.environ",
            {
                "GLM_API_KEY": "test-key",
                "GLM_IMAGE_MODEL": "glm-image-test",
                "GLM_IMAGE_SIZE": "1024x1024",
            },
            clear=True,
        ), patch(
            "scene_reader_worker.image_generator.urllib.request.urlopen",
            side_effect=urlopen,
        ):
            artifact = generate_formal_image(formal_request(prompt), "glm")

        generation_request = requests[0][0]
        self.assertEqual(generation_request.full_url, DEFAULT_GLM_IMAGE_ENDPOINT)
        self.assertEqual(generation_request.get_method(), "POST")
        self.assertEqual(
            json.loads(generation_request.data.decode("utf-8")),
            {
                "model": "glm-image-test",
                "prompt": prompt,
                "size": "1536x1024",
            },
        )
        self.assertEqual(
            (artifact.mimeType, artifact.provider, artifact.model, artifact.width, artifact.height),
            ("image/svg+xml", "glm", "glm-image-test", 768, 512),
        )
        self.assertEqual(base64.b64decode(artifact.imageBase64), svg_bytes(768, 512))

    def test_pollinations_preserves_prompt_and_canonical_aspect_and_records_actual_size(self) -> None:
        prompt = "contract=action;version=composition-v1\nsubject jumps / lands?"
        requests = []

        def urlopen(request, timeout=0):
            requests.append((request, timeout))
            return FakeResponse(svg_bytes(900, 600), "image/svg+xml")

        with patch.dict(
            "os.environ",
            {"IMAGE_WIDTH": "320", "IMAGE_HEIGHT": "320"},
            clear=True,
        ), patch(
            "scene_reader_worker.image_generator.urllib.request.urlopen",
            side_effect=urlopen,
        ):
            artifact = generate_formal_image(
                ImageGenerationRequest(
                    "poll-key",
                    "candidate-action",
                    "task-3",
                    "automatic",
                    "action",
                    prompt,
                    "插画",
                    "3:2",
                    "composition-v1",
                ),
                "pollinations",
            )

        provider_request = requests[0][0]
        self.assertEqual(provider_request.get_method(), "GET")
        self.assertIn("contract%3Daction%3Bversion%3Dcomposition-v1", provider_request.full_url)
        self.assertIn("subject%20jumps%20/%20lands%3F", provider_request.full_url)
        self.assertIn("width=1536", provider_request.full_url)
        self.assertIn("height=1024", provider_request.full_url)
        self.assertNotIn("width=320", provider_request.full_url)
        self.assertEqual(
            (artifact.provider, artifact.model, artifact.width, artifact.height),
            ("pollinations", "pollinations", 900, 600),
        )

    def test_glm_rejects_decoded_non_three_two_output_after_posting_once(self) -> None:
        generation_posts = []

        def urlopen(request, timeout=0):
            url = request.full_url if hasattr(request, "full_url") else request
            if url == DEFAULT_GLM_IMAGE_ENDPOINT:
                generation_posts.append(request)
                return FakeResponse(
                    b'{"data":[{"url":"https://images.example/square.svg"}]}'
                )
            if url == "https://images.example/square.svg":
                return FakeResponse(svg_bytes(640, 640), "image/svg+xml")
            raise AssertionError(f"Unexpected URL: {url}")

        with patch.dict(
            "os.environ",
            {"GLM_API_KEY": "test-key", "GLM_IMAGE_MODEL": "glm-image-test"},
            clear=True,
        ), patch(
            "scene_reader_worker.image_generator.urllib.request.urlopen",
            side_effect=urlopen,
        ):
            with self.assertRaisesRegex(ValueError, "formal images must have a 3:2"):
                generate_formal_image(formal_request(), "glm")

        self.assertEqual(len(generation_posts), 1)
        self.assertEqual(generation_posts[0].get_method(), "POST")

    def test_live_providers_fail_when_actual_dimensions_are_invalid_or_not_three_two(self) -> None:
        for body, mime_type in (
            (b"not an image", "image/png"),
            (svg_bytes(1024, 576), "image/svg+xml"),
        ):
            with self.subTest(mime_type=mime_type, body_length=len(body)), patch(
                "scene_reader_worker.image_generator.urllib.request.urlopen",
                return_value=FakeResponse(body, mime_type),
            ):
                with self.assertRaises(ValueError):
                    generate_formal_image(formal_request(), "pollinations")

    def test_mock_svg_reports_its_decoded_real_dimensions(self) -> None:
        artifact = generate_formal_image(formal_request(), "mock-svg")

        self.assertEqual(
            (artifact.provider, artifact.mimeType, artifact.width, artifact.height),
            ("mock-svg", "image/svg+xml", 1024, 576),
        )


class AuditBoundaryTest(unittest.TestCase):
    def test_missing_or_blank_audit_config_fails_before_network(self) -> None:
        artifact = GeneratedImageArtifact("image-data", "image/png", "glm", "glm-image", 900, 600)
        configurations = (
            {},
            {"VISION_AUDIT_ENDPOINT": "https://audit.example"},
            {
                "VISION_AUDIT_ENDPOINT": "https://audit.example",
                "VISION_AUDIT_MODEL": "vision-v2",
            },
            {
                "VISION_AUDIT_ENDPOINT": "   ",
                "VISION_AUDIT_MODEL": "vision-v2",
                "VISION_AUDIT_VERSION": "audit-v3",
            },
            {
                "VISION_AUDIT_ENDPOINT": "https://audit.example",
                "VISION_AUDIT_MODEL": " ",
                "VISION_AUDIT_VERSION": "audit-v3",
            },
            {
                "VISION_AUDIT_ENDPOINT": "https://audit.example",
                "VISION_AUDIT_MODEL": "vision-v2",
                "VISION_AUDIT_VERSION": "\t",
            },
        )
        for configuration in configurations:
            with self.subTest(configuration=configuration), patch.dict(
                "os.environ", configuration, clear=True
            ), patch(
                "scene_reader_worker.audit.urllib.request.urlopen"
            ) as urlopen:
                with self.assertRaises(RuntimeError):
                    audit_image(artifact, formal_request())
                urlopen.assert_not_called()

    def test_audit_posts_exact_image_and_request_data_and_strictly_parses_response(self) -> None:
        artifact = GeneratedImageArtifact(
            "image-data", "image/png", "glm", "glm-image-test", 900, 600
        )
        raw_response = {
            "rules": [
                {
                    "rule": "environment composition",
                    "passed": True,
                    "severity": "info",
                    "explanation": "The setting leads the frame.",
                }
            ],
            "severeFactConflict": False,
            "provider": "vision-gateway",
            "model": "vision-v2",
            "auditVersion": "audit-v3",
        }
        captured = []

        def urlopen(request, timeout=0):
            captured.append((request, timeout))
            return FakeResponse(json.dumps(raw_response).encode("utf-8"))

        with patch.dict(
            "os.environ",
            {
                "VISION_AUDIT_ENDPOINT": "https://audit.example/v1/check",
                "VISION_AUDIT_MODEL": "vision-v2",
                "VISION_AUDIT_VERSION": "audit-v3",
            },
            clear=True,
        ), patch(
            "scene_reader_worker.audit.urllib.request.urlopen", side_effect=urlopen
        ):
            result = audit_image(artifact, formal_request())

        transport_request, timeout = captured[0]
        self.assertEqual(transport_request.full_url, "https://audit.example/v1/check")
        self.assertEqual(transport_request.get_method(), "POST")
        self.assertEqual(timeout, 60)
        self.assertEqual(
            json.loads(transport_request.data.decode("utf-8")),
            {
                "model": "vision-v2",
                "auditVersion": "audit-v3",
                "image": {
                    "imageBase64": "image-data",
                    "mimeType": "image/png",
                    "provider": "glm",
                    "model": "glm-image-test",
                    "width": 900,
                    "height": 600,
                },
                "request": {
                    "idempotencyKey": "attempt-key",
                    "candidateId": "candidate-7",
                    "taskId": "task-3",
                    "trigger": "automatic",
                    "requestedType": "environment",
                    "prompt": "contract=environment; visible rain",
                    "style": "写实",
                    "aspectRatio": "3:2",
                    "contractVersion": "composition-v1",
                },
            },
        )
        self.assertEqual(result.verdict, "publishable")
        self.assertEqual(result.auditVersion, "audit-v3")

    def test_live_audit_rejects_malformed_response(self) -> None:
        malformed = {
            "rules": [
                {
                    "rule": "type",
                    "passed": "false",
                    "severity": "severe",
                    "explanation": "wrong type",
                }
            ],
            "severeFactConflict": False,
            "provider": "vision",
            "model": "vision-v2",
            "auditVersion": "audit-v3",
        }
        with patch.dict(
            "os.environ",
            {
                "VISION_AUDIT_ENDPOINT": "https://audit.example",
                "VISION_AUDIT_MODEL": "vision-v2",
                "VISION_AUDIT_VERSION": "audit-v3",
            },
            clear=True,
        ), patch(
            "scene_reader_worker.audit.urllib.request.urlopen",
            return_value=FakeResponse(json.dumps(malformed).encode("utf-8")),
        ):
            with self.assertRaises(ValueError):
                audit_image(
                    GeneratedImageArtifact("data", "image/png", "glm", "glm", 900, 600),
                    formal_request(),
                )

    def test_parser_rejects_every_coercible_invalid_field(self) -> None:
        valid = {
            "rules": [
                {
                    "rule": "type",
                    "passed": True,
                    "severity": "info",
                    "explanation": "ok",
                }
            ],
            "severeFactConflict": False,
            "provider": "vision",
            "model": "vision-v2",
            "auditVersion": "audit-v3",
        }
        invalid_values = (
            {},
            valid | {"rules": []},
            valid | {"severeFactConflict": 0},
            valid | {"provider": " "},
            valid | {"rules": [{**valid["rules"][0], "passed": "true"}]},
            valid | {"rules": [{**valid["rules"][0], "severity": "critical"}]},
            valid | {"rules": [{**valid["rules"][0], "explanation": None}]},
        )
        for raw in invalid_values:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_audit_result(raw)


class GenerationAttemptTest(unittest.TestCase):
    def test_heuristic_is_rejected_before_generation(self) -> None:
        with self.assertRaises(ValueError):
            run_generation_attempt(
                formal_request(),
                provider="heuristic",
                generate=lambda request: None,
                audit=lambda artifact, request: {},
            )

    def test_success_and_blocked_paths_call_generation_and_audit_once(self) -> None:
        for severe, expected_status in ((False, "publishable"), (True, "blocked")):
            calls = {"generation": 0, "audit": 0}

            def generate(request):
                calls["generation"] += 1
                return GeneratedImageArtifact(
                    "kept-image", "image/png", "glm", "glm-image", 900, 600
                )

            def audit(artifact, request):
                calls["audit"] += 1
                return {
                    "rules": [
                        {
                            "rule": "type",
                            "passed": not severe,
                            "severity": "severe" if severe else "info",
                            "explanation": "bad" if severe else "ok",
                        }
                    ],
                    "severeFactConflict": False,
                    "provider": "vision",
                    "model": "vision-v2",
                    "auditVersion": "audit-v3",
                }

            result = run_generation_attempt(
                formal_request(), provider="glm", generate=generate, audit=audit
            )

            self.assertEqual(calls, {"generation": 1, "audit": 1})
            self.assertEqual(result.status, expected_status)
            self.assertEqual(result.artifact.imageBase64, "kept-image")

    def test_severe_fact_conflict_alone_blocks_once_and_retains_artifact(self) -> None:
        calls = {"generation": 0, "audit": 0}

        def generate(request):
            calls["generation"] += 1
            return GeneratedImageArtifact(
                "fact-conflict-image", "image/png", "glm", "glm-image", 900, 600
            )

        def audit(artifact, request):
            calls["audit"] += 1
            return {
                "rules": [
                    {
                        "rule": "environment composition",
                        "passed": True,
                        "severity": "info",
                        "explanation": "Composition is compliant.",
                    }
                ],
                "severeFactConflict": True,
                "provider": "vision",
                "model": "vision-v2",
                "auditVersion": "audit-v3",
            }

        result = run_generation_attempt(
            formal_request(), provider="glm", generate=generate, audit=audit
        )

        self.assertEqual(calls, {"generation": 1, "audit": 1})
        self.assertEqual(result.status, "blocked")
        self.assertEqual(result.artifact.imageBase64, "fact-conflict-image")

    def test_generation_and_audit_failures_never_retry(self) -> None:
        calls = {"generation": 0, "audit": 0}

        def generation_failure(request):
            calls["generation"] += 1
            raise RuntimeError("provider unavailable")

        failed_generation = run_generation_attempt(
            formal_request(),
            provider="glm",
            generate=generation_failure,
            audit=lambda artifact, request: calls.__setitem__("audit", calls["audit"] + 1),
        )
        self.assertEqual((failed_generation.status, calls), ("generation_failed", {"generation": 1, "audit": 0}))

        calls = {"generation": 0, "audit": 0}

        def generated(request):
            calls["generation"] += 1
            return GeneratedImageArtifact("kept", "image/png", "glm", "glm", 900, 600)

        def audit_failure(artifact, request):
            calls["audit"] += 1
            raise RuntimeError("audit unavailable")

        failed_audit = run_generation_attempt(
            formal_request(), provider="glm", generate=generated, audit=audit_failure
        )
        self.assertEqual((failed_audit.status, calls), ("audit_failed", {"generation": 1, "audit": 1}))
        self.assertEqual(failed_audit.artifact.imageBase64, "kept")

    def test_attempt_callback_is_flat_and_omits_internal_error(self) -> None:
        audit = ImageAuditResult(
            "publishable",
            (ImageAuditRuleResult("type", True, "info", "ok"),),
            False,
            "vision",
            "vision-v2",
            "audit-v3",
        )
        attempt = GenerationAttempt(
            "publishable",
            GeneratedImageArtifact("image-data", "image/png", "glm", "glm-image", 900, 600),
            audit,
            "internal detail must not cross the callback boundary",
        )

        payload = generation_attempt_callback_payload(formal_request(), attempt)

        self.assertEqual(
            payload,
            {
                "idempotencyKey": "attempt-key",
                "candidateId": "candidate-7",
                "taskId": "task-3",
                "trigger": "automatic",
                "requestedType": "environment",
                "prompt": "contract=environment; visible rain",
                "status": "publishable",
                "provider": "glm",
                "model": "glm-image",
                "width": 900,
                "height": 600,
                "imageBase64": "image-data",
                "mimeType": "image/png",
                "audit": {
                    "verdict": "publishable",
                    "rules": [
                        {
                            "rule": "type",
                            "passed": True,
                            "severity": "info",
                            "explanation": "ok",
                        }
                    ],
                    "severeFactConflict": False,
                    "provider": "vision",
                    "model": "vision-v2",
                    "auditVersion": "audit-v3",
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
