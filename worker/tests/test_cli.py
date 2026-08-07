import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scene_reader_worker.cli import main
from scene_reader_worker.types import SceneCandidate, WorkerLog, WorkerResult
from scene_reader_worker.pipeline import GenerationAttempt
from scene_reader_worker.types import GeneratedImageArtifact, ImageAuditResult, ImageAuditRuleResult


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

    def test_formal_cli_serializes_and_posts_one_attempt_without_scene_image_callback(self) -> None:
        result=WorkerResult("task-1","book-1","chapter-1","completed",[SceneCandidate("c","chapter-1","p1",0,"reason","text","prompt","environment",confidence=.9)],"openai",[])
        attempt=GenerationAttempt("publishable",GeneratedImageArtifact("bytes","image/png","mock-svg","mock-svg",1536,1024),ImageAuditResult("publishable",(ImageAuditRuleResult("type",True,"info","ok"),),False,"vision","v","1"))
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"in.json"; path.write_text(json.dumps(PAYLOAD)); posted=[]
            with patch("scene_reader_worker.cli.process_chapter",return_value=result),patch("scene_reader_worker.cli.run_generation_attempt",return_value=attempt),patch("scene_reader_worker.cli._post_to_api"),patch("scene_reader_worker.cli._request_json",side_effect=lambda url,method="GET",payload=None: posted.append((url,payload))),patch("scene_reader_worker.cli._post_scene_image_to_api") as old,patch.object(sys,"argv",["x","--input",str(path),"--api-url","http://api","--generate-images","--image-provider","mock-svg"]):
                self.assertEqual(main(),0)
            self.assertEqual(len(posted),1); self.assertIn("/worker/image-generation-attempts",posted[0][0]); self.assertEqual(posted[0][1]["status"],"publishable"); old.assert_not_called()


if __name__ == "__main__":
    unittest.main()
