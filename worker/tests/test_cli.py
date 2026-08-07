import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scene_reader_worker.cli import _post_attempt_to_api, _post_to_api, main
from scene_reader_worker.pipeline import GenerationAttempt
from scene_reader_worker.processor import ClassifiedCandidate
from scene_reader_worker.types import (
    BookVisualProfile,
    CandidateClassification,
    CandidateSeed,
    GeneratedImageArtifact,
    ImageAuditResult,
    ImageAuditRuleResult,
    RankedImageType,
    SceneCandidate,
    VisualEvidence,
    VisualProfileFact,
    WorkerLog,
    WorkerResult,
)


PAYLOAD = {
    "taskId": "task-1",
    "bookId": "book-1",
    "chapterId": "chapter-1",
    "chapterTitle": "Test chapter",
    "blocks": [{"id": "p1", "type": "paragraph", "text": "Rain crossed the bridge."}],
}


class FakeResponse:
    def __init__(self, body: bytes = b'{"data":{}}') -> None:
        self.body = body
        self.headers = {"Content-Type": "application/json"}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def formal_worker_result() -> WorkerResult:
    evidence = (VisualEvidence("p1", "Rain crossed the bridge."),)
    suggestion = VisualProfileFact(
        "weather",
        "steady rain",
        "p1",
        "Rain crossed the bridge.",
        "stable",
    )
    classification = CandidateClassification(
        primaryType="environment",
        rankedTypes=(
            RankedImageType("environment", 0.91),
            RankedImageType("atmosphere", 0.72),
            RankedImageType("object", 0.43),
        ),
        evidence=evidence,
        reason="The bridge establishes the setting.",
        auxiliaryTags=("rain", "clue"),
        profileFactSuggestions=(suggestion,),
        status="eligible",
        model="kimi-k3",
        promptVersion="kimi-classification-v1",
    )
    classified = ClassifiedCandidate(
        seed=CandidateSeed(
            id="candidate-1",
            chapterId="chapter-1",
            sourceBlockId="p1",
            position=0,
            readingValue=0.87,
            reason="This helps orient the reader.",
            evidence=evidence,
        ),
        classification=classification,
        provider="kimi",
    )
    profile = BookVisualProfile(
        id="profile-1",
        bookId="book-1",
        entityType="character",
        entityKey="Lin",
        stableFacts=(
            VisualProfileFact(
                "coat",
                "dark wool",
                "p1",
                "Lin wore a dark wool coat.",
                "stable",
            ),
        ),
        flexibleFacts=(),
    )
    return WorkerResult(
        taskId="task-1",
        bookId="book-1",
        chapterId="chapter-1",
        status="completed",
        candidates=[
            SceneCandidate(
                "candidate-1",
                "chapter-1",
                "p1",
                0,
                classification.reason,
                evidence[0].sourceText,
                "",
                "environment",
                confidence=0.91,
            )
        ],
        provider="openai",
        logs=[],
        classifiedCandidates=(classified,),
        profiles=(profile,),
    )


class CliFormalGenerationTest(unittest.TestCase):
    def test_fetched_chapter_profiles_are_passed_to_classification(self) -> None:
        payload = {
            **PAYLOAD,
            "profiles": [{
                "id": "profile-1",
                "bookId": "book-1",
                "entityType": "character",
                "entityKey": "Lin",
                "stableFacts": [{
                    "field": "coat", "value": "dark wool", "sourceBlockId": "p1",
                    "sourceText": "Lin wore a dark wool coat.", "stability": "stable",
                }],
                "flexibleFacts": [],
                "version": "profile-v1",
            }],
        }
        processed = formal_worker_result()
        with patch("scene_reader_worker.cli._fetch_task_payload", return_value=payload), patch(
            "scene_reader_worker.cli._patch_task"
        ), patch("scene_reader_worker.cli.process_chapter", return_value=processed) as process_chapter_mock, patch(
            "scene_reader_worker.cli._post_to_api"
        ), patch.object(
            sys,
            "argv",
            ["scene-reader-worker", "--task-id", "task-1", "--api-url", "http://api.example"],
        ), patch("builtins.print"):
            self.assertEqual(main(), 0)

        profiles = process_chapter_mock.call_args.kwargs["profiles"]
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0].entityKey, "Lin")
        self.assertEqual(profiles[0].stableFacts[0].value, "dark wool")

    def test_manual_task_reuses_single_attempt_pipeline_without_classification_retry(self) -> None:
        audit = ImageAuditResult(
            "publishable",
            (ImageAuditRuleResult("type", True, "info", "ok"),),
            False,
            "vision",
            "vision-v2",
            "audit-v3",
        )
        result = GenerationAttempt(
            "publishable",
            GeneratedImageArtifact("manual-image", "image/png", "glm", "glm-image-test", 768, 512),
            audit,
        )
        payload = {
            **PAYLOAD,
            "profiles": [],
            "manualGeneration": {
                "kind": "generate",
                "idempotencyKey": "manual-key-1",
                "candidateId": "candidate-1",
                "attemptId": "attempt-manual-1",
                "parentAttemptId": "attempt-auto-1",
                "requestedType": "interaction",
                "evidence": [{"sourceBlockId": "p1", "sourceText": "Rain crossed the bridge."}],
                "auxiliaryTags": ["rain"],
                "contractVersion": "composition-v1",
            },
        }
        requests = []
        callbacks = []

        with patch("scene_reader_worker.cli._fetch_task_payload", return_value=payload), patch(
            "scene_reader_worker.cli._patch_task"
        ), patch("scene_reader_worker.cli.process_chapter") as process_chapter_mock, patch(
            "scene_reader_worker.cli.run_generation_attempt",
            side_effect=lambda request, **kwargs: requests.append(request) or result,
        ), patch("scene_reader_worker.cli._post_to_api") as candidate_callback, patch(
            "scene_reader_worker.cli._post_attempt_to_api",
            side_effect=lambda api_url, callback: callbacks.append(callback),
        ), patch.object(
            sys,
            "argv",
            [
                "scene-reader-worker",
                "--task-id",
                "task-manual-1",
                "--api-url",
                "http://api.example",
                "--image-provider",
                "glm",
            ],
        ), patch("builtins.print"):
            self.assertEqual(main(), 0)

        process_chapter_mock.assert_not_called()
        candidate_callback.assert_not_called()
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].idempotencyKey, "manual-key-1")
        self.assertEqual(requests[0].trigger, "manual")
        self.assertEqual(requests[0].requestedType, "interaction")
        self.assertEqual(callbacks[0]["idempotencyKey"], "manual-key-1")
        self.assertEqual(callbacks[0]["parentAttemptId"], "attempt-auto-1")

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
            with patch(
                "scene_reader_worker.cli.process_chapter", return_value=heuristic_result
            ), patch(
                "scene_reader_worker.cli.run_generation_attempt"
            ) as run_attempt, patch(
                "scene_reader_worker.cli.generate_formal_image"
            ) as generate_image, patch.object(
                sys,
                "argv",
                [
                    "scene-reader-worker",
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                    "--generate-images",
                ],
            ):
                self.assertEqual(main(), 0)

            run_attempt.assert_not_called()
            generate_image.assert_not_called()
            output = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(output["provider"], "heuristic")
            self.assertEqual(output["candidates"][0]["id"], "candidate-1")
            self.assertEqual(
                output["generationSkipped"],
                "heuristic classifications are debug-only and cannot generate formal images",
            )
            self.assertNotIn("attempts", output)

    def test_formal_cli_constructs_deterministic_request_and_exact_callback_payloads(self) -> None:
        processed = formal_worker_result()
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
            GeneratedImageArtifact(
                "image-data", "image/png", "glm", "glm-image-test", 768, 512
            ),
            audit,
        )
        requests = []
        candidate_callbacks = []
        attempt_callbacks = []

        def run_attempt(request, **kwargs):
            requests.append(request)
            return attempt

        expected_prompt = "\n".join(
            (
                "contract=environment;version=composition-v1;aspect=3:2",
                "subject-count=zero to two incidental figures;shot-scale=wide;subject-ratio=environment dominant",
                "camera=landscape 3:2 | eye-level or elevated establishing view",
                "composition=readable space | clear depth layers | setting leads the frame",
                "profile-snapshot=character:Lin;stable=[coat=dark wool];flexible=[];version=profile-v1",
                "evidence=p1:Rain crossed the bridge.",
                "chapter-facts=",
                "style=写实",
                "auxiliary-tags=rain | clue",
                "exclusions=crowded character lineup | text | watermark | comic panels | distorted anatomy | advertising layout",
            )
        )
        expected_candidate_callback = {
            "taskId": "task-1",
            "bookId": "book-1",
            "chapterId": "chapter-1",
            "candidates": [
                {
                    "id": "candidate-1",
                    "sourceBlockId": "p1",
                    "position": 0,
                    "readingValue": 0.87,
                    "classification": {
                        "primaryType": "environment",
                        "rankedTypes": [
                            {"imageType": "environment", "confidence": 0.91},
                            {"imageType": "atmosphere", "confidence": 0.72},
                            {"imageType": "object", "confidence": 0.43},
                        ],
                        "evidence": [
                            {
                                "sourceBlockId": "p1",
                                "sourceText": "Rain crossed the bridge.",
                            }
                        ],
                        "reason": "The bridge establishes the setting.",
                        "auxiliaryTags": ["rain", "clue"],
                        "status": "eligible",
                        "model": "kimi-k3",
                        "promptVersion": "kimi-classification-v1",
                    },
                    "contractVersion": "composition-v1",
                    "profileVersion": "profile-v1",
                }
            ],
            "profileFactSuggestions": [
                {
                    "field": "weather",
                    "value": "steady rain",
                    "sourceBlockId": "p1",
                    "sourceText": "Rain crossed the bridge.",
                    "stability": "stable",
                }
            ],
        }
        expected_attempt_callback = {
            "idempotencyKey": "task-1:candidate-1",
            "candidateId": "candidate-1",
            "taskId": "task-1",
            "trigger": "automatic",
            "requestedType": "environment",
            "prompt": expected_prompt,
            "status": "publishable",
            "provider": "glm",
            "model": "glm-image-test",
            "width": 768,
            "height": 512,
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
        }

        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "output.json"
            input_path.write_text(json.dumps(PAYLOAD), encoding="utf-8")
            with patch(
                "scene_reader_worker.cli.process_chapter", return_value=processed
            ), patch(
                "scene_reader_worker.cli.run_generation_attempt", side_effect=run_attempt
            ), patch(
                "scene_reader_worker.cli._post_to_api",
                side_effect=lambda api_url, payload: candidate_callbacks.append(payload),
            ), patch(
                "scene_reader_worker.cli._post_attempt_to_api",
                side_effect=lambda api_url, payload: attempt_callbacks.append(payload),
            ), patch.object(
                sys,
                "argv",
                [
                    "scene-reader-worker",
                    "--input",
                    str(input_path),
                    "--api-url",
                    "http://api.example",
                    "--output",
                    str(output_path),
                    "--generate-images",
                    "--image-provider",
                    "glm",
                ],
            ):
                self.assertEqual(main(), 0)

        self.assertEqual(len(requests), 1)
        request = requests[0]
        self.assertEqual(request.idempotencyKey, "task-1:candidate-1")
        self.assertEqual(request.candidateId, "candidate-1")
        self.assertEqual(request.taskId, "task-1")
        self.assertEqual(request.trigger, "automatic")
        self.assertEqual(request.requestedType, "environment")
        self.assertEqual(request.style, "写实")
        self.assertEqual(request.aspectRatio, "3:2")
        self.assertEqual(request.contractVersion, "composition-v1")
        self.assertEqual(request.prompt, expected_prompt)
        self.assertEqual(candidate_callbacks, [expected_candidate_callback])
        self.assertEqual(attempt_callbacks, [expected_attempt_callback])

    def test_callback_transports_use_only_approved_urls_post_methods_and_json(self) -> None:
        candidate_payload = {
            "taskId": "task-1",
            "bookId": "book-1",
            "chapterId": "chapter-1",
            "candidates": [],
            "profileFactSuggestions": [],
        }
        attempt_payload = {
            "idempotencyKey": "key-1",
            "candidateId": "candidate-1",
            "taskId": "task-1",
            "trigger": "automatic",
            "requestedType": "environment",
            "prompt": "prompt",
            "status": "generation_failed",
        }
        captured = []

        def urlopen(request, timeout=0):
            captured.append((request, timeout))
            return FakeResponse()

        with patch(
            "scene_reader_worker.cli.urllib.request.urlopen", side_effect=urlopen
        ):
            _post_to_api("http://api.example/", candidate_payload)
            _post_attempt_to_api("http://api.example/", attempt_payload)

        self.assertEqual(
            [request.full_url for request, timeout in captured],
            [
                "http://api.example/worker/scene-candidates",
                "http://api.example/worker/image-generation-attempts",
            ],
        )
        self.assertEqual([request.get_method() for request, timeout in captured], ["POST", "POST"])
        self.assertEqual(
            [json.loads(request.data.decode("utf-8")) for request, timeout in captured],
            [candidate_payload, attempt_payload],
        )
        self.assertTrue(all("/worker/scene-images" not in request.full_url for request, timeout in captured))


if __name__ == "__main__":
    unittest.main()
