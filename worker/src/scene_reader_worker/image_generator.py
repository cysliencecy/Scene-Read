from __future__ import annotations

import base64
import json
import os
import re
import struct
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass
from pathlib import Path

from .types import GeneratedImageArtifact, ImageGenerationRequest, SceneCandidate


DEFAULT_GLM_IMAGE_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/images/generations"
DEFAULT_GLM_IMAGE_MODEL = "glm-image"
GLM_LANDSCAPE_SIZE = "1536x1024"


def build_glm_payload(request: ImageGenerationRequest) -> dict[str, str]:
    if request.aspectRatio != "3:2":
        raise ValueError("Formal GLM requests require 3:2.")
    return {
        "model": os.getenv("GLM_IMAGE_MODEL", DEFAULT_GLM_IMAGE_MODEL),
        "prompt": request.prompt,
        "size": GLM_LANDSCAPE_SIZE,
    }


def build_pollinations_url(request: ImageGenerationRequest) -> str:
    if request.aspectRatio != "3:2":
        raise ValueError("Formal Pollinations requests require 3:2.")
    return f"https://image.pollinations.ai/prompt/{urllib.parse.quote(request.prompt)}?width=1536&height=1024&nologo=true"


@dataclass(frozen=True)
class _DownloadedImage:
    data: bytes
    mime_type: str
    width: int
    height: int


def _content_type(response: object, default: str) -> str:
    headers = getattr(response, "headers", {})
    value = headers.get("Content-Type", default)
    return str(value).split(";", 1)[0].strip().lower()


def _svg_dimension(value: str | None) -> int | None:
    if value is None:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*", value)
    if not match:
        return None
    number = float(match.group(1))
    return int(number) if number.is_integer() and number > 0 else None


def _svg_dimensions(data: bytes) -> tuple[int, int]:
    try:
        root = ElementTree.fromstring(data)
    except (ElementTree.ParseError, UnicodeDecodeError) as error:
        raise ValueError("Generated SVG bytes could not be parsed.") from error
    if root.tag.rsplit("}", 1)[-1] != "svg":
        raise ValueError("Generated SVG root element was not <svg>.")
    width = _svg_dimension(root.get("width"))
    height = _svg_dimension(root.get("height"))
    if width and height:
        return width, height
    view_box = root.get("viewBox", "").replace(",", " ").split()
    if len(view_box) == 4:
        try:
            view_width, view_height = float(view_box[2]), float(view_box[3])
        except ValueError as error:
            raise ValueError("Generated SVG viewBox dimensions were invalid.") from error
        if view_width.is_integer() and view_height.is_integer() and view_width > 0 and view_height > 0:
            return int(view_width), int(view_height)
    raise ValueError("Generated SVG did not contain positive integer dimensions.")


def _jpeg_dimensions(data: bytes) -> tuple[int, int]:
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("Generated JPEG bytes did not contain a JPEG header.")
    offset = 2
    start_of_frame_markers = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    while offset < len(data):
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]
        offset += 1
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        segment_length = int.from_bytes(data[offset : offset + 2], "big")
        if segment_length < 2 or offset + segment_length > len(data):
            break
        if marker in start_of_frame_markers:
            if segment_length < 7:
                break
            height = int.from_bytes(data[offset + 3 : offset + 5], "big")
            width = int.from_bytes(data[offset + 5 : offset + 7], "big")
            if width > 0 and height > 0:
                return width, height
            break
        offset += segment_length
    raise ValueError("Generated JPEG did not contain decodable dimensions.")


def _webp_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("Generated WebP bytes did not contain a WebP header.")
    chunk = data[12:16]
    if chunk == b"VP8X":
        return (
            1 + int.from_bytes(data[24:27], "little"),
            1 + int.from_bytes(data[27:30], "little"),
        )
    if chunk == b"VP8L" and data[20] == 0x2F:
        width = 1 + data[21] + ((data[22] & 0x3F) << 8)
        height = 1 + ((data[22] & 0xC0) >> 6) + (data[23] << 2) + ((data[24] & 0x0F) << 10)
        return width, height
    if chunk == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
        width = int.from_bytes(data[26:28], "little") & 0x3FFF
        height = int.from_bytes(data[28:30], "little") & 0x3FFF
        if width > 0 and height > 0:
            return width, height
    raise ValueError("Generated WebP did not contain decodable dimensions.")


def decode_image_dimensions(data: bytes, mime_type: str) -> tuple[int, int]:
    """Read dimensions from provider bytes; never substitute requested dimensions."""
    normalized_mime = mime_type.lower().split(";", 1)[0].strip()
    if normalized_mime == "image/svg+xml" or data.lstrip().startswith((b"<svg", b"<?xml")):
        return _svg_dimensions(data)
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        if len(data) < 24 or data[12:16] != b"IHDR":
            raise ValueError("Generated PNG did not contain a valid IHDR chunk.")
        width, height = struct.unpack(">II", data[16:24])
        if width > 0 and height > 0:
            return width, height
    if data.startswith((b"GIF87a", b"GIF89a")) and len(data) >= 10:
        width, height = struct.unpack("<HH", data[6:10])
        if width > 0 and height > 0:
            return width, height
    if data.startswith(b"\xff\xd8"):
        return _jpeg_dimensions(data)
    if data.startswith(b"RIFF"):
        return _webp_dimensions(data)
    raise ValueError(
        f"Generated image dimensions could not be decoded from {normalized_mime or 'unknown MIME'} bytes."
    )


def _actual_dimensions(
    data: bytes,
    mime_type: str,
    metadata_width: object = None,
    metadata_height: object = None,
) -> tuple[int, int]:
    try:
        decoded = decode_image_dimensions(data, mime_type)
    except ValueError:
        if (
            type(metadata_width) is int
            and type(metadata_height) is int
            and metadata_width > 0
            and metadata_height > 0
        ):
            return metadata_width, metadata_height
        raise
    if metadata_width is not None or metadata_height is not None:
        if type(metadata_width) is not int or type(metadata_height) is not int:
            raise ValueError("Provider image dimension metadata must contain positive integers.")
        if (metadata_width, metadata_height) != decoded:
            raise ValueError("Provider image dimension metadata disagreed with decoded image bytes.")
    return decoded


def _require_three_two(width: int, height: int, provider: str) -> None:
    if width * 2 != height * 3:
        raise ValueError(
            f"{provider} returned {width}x{height}; formal images must have a 3:2 aspect ratio."
        )


def generate_formal_image(request: ImageGenerationRequest, provider: str) -> GeneratedImageArtifact:
    if provider == "heuristic":
        raise ValueError("Heuristic cannot generate formal images.")
    _load_local_env()
    if provider == "mock-svg":
        data = _svg_preview(request.prompt)
        mime_type = "image/svg+xml"
        width, height = decode_image_dimensions(data, mime_type)
        model = "mock-svg"
    elif provider == "pollinations":
        downloaded = _download_formal_pollinations_image(request)
        data, mime_type = downloaded.data, downloaded.mime_type
        width, height = downloaded.width, downloaded.height
        model = "pollinations"
        _require_three_two(width, height, provider)
    elif provider == "glm":
        payload = build_glm_payload(request)
        downloaded = _download_glm_image(payload)
        data, mime_type = downloaded.data, downloaded.mime_type
        width, height = downloaded.width, downloaded.height
        model = payload["model"]
        _require_three_two(width, height, provider)
    else:
        raise ValueError(f"Unsupported formal provider: {provider}")
    return GeneratedImageArtifact(
        imageBase64=base64.b64encode(data).decode("ascii"),
        mimeType=mime_type,
        provider=provider,
        model=model,
        width=width,
        height=height,
    )


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


def _download_formal_pollinations_image(request: ImageGenerationRequest) -> _DownloadedImage:
    provider_request = urllib.request.Request(
        build_pollinations_url(request),
        headers={"User-Agent": "SceneReaderWorker/0.1"},
        method="GET",
    )
    with urllib.request.urlopen(provider_request, timeout=90) as response:
        data = response.read()
        mime_type = _content_type(response, "image/jpeg")
    width, height = _actual_dimensions(data, mime_type)
    return _DownloadedImage(data, mime_type, width, height)


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


def _download_glm_image(payload: dict[str, str]) -> _DownloadedImage:
    _load_local_env()
    api_key = os.getenv("GLM_API_KEY") or os.getenv("ZHIPU_API_KEY") or os.getenv("BIGMODEL_API_KEY")
    if not api_key:
        raise ValueError("GLM image generation requires GLM_API_KEY, ZHIPU_API_KEY, or BIGMODEL_API_KEY.")
    if set(payload) != {"model", "prompt", "size"}:
        raise ValueError("GLM image payload must contain exactly model, prompt, and size.")
    if payload["size"] != GLM_LANDSCAPE_SIZE:
        raise ValueError(f"Formal GLM image size must be {GLM_LANDSCAPE_SIZE}.")
    if not payload["model"].strip() or not payload["prompt"].strip():
        raise ValueError("GLM image payload requires a non-empty model and prompt.")
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
    if not isinstance(response_payload, dict):
        raise ValueError("GLM image response root was not an object.")
    items = response_payload.get("data")
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        raise ValueError(f"GLM image response did not include data[0]: {response_payload}")
    image_item = items[0]
    image_url = image_item.get("url")
    if not isinstance(image_url, str) or not image_url.strip():
        raise ValueError(f"GLM image response did not include data[0].url: {response_payload}")
    data, mime_type = _download_url(image_url)
    width, height = _actual_dimensions(
        data,
        mime_type,
        image_item.get("width"),
        image_item.get("height"),
    )
    return _DownloadedImage(data, mime_type, width, height)


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
            downloaded = _download_glm_image(
                {
                    "model": os.getenv("GLM_IMAGE_MODEL", DEFAULT_GLM_IMAGE_MODEL),
                    "prompt": prompt,
                    "size": GLM_LANDSCAPE_SIZE,
                }
            )
            image_bytes, mime_type = downloaded.data, downloaded.mime_type
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
