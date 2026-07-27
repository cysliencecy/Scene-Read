import unittest
from unittest.mock import patch

from scene_reader_worker.image_generator import generate_images_for_candidates
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


class ProcessorTest(unittest.TestCase):
    def test_process_chapter_outputs_scene_candidates_with_heuristic_provider(self) -> None:
        result = process_chapter(SAMPLE_PAYLOAD, provider="heuristic")

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.provider, "heuristic")
        self.assertEqual(result.candidates[0].chapterId, "chapter-1")
        self.assertEqual(result.candidates[0].sourceBlockId, "p1")
        self.assertGreater(result.candidates[0].confidence, 0)
        self.assertTrue(result.candidates[0].promptDraft)
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
            return FakeResponse(b"png-bytes", "image/png")

        with patch.dict("os.environ", {"GLM_API_KEY": "test-key"}, clear=False):
            with patch("urllib.request.urlopen", side_effect=fake_urlopen):
                images = generate_images_for_candidates(result.candidates, provider="glm", max_images=1)

        self.assertEqual(len(images), 1)
        self.assertEqual(images[0].mimeType, "image/png")
        self.assertTrue(images[0].imageBase64)


if __name__ == "__main__":
    unittest.main()
