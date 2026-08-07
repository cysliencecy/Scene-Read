import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scene_reader_worker.cli import main
from scene_reader_worker.types import SceneCandidate, WorkerLog, WorkerResult


PAYLOAD = {
    "taskId": "task-1",
    "bookId": "book-1",
    "chapterId": "chapter-1",
    "chapterTitle": "Test chapter",
    "blocks": [{"id": "p1", "type": "paragraph", "text": "A visible scene."}],
}


class CliFormalGenerationTest(unittest.TestCase):
    def test_generate_images_flag_keeps_heuristic_candidates_debug_visible_without_generating(self) -> None:
        heuristic_result = WorkerResult(
            taskId="task-1",
            bookId="book-1",
            chapterId="chapter-1",
            status="completed",
            candidates=[
                SceneCandidate(
                    id="candidate-1",
                    chapterId="chapter-1",
                    sourceBlockId="p1",
                    position=0,
                    reason="debug anchor",
                    sourceText="A visible scene.",
                    promptDraft="debug only",
                    imageType="scene",
                    confidence=0.8,
                )
            ],
            provider="heuristic",
            logs=[WorkerLog(level="info", message="heuristic candidate")],
        )
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "output.json"
            input_path.write_text(json.dumps(PAYLOAD), encoding="utf-8")
            with patch("scene_reader_worker.cli.process_chapter", return_value=heuristic_result), patch(
                "scene_reader_worker.cli.generate_images_for_candidates"
            ) as generate_images, patch.object(
                sys,
                "argv",
                ["scene-reader-worker", "--input", str(input_path), "--output", str(output_path), "--generate-images"],
            ):
                self.assertEqual(main(), 0)

            generate_images.assert_not_called()
            output = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(output["provider"], "heuristic")
            self.assertEqual(output["candidates"][0]["id"], "candidate-1")
            self.assertNotIn("generatedImages", output)


if __name__ == "__main__":
    unittest.main()
