from __future__ import annotations

import base64
import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .types import SceneCandidate


DEFAULT_GLM_IMAGE_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/images/generations"
DEFAULT_GLM_IMAGE_MODEL = "glm-image"


@dataclass(frozen=True)
class GeneratedSceneImage:
    id: str
    chapterId: str
    sourceBlockId: str
    position: int
    imageType: str
    prompt: str
    imageBase64: str
    mimeType: str
    variant: str = "street"


def _svg_preview(prompt: str) -> bytes:
    escaped = (
        prompt.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    svg = f"""
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#253a46"/>
      <stop offset="0.55" stop-color="#556f68"/>
      <stop offset="1" stop-color="#d0b98b"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="576" fill="url(#sky)"/>
  <rect x="78" y="108" width="214" height="338" rx="18" fill="#f3e6c3" opacity="0.38"/>
  <rect x="354" y="158" width="296" height="238" rx="22" fill="#fff6df" opacity="0.22"/>
  <rect x="708" y="96" width="188" height="356" rx="16" fill="#17262d" opacity="0.42"/>
  <path d="M0 452 C190 390 320 526 512 462 C682 405 814 406 1024 470 L1024 576 L0 576 Z" fill="#111b1d" opacity="0.58"/>
  <text x="64" y="512" font-size="30" font-family="sans-serif" fill="#fff8df" opacity="0.92">SceneReader Preview</text>
  <text x="64" y="548" font-size="18" font-family="sans-serif" fill="#fff8df" opacity="0.76">{escaped[:64]}</text>
</svg>
""".strip()
    return svg.encode("utf-8")


def _download_pollinations_image(prompt: str) -> tuple[bytes, str]:
    width = os.getenv("IMAGE_WIDTH", "1024")
    height = os.getenv("IMAGE_HEIGHT", "576")
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&nologo=true"
    request = urllib.request.Request(url, headers={"User-Agent": "SceneReaderWorker/0.1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        content_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0]
        return response.read(), content_type


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


def _download_url(url: str) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "SceneReaderWorker/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        content_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0]
        return response.read(), content_type


def _download_glm_image(prompt: str) -> tuple[bytes, str]:
    _load_local_env()
    api_key = os.getenv("GLM_API_KEY") or os.getenv("ZHIPU_API_KEY") or os.getenv("BIGMODEL_API_KEY")
    if not api_key:
        raise ValueError("GLM image generation requires GLM_API_KEY, ZHIPU_API_KEY, or BIGMODEL_API_KEY.")

    payload = {
        "model": os.getenv("GLM_IMAGE_MODEL", DEFAULT_GLM_IMAGE_MODEL),
        "prompt": prompt,
        "size": os.getenv("GLM_IMAGE_SIZE", "1024x1024"),
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        os.getenv("GLM_IMAGE_ENDPOINT", DEFAULT_GLM_IMAGE_ENDPOINT),
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=180) as response:
        response_payload = json.loads(response.read().decode("utf-8"))

    image_url = response_payload.get("data", [{}])[0].get("url")
    if not image_url:
        raise ValueError(f"GLM image response did not include data[0].url: {response_payload}")
    return _download_url(image_url)


def target_image_count_for_paragraphs(paragraph_count: int, max_images: int = 3) -> int:
    if paragraph_count < 20:
        target = 1
    elif paragraph_count <= 50:
        target = 2
    else:
        target = 3
    return max(1, min(max_images, target))


def select_candidates_for_generation(
    candidates: list[SceneCandidate],
    target_count: int,
) -> list[SceneCandidate]:
    if target_count <= 0:
        return []

    sorted_candidates = sorted(candidates, key=lambda candidate: (-candidate.confidence, candidate.position))
    selected: list[SceneCandidate] = []
    used_types: set[str] = set()

    for candidate in sorted_candidates:
        if len(selected) >= target_count:
            break
        if candidate.imageType in used_types:
            continue
        selected.append(candidate)
        used_types.add(candidate.imageType)

    for candidate in sorted_candidates:
        if len(selected) >= target_count:
            break
        if candidate in selected:
            continue
        selected.append(candidate)

    return sorted(selected, key=lambda candidate: candidate.position)


def _type_prompt(candidate: SceneCandidate) -> str:
    if candidate.imageType == "character":
        return "人物图：突出人物姿态、服装、关系氛围，不做证件照式正脸，避免夸张五官。"
    if candidate.imageType == "object":
        return "物品图：突出关键物品的材质、位置和剧情意义，构图克制，不像广告图。"
    return "场景图：突出地点、空间结构、环境光线、天气和时代感，像小说阅读插图。"


def _final_prompt(candidate: SceneCandidate) -> str:
    return (
        f"{_type_prompt(candidate)}"
        f"{candidate.promptDraft}"
        "统一要求：不要文字、不要水印、不要漫画分镜文字、不要畸形手脸、不要过度戏剧化。"
    )


def generate_images_for_candidates(
    candidates: list[SceneCandidate],
    provider: str | None = None,
    max_images: int = 1,
    target_images: int | None = None,
) -> list[GeneratedSceneImage]:
    _load_local_env()
    image_provider = provider or os.getenv("IMAGE_PROVIDER", "pollinations")
    generated: list[GeneratedSceneImage] = []

    selected_candidates = select_candidates_for_generation(candidates, target_images or max_images)

    for candidate in selected_candidates:
        prompt = _final_prompt(candidate)
        if image_provider == "mock-svg":
            image_bytes = _svg_preview(prompt)
            mime_type = "image/svg+xml"
        elif image_provider == "pollinations":
            image_bytes, mime_type = _download_pollinations_image(prompt)
        elif image_provider == "glm":
            image_bytes, mime_type = _download_glm_image(prompt)
        else:
            raise ValueError(f"Unsupported IMAGE_PROVIDER: {image_provider}")

        generated.append(
            GeneratedSceneImage(
                id=f"{candidate.id}-image",
                chapterId=candidate.chapterId,
                sourceBlockId=candidate.sourceBlockId,
                position=candidate.position,
                imageType=candidate.imageType,
                prompt=prompt,
                imageBase64=base64.b64encode(image_bytes).decode("ascii"),
                mimeType=mime_type,
                variant="office" if "房间" in prompt or "室内" in prompt or "办公室" in prompt else "street",
            )
        )

    return generated
