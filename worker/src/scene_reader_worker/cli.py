from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .audit import audit_image
from .composition import build_generation_prompt, get_composition_contract
from .image_generator import generate_formal_image, target_image_count_for_paragraphs
from .pipeline import generation_attempt_callback_payload, run_generation_attempt
from .processor import (
    candidate_callback_payload,
    formal_generation_eligible,
    process_chapter,
    result_to_dict,
)
from .types import ChapterPayload, ImageGenerationRequest


def _read_json(path: Path) -> ChapterPayload:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _request_json(url: str, method: str = "GET", payload: object | None = None) -> Any:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method=method,
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _fetch_task_payload(api_url: str, task_id: str) -> ChapterPayload:
    encoded_task_id = urllib.parse.quote(task_id, safe="")
    url = f"{api_url.rstrip('/')}/worker/tasks/{encoded_task_id}/chapter-payload"
    return _request_json(url)["data"]


def _patch_task(api_url: str, task_id: str, payload: object) -> None:
    encoded_task_id = urllib.parse.quote(task_id, safe="")
    url = f"{api_url.rstrip('/')}/worker/tasks/{encoded_task_id}"
    _request_json(url, method="PATCH", payload=payload)


def _post_to_api(api_url: str, payload: object) -> None:
    url = f"{api_url.rstrip('/')}/worker/scene-candidates"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        response.read()


def _post_attempt_to_api(api_url: str, payload: object) -> None:
    _request_json(f"{api_url.rstrip('/')}/worker/image-generation-attempts", method="POST", payload=payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="Process one SceneReader chapter payload.")
    parser.add_argument("--input", help="Path to chapter input JSON.")
    parser.add_argument("--task-id", help="Generation task id to load from the API.")
    parser.add_argument("--output", help="Optional path to write worker result JSON.")
    parser.add_argument("--api-url", help="Optional API base URL for result callback.")
    parser.add_argument("--generate-images", action="store_true", help="Generate scene images for selected candidates.")
    parser.add_argument("--image-provider", help="Image provider: pollinations, glm, or mock-svg.")
    parser.add_argument("--max-images", type=int, default=3, help="Maximum scene images to generate.")
    parser.add_argument(
        "--provider",
        choices=["auto", "openai", "heuristic"],
        default="auto",
        help="Scene recognition provider. auto uses configured OpenAI-compatible AI, otherwise heuristic fallback.",
    )
    args = parser.parse_args()
    started_at = time.perf_counter()

    if args.task_id and not args.api_url:
        parser.error("--task-id requires --api-url")
    if not args.input and not args.task_id:
        parser.error("Either --input or --task-id is required")

    try:
        payload = _fetch_task_payload(args.api_url, args.task_id) if args.task_id else _read_json(Path(args.input))
        if args.task_id:
            _patch_task(
                args.api_url,
                args.task_id,
                {"status": "recognizing", "progress": 20, "label": "正在识别章节视觉锚点"},
            )

        processed = process_chapter(payload, provider=args.provider)
        result = result_to_dict(processed)

        if args.generate_images and processed.provider != "heuristic":
            target_images = target_image_count_for_paragraphs(len(payload["blocks"]), max_images=args.max_images)
            if args.task_id:
                _patch_task(
                    args.api_url,
                    args.task_id,
                    {"status": "generating", "progress": 60, "label": f"正在生成 {target_images} 张阅读辅助图"},
                )
            image_provider = args.image_provider or "glm"
            attempts = []
            eligible_candidates = [
                candidate
                for candidate in processed.classifiedCandidates
                if formal_generation_eligible(
                    candidate.classification, candidate.provider
                )
            ]
            for candidate in eligible_candidates[:target_images]:
                classification = candidate.classification
                contract = get_composition_contract(classification.primaryType)
                if contract.version != candidate.contractVersion:
                    raise RuntimeError(
                        "Classified candidate contract version does not match the prompt registry."
                    )
                if any(
                    profile.version != candidate.profileVersion
                    for profile in processed.profiles
                ):
                    raise RuntimeError(
                        "Classified candidate profile version does not match the prompt snapshot."
                    )
                prompt = build_generation_prompt(
                    image_type=classification.primaryType,
                    evidence=classification.evidence,
                    profiles=processed.profiles,
                    style="写实",
                    auxiliary_tags=classification.auxiliaryTags,
                )
                request = ImageGenerationRequest(
                    idempotencyKey=f"{payload['taskId']}:{candidate.seed.id}",
                    candidateId=candidate.seed.id,
                    taskId=payload["taskId"],
                    trigger="automatic",
                    requestedType=classification.primaryType,
                    prompt=prompt,
                    style="写实",
                    aspectRatio="3:2",
                    contractVersion=candidate.contractVersion,
                )
                attempt = run_generation_attempt(
                    request,
                    provider=image_provider,
                    generate=lambda formal_request: generate_formal_image(
                        formal_request, image_provider
                    ),
                    audit=audit_image,
                )
                attempts.append(
                    generation_attempt_callback_payload(request, attempt)
                )
            result["attempts"] = attempts
        elif args.generate_images:
            result["generationSkipped"] = "heuristic classifications are debug-only and cannot generate formal images"

        if args.output:
            _write_json(Path(args.output), result)

        if args.api_url:
            _post_to_api(args.api_url, candidate_callback_payload(processed))
            for attempt in result.get("attempts", []):
                _post_attempt_to_api(args.api_url, attempt)
            if args.task_id:
                _patch_task(
                    args.api_url,
                    args.task_id,
                    {
                        "status": "completed",
                        "progress": 100,
                        "label": "阅读辅助图已生成",
                        "provider": processed.provider,
                        "durationMs": int((time.perf_counter() - started_at) * 1000),
                    },
                )

        if not args.output:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as error:
        if args.task_id and args.api_url:
            _patch_task(
                args.api_url,
                args.task_id,
                {
                    "status": "failed",
                    "progress": 0,
                    "label": "阅读辅助图生成失败",
                    "errorMessage": str(error),
                    "provider": args.provider,
                    "durationMs": int((time.perf_counter() - started_at) * 1000),
                },
            )
        raise

    return 0
