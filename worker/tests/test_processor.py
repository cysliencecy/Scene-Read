import unittest
from unittest.mock import patch

from scene_reader_worker.image_generator import (
    generate_images_for_candidates,
    target_image_count_for_paragraphs,
)
from scene_reader_worker.ai_client import (
    DEFAULT_AI_BASE_URL,
    DEFAULT_AI_MODEL,
    _get_api_key,
)
from scene_reader_worker.processor import process_chapter
from scene_reader_worker.prompt import build_scene_recognition_user_prompt
from scene_reader_worker.validator import validate_ai_candidates


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


class ProcessorTest(unittest.TestCase):
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
