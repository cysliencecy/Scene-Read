from __future__ import annotations

import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from typing import Any

from .prompt import (
    CLASSIFICATION_SYSTEM_PROMPT,
    DISCOVERY_SYSTEM_PROMPT,
    ClassificationContext,
    build_classification_user_prompt,
    build_discovery_user_prompt,
)
from .types import BookVisualProfile, CandidateSeed, ChapterPayload, WorkerLog


DEFAULT_AI_BASE_URL = "https://api.kimi.com/coding"
DEFAULT_AI_MODEL = "kimi-k3"


class AiSceneRecognitionError(RuntimeError):
    pass


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`").removeprefix("json").strip()
    object_start = stripped.find("{")
    array_start = stripped.find("[")
    starts = [start for start in (object_start, array_start) if start >= 0]
    if not starts:
        raise AiSceneRecognitionError("AI response did not contain a JSON object or array.")
    start = min(starts)
    try:
        parsed, _ = json.JSONDecoder().raw_decode(stripped[start:])
    except json.JSONDecodeError as error:
        raise AiSceneRecognitionError("AI response did not contain valid JSON.") from error
    if isinstance(parsed, list):
        return {"candidates": parsed}
    if not isinstance(parsed, dict):
        raise AiSceneRecognitionError("AI response JSON root was not an object.")
    return parsed


def _get_api_key(base_url: str) -> str | None:
    _load_local_env()
    if "api.kimi.com" in base_url:
        return os.getenv("KIMI_API_KEY") or os.getenv("MOONSHOT_API_KEY")
    return os.getenv("GLM_API_KEY") or os.getenv("ZHIPU_API_KEY") or os.getenv("BIGMODEL_API_KEY") or os.getenv("OPENAI_API_KEY")


def _is_anthropic_compatible(base_url: str) -> bool:
    return os.getenv("AI_PROVIDER", "").lower() == "anthropic" or "api.kimi.com/coding" in base_url


def _read_json_response(request: urllib.request.Request, timeout: int, provider: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise AiSceneRecognitionError(f"{provider} request failed: {error.code} {detail}") from error
    except urllib.error.URLError as error:
        raise AiSceneRecognitionError(f"{provider} request failed: {error.reason}") from error
    except TimeoutError as error:
        raise AiSceneRecognitionError(f"{provider} request timed out.") from error
    if not isinstance(body, dict):
        raise AiSceneRecognitionError(f"{provider} response root was not an object.")
    return body


def _request_anthropic_json(system_prompt: str, user_prompt: str, api_key: str, base_url: str, model: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/v1/messages",
        data=json.dumps(
            {"model": model, "max_tokens": 2048, "temperature": 0.2, "system": system_prompt,
             "messages": [{"role": "user", "content": user_prompt}]},
            ensure_ascii=False,
        ).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
        method="POST",
    )
    response_body = _read_json_response(request, 90, "Anthropic")
    content = response_body.get("content", [])
    texts = [str(block.get("text", "")) for block in content if isinstance(block, dict) and block.get("type") == "text"] if isinstance(content, list) else []
    if not texts:
        raise AiSceneRecognitionError("Anthropic response did not contain text content.")
    return _extract_json_object("\n".join(texts))


def _request_openai_json(system_prompt: str, user_prompt: str, api_key: str, base_url: str, model: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(
            {"model": model, "temperature": 0.2, "max_tokens": 2048, "response_format": {"type": "json_object"},
             "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]},
            ensure_ascii=False,
        ).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    response_body = _read_json_response(request, 60, "OpenAI")
    try:
        content = response_body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise AiSceneRecognitionError("OpenAI response did not contain choices[0].message.content.") from error
    return _extract_json_object(str(content))


def _request_json(system_prompt: str, user_prompt: str, stage: str) -> tuple[dict[str, Any], list[WorkerLog]]:
    _load_local_env()
    base_url = os.getenv("AI_BASE_URL", DEFAULT_AI_BASE_URL).rstrip("/")
    api_key = _get_api_key(base_url)
    if not api_key:
        key_name = "KIMI_API_KEY" if "api.kimi.com" in base_url else "AI provider API key"
        raise AiSceneRecognitionError(f"{key_name} is not configured.")
    model = os.getenv("AI_MODEL") or os.getenv("OPENAI_MODEL") or DEFAULT_AI_MODEL
    if _is_anthropic_compatible(base_url):
        parsed = _request_anthropic_json(system_prompt, user_prompt, api_key, base_url, model)
        provider = "anthropic-compatible"
    else:
        parsed = _request_openai_json(system_prompt, user_prompt, api_key, base_url, model)
        provider = "openai-compatible"
    return parsed, [WorkerLog(level="info", message=f"AI {stage} completed.", data={"provider": provider, "baseUrl": base_url, "model": model})]


def discover_candidates_with_openai(payload: ChapterPayload) -> tuple[list[dict[str, Any]], list[WorkerLog]]:
    parsed, logs = _request_json(DISCOVERY_SYSTEM_PROMPT, build_discovery_user_prompt(payload), "candidate discovery")
    candidates = parsed.get("candidates", [])
    if not isinstance(candidates, list):
        raise AiSceneRecognitionError("AI discovery response candidates field was not a list.")
    return candidates, logs


def classify_candidate_with_openai(
    context: ClassificationContext,
) -> tuple[dict[str, Any], list[WorkerLog]]:
    return _request_json(CLASSIFICATION_SYSTEM_PROMPT, build_classification_user_prompt(context), "candidate classification")


def recognize_scenes_with_openai(payload: ChapterPayload) -> tuple[list[dict[str, Any]], list[WorkerLog]]:
    """Backward-compatible discovery entry point for callers not yet migrated to Batch 2."""
    return discover_candidates_with_openai(payload)
