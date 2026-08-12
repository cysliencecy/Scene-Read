import unittest
from unittest.mock import Mock, patch

from scene_reader_worker.image_generator import (
    generate_images_for_candidates,
    target_image_count_for_paragraphs,
)
from scene_reader_worker.ai_client import (
    DEFAULT_AI_BASE_URL,
    DEFAULT_AI_MODEL,
    _extract_json_object,
    _get_api_key,
)
from scene_reader_worker.pipeline import generation_attempt_callback_payload, run_generation_attempt
from scene_reader_worker.processor import (
    candidate_callback_payload,
    formal_generation_eligible,
    process_chapter,
)
from scene_reader_worker.prompt import (
    CLASSIFICATION_SYSTEM_PROMPT,
    DISCOVERY_SYSTEM_PROMPT,
    build_scene_recognition_user_prompt,
)
from scene_reader_worker.types import (
    CandidateClassification,
    CandidateSeed,
    ClassifiedCandidate,
    GeneratedImageArtifact,
    ImageAuditResult,
    ImageAuditRuleResult,
    ImageGenerationRequest,
    RankedImageType,
    VisualEvidence,
)
from scene_reader_worker.validator import validate_ai_candidates
from scene_reader_worker.validator import validate_discovery_candidates


SAMPLE_PAYLOAD = {
    "taskId": "task-1",
    "bookId": "book-1",
    "chapterId": "chapter-1",
    "chapterTitle": "第一章",
    "blocks": [
        {"id": "p1", "type": "paragraph", "text": "夜里，街道上的风很冷，路灯把人影拉得很长。"},
        {"id": "p2", "type": "paragraph", "text": "她低头看着手机，没有再说话。"},
    ],
}


def result_candidate(source_id: str, image_type: str, confidence: float, position: int):
    from scene_reader_worker.types import SceneCandidate

    return SceneCandidate(
        id=f"chapter-1-{source_id}",
        chapterId="chapter-1",
        sourceBlockId=source_id,
        position=position,
        reason="test",
        sourceText="test",
        promptDraft="test",
        imageType=image_type,
        confidence=confidence,
    )


def classified_fixture(*, status: str = "eligible", confidence: float = 0.91) -> ClassifiedCandidate:
    evidence = (VisualEvidence(sourceBlockId="p1", sourceText="Rain crossed the old bridge."),)
    return ClassifiedCandidate(
        seed=CandidateSeed(
            id="chapter-1-p1",
            chapterId="chapter-1",
            sourceBlockId="p1",
            position=0,
            readingValue=0.93,
            reason="The bridge establishes the setting.",
            evidence=evidence,
        ),
        classification=CandidateClassification(
            primaryType="environment",
            rankedTypes=(
                RankedImageType("environment", confidence),
                RankedImageType("atmosphere", 0.74),
                RankedImageType("object", 0.31),
            ),
            evidence=evidence,
            reason="The bridge establishes the setting.",
            auxiliaryTags=("rain",),
            profileFactSuggestions=(),
            status=status,
            model="kimi-k3",
            promptVersion="kimi-classification-v1",
        ),
        provider="kimi",
    )


class ProcessorTest(unittest.TestCase):
    def test_eligible_formal_fixture_generates_once_audits_once_and_serializes_server_fields(self) -> None:
        classified = classified_fixture()
        with patch("scene_reader_worker.processor.classify_chapter", return_value=([classified], [])):
            processed = process_chapter(SAMPLE_PAYLOAD, provider="openai")

        request = ImageGenerationRequest(
            idempotencyKey="task-1:chapter-1-p1",
            candidateId=classified.seed.id,
            taskId="task-1",
            trigger="automatic",
            requestedType="environment",
            prompt="A rain-soaked bridge, landscape 3:2.",
            style="鍐欏疄",
            aspectRatio="3:2",
            contractVersion=classified.contractVersion,
        )
        generate = Mock(return_value=GeneratedImageArtifact(
            imageBase64="reader-artifact",
            mimeType="image/png",
            provider="glm",
            model="glm-image",
            width=1536,
            height=1024,
        ))
        audit = Mock(return_value=ImageAuditResult(
            verdict="publishable",
            rules=(ImageAuditRuleResult("environment-composition", True, "info", "Compliant."),),
            severeFactConflict=False,
            provider="vision",
            model="vision-model",
            auditVersion="audit-v1",
        ))

        attempt = run_generation_attempt(request, provider="glm", generate=generate, audit=audit)
        candidate_payload = candidate_callback_payload(processed)
        attempt_payload = generation_attempt_callback_payload(request, attempt)

        generate.assert_called_once_with(request)
        audit.assert_called_once()
        self.assertEqual(candidate_payload["candidates"][0]["classification"]["primaryType"], "environment")
        self.assertEqual(candidate_payload["candidates"][0]["classification"]["status"], "eligible")
        self.assertEqual(attempt_payload["idempotencyKey"], "task-1:chapter-1-p1")
        self.assertEqual(attempt_payload["requestedType"], "environment")
        self.assertEqual(attempt_payload["status"], "publishable")
        self.assertEqual(attempt_payload["audit"]["auditVersion"], "audit-v1")

    def test_below_threshold_formal_fixture_is_saved_for_debug_without_generation_attempt(self) -> None:
        classified = classified_fixture(status="below_threshold", confidence=0.649)
        with patch("scene_reader_worker.processor.classify_chapter", return_value=([classified], [])):
            processed = process_chapter(SAMPLE_PAYLOAD, provider="openai")

        callback = candidate_callback_payload(processed)

        self.assertEqual(processed.candidates, [])
        self.assertFalse(formal_generation_eligible(classified.classification, classified.provider))
        self.assertEqual(callback["candidates"][0]["classification"]["status"], "below_threshold")
        self.assertEqual(callback["candidates"][0]["classification"]["rankedTypes"][0]["confidence"], 0.649)

    def test_severe_audit_fixture_retains_artifact_but_serializes_blocked_status(self) -> None:
        request = ImageGenerationRequest(
            idempotencyKey="task-1:blocked",
            candidateId="chapter-1-p1",
            taskId="task-1",
            trigger="automatic",
            requestedType="environment",
            prompt="A rain-soaked bridge, landscape 3:2.",
            style="鍐欏疄",
            aspectRatio="3:2",
            contractVersion="composition-v1",
        )
        generate = Mock(return_value=GeneratedImageArtifact(
            imageBase64="blocked-artifact", mimeType="image/png", provider="glm",
            model="glm-image", width=1536, height=1024,
        ))
        audit = Mock(return_value=ImageAuditResult(
            verdict="blocked",
            rules=(ImageAuditRuleResult("fact", False, "severe", "Wrong landmark."),),
            severeFactConflict=True,
            provider="vision", model="vision-model", auditVersion="audit-v1",
        ))

        attempt = run_generation_attempt(request, provider="glm", generate=generate, audit=audit)
        callback = generation_attempt_callback_payload(request, attempt)

        generate.assert_called_once()
        audit.assert_called_once()
        self.assertEqual(callback["status"], "blocked")
        self.assertEqual(callback["imageBase64"], "blocked-artifact")
        self.assertTrue(callback["audit"]["severeFactConflict"])

    def test_scene_recognition_defaults_to_kimi_k3(self) -> None:
        self.assertEqual(DEFAULT_AI_BASE_URL, "https://api.kimi.com/coding")
        self.assertEqual(DEFAULT_AI_MODEL, "kimi-k3")

    def test_kimi_endpoint_only_uses_kimi_credentials(self) -> None:
        with patch.dict(
            "os.environ",
            {"KIMI_API_KEY": "kimi-key", "GLM_API_KEY": "glm-key"},
            clear=True,
        ):
            self.assertEqual(_get_api_key(DEFAULT_AI_BASE_URL), "kimi-key")

    def test_kimi_json_parser_ignores_content_after_first_complete_object(self) -> None:
        response = """```json
{"candidates": [{"sourceBlockId": "p1"}]}
```
{"explanation": "additional model output"}
"""

        parsed = _extract_json_object(response)

        self.assertEqual(parsed, {"candidates": [{"sourceBlockId": "p1"}]})

    def test_kimi_json_parser_wraps_top_level_candidate_array(self) -> None:
        response = """```json
[
  {"sourceBlockId": "p1", "readingValue": 0.91},
  {"sourceBlockId": "p7", "readingValue": 0.84}
]
```"""

        parsed = _extract_json_object(response)

        self.assertEqual(
            parsed,
            {
                "candidates": [
                    {"sourceBlockId": "p1", "readingValue": 0.91},
                    {"sourceBlockId": "p7", "readingValue": 0.84},
                ]
            },
        )

    def test_discovery_validator_normalizes_kimi_qualitative_candidate_fields(self) -> None:
        candidates, logs = validate_discovery_candidates(
            SAMPLE_PAYLOAD,
            [
                {
                    "sourceBlockId": "p1",
                    "readingValue": "高",
                    "evidence": "夜里，街道上的风很冷。",
                    "reason": "建立夜间街道环境。",
                }
            ],
        )

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].readingValue, 0.9)
        self.assertEqual(candidates[0].evidence[0].sourceBlockId, "p1")
        self.assertEqual(candidates[0].evidence[0].sourceText, "夜里，街道上的风很冷。")
        self.assertEqual(logs[-1].data, {"count": 1})

    def test_process_chapter_outputs_scene_candidates_with_heuristic_provider(self) -> None:
        result = process_chapter(SAMPLE_PAYLOAD, provider="heuristic")

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.provider, "heuristic")
        self.assertEqual(result.candidates[0].chapterId, "chapter-1")
        self.assertEqual(result.candidates[0].sourceBlockId, "p1")
        self.assertGreater(result.candidates[0].confidence, 0)
        self.assertTrue(result.candidates[0].promptDraft)
        self.assertIn(result.candidates[0].imageType, {"scene", "character", "object"})
        self.assertTrue(result.logs)

    def test_build_scene_recognition_prompt_includes_block_ids(self) -> None:
        prompt = build_scene_recognition_user_prompt(SAMPLE_PAYLOAD)

        self.assertIn("chapter-1", prompt)
        self.assertIn("id=p1", prompt)
        self.assertIn("街道上的风很冷", prompt)

    def test_kimi_prompts_define_strict_json_field_shapes(self) -> None:
        self.assertIn('"readingValue":0.0', DISCOVERY_SYSTEM_PROMPT)
        self.assertIn('"evidence":[', DISCOVERY_SYSTEM_PROMPT)
        self.assertIn('"rankedTypes":[', CLASSIFICATION_SYSTEM_PROMPT)
        self.assertIn('exactly three', CLASSIFICATION_SYSTEM_PROMPT)

    def test_validate_ai_candidates_rejects_unknown_source_block(self) -> None:
        candidates, logs = validate_ai_candidates(
            SAMPLE_PAYLOAD,
            [
                {
                    "sourceBlockId": "missing",
                    "position": 99,
                    "reason": "地点变化",
                    "sourceText": "不存在",
                    "promptDraft": "不存在",
                    "confidence": 0.9,
                },
                {
                    "sourceBlockId": "p1",
                    "position": 0,
                    "locationChange": "街道夜景",
                    "reason": "环境明确",
                    "sourceText": "夜里，街道上的风很冷",
                    "promptDraft": "克制写实的街道夜景阅读插图",
                    "confidence": 0.8,
                },
            ],
        )

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].sourceBlockId, "p1")
        self.assertTrue(any(log.level == "warning" for log in logs))

    def test_generate_images_for_candidates_outputs_base64_image(self) -> None:
        result = process_chapter(SAMPLE_PAYLOAD, provider="heuristic")

        images = generate_images_for_candidates(result.candidates, provider="mock-svg", max_images=1)

        self.assertEqual(len(images), 1)
        self.assertEqual(images[0].chapterId, "chapter-1")
        self.assertEqual(images[0].mimeType, "image/svg+xml")
        self.assertTrue(images[0].imageBase64)
        self.assertEqual(images[0].imageType, result.candidates[0].imageType)

    def test_target_image_count_uses_paragraph_count(self) -> None:
        self.assertEqual(target_image_count_for_paragraphs(5, max_images=3), 1)
        self.assertEqual(target_image_count_for_paragraphs(20, max_images=3), 2)
        self.assertEqual(target_image_count_for_paragraphs(51, max_images=3), 3)
        self.assertEqual(target_image_count_for_paragraphs(51, max_images=2), 2)

    def test_generate_images_with_glm_provider_downloads_returned_image_url(self) -> None:
        result = process_chapter(SAMPLE_PAYLOAD, provider="heuristic")

        class FakeResponse:
            def __init__(self, body: bytes, content_type: str) -> None:
                self.body = body
                self.headers = {"Content-Type": content_type}

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

            def read(self) -> bytes:
                return self.body

        def fake_urlopen(request, timeout=0):
            url = request.full_url if hasattr(request, "full_url") else request
            if "images/generations" in url:
                return FakeResponse(b'{"data":[{"url":"https://example.com/generated.png"}]}', "application/json")
            png_header = (
                b"\x89PNG\r\n\x1a\n"
                b"\x00\x00\x00\rIHDR"
                + (900).to_bytes(4, "big")
                + (600).to_bytes(4, "big")
            )
            return FakeResponse(png_header, "image/png")

        with patch.dict("os.environ", {"GLM_API_KEY": "test-key"}, clear=False):
            with patch("urllib.request.urlopen", side_effect=fake_urlopen):
                images = generate_images_for_candidates(result.candidates, provider="glm", max_images=1)

        self.assertEqual(len(images), 1)
        self.assertEqual(images[0].mimeType, "image/png")
        self.assertTrue(images[0].imageBase64)


if __name__ == "__main__":
    unittest.main()
