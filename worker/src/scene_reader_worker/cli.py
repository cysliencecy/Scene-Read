from __future__ import annotations

import argparse
import json
import urllib.request
from dataclasses import asdict
from pathlib import Path

from .processor import process_chapter
from .types import ChapterPayload


def _read_json(path: Path) -> ChapterPayload:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Process one SceneReader chapter payload.")
    parser.add_argument("--input", required=True, help="Path to chapter input JSON.")
    parser.add_argument("--output", help="Optional path to write worker result JSON.")
    parser.add_argument("--api-url", help="Optional API base URL for result callback.")
    args = parser.parse_args()

    result = asdict(process_chapter(_read_json(Path(args.input))))

    if args.output:
        _write_json(Path(args.output), result)

    if args.api_url:
        _post_to_api(args.api_url, result)

    if not args.output:
        print(json.dumps(result, ensure_ascii=False, indent=2))

    return 0
