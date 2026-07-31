from __future__ import annotations

import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from typing import Any

from .prompt import SCENE_RECOGNITION_SYSTEM_PROMPT, build_scene_recognition_user_prompt
from .types import ChapterPayload, WorkerLog


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
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        stripped = stripped.removeprefix("json").strip()

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end < start:
        raise AiSceneRecognitionError("AI response did not contain a JSON object.")

    parsed = json.loads(stripped[start : end + 1])
    if not isinstance(parsed, dict):
        raise AiSceneRecognitionError("AI response JSON root was not an object.")
    return parsed


def _get_api_key(base_url: str) -> str | None:
    _load_local_env()
    if "api.kimi.com" in base_url:
        return os.getenv("KIMI_API_KEY") or os.getenv("MOONSHOT_API_KEY")

    return (
        os.getenv("GLM_API_KEY")
        or os.getenv("ZHIPU_API_KEY")
        or os.getenv("BIGMODEL_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )


def _is_anthropic_compatible(base_url: str) -> bool:
    provider = os.getenv("AI_PROVIDER", "").lower()
    return provider == "anthropic" or "api.kimi.com/coding" in base_url


def _extract_anthropic_text(response_body: dict[str, Any]) -> str:
    content = response_body.get("content", [])
    if not isinstance(content, list):
        raise AiSceneRecognitionError("Anthropic response content field was not a list.")

    texts = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            texts.append(str(block.get("text", "")))

    if not texts:
        raise AiSceneRecognitionError("Anthropic response did not contain text content.")
    return "\n".join(texts)


def _recognize_scenes_with_anthropic(
    payload: ChapterPayload,
    api_key: str,
    base_url: str,
    model: str,
) -> tuple[list[dict[str, Any]], list[WorkerLog]]:
    body = {
        "model": model,
        "max_tokens": 2048,
        "temperature": 0.2,
        "system": SCENE_RECOGNITION_SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": build_scene_recognition_user_prompt(payload),
            }
        ],
    }

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/v1/messages",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise AiSceneRecognitionError(f"Anthropic request failed: {error.code} {detail}") from error
    except urllib.error.URLError as error:
        raise AiSceneRecognitionError(f"Anthropic request failed: {error.reason}") from error
    except TimeoutError as error:
        raise AiSceneRecognitionError("Anthropic request timed out.") from error

    parsed = _extract_json_object(_extract_anthropic_text(response_body))
    candidates = parsed.get("candidates", [])
    if not isinstance(candidates, list):
        raise AiSceneRecognitionError("AI response candidates field was not a list.")

    return candidates, [
        WorkerLog(
            level="info",
            message="AI scene recognition completed.",
            data={"provider": "anthropic-compatible", "baseUrl": base_url, "model": model, "rawCount": len(candidates)},
        )
    ]


def recognize_scenes_with_openai(payload: ChapterPayload) -> tuple[list[dict[str, Any]], list[WorkerLog]]:
    _load_local_env()
    base_url = os.getenv("AI_BASE_URL", DEFAULT_AI_BASE_URL).rstrip("/")
    api_key = _get_api_key(base_url)
    if not api_key:
        key_name = "KIMI_API_KEY" if "api.kimi.com" in base_url else "AI provider API key"
        raise AiSceneRecognitionError(f"{key_name} is not configured.")

    model = os.getenv("AI_MODEL") or os.getenv("OPENAI_MODEL") or DEFAULT_AI_MODEL
    if _is_anthropic_compatible(base_url):
        return _recognize_scenes_with_anthropic(payload, api_key, base_url, model)

    body = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 2048,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SCENE_RECOGNITION_SYSTEM_PROMPT},
            {"role": "user", "content": build_scene_recognition_user_prompt(payload)},
        ],
    }

    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise AiSceneRecognitionError(f"OpenAI request failed: {error.code} {detail}") from error
    except urllib.error.URLError as error:
        raise AiSceneRecognitionError(f"OpenAI request failed: {error.reason}") from error
    except TimeoutError as error:
        raise AiSceneRecognitionError("OpenAI request timed out.") from error

    content = response_body["choices"][0]["message"]["content"]
    parsed = _extract_json_object(content)
    candidates = parsed.get("candidates", [])
    if not isinstance(candidates, list):
        raise AiSceneRecognitionError("AI response candidates field was not a list.")

    return candidates, [
        WorkerLog(
            level="info",
            message="AI scene recognition completed.",
            data={"provider": "openai-compatible", "baseUrl": base_url, "model": model, "rawCount": len(candidates)},
        )
    ]
