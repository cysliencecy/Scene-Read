from __future__ import annotations

import json
import base64
from dataclasses import asdict
from pathlib import Path

from scene_reader_worker.image_generator import generate_images_for_candidates
from scene_reader_worker.processor import process_chapter


ROOT = Path(__file__).resolve().parents[2]
SAMPLES_PATH = ROOT / "worker" / "samples" / "t18-quality-samples.json"
OUTPUT_PATH = ROOT / "worker" / ".tmp" / "t18-quality-results.json"
IMAGE_DIR = ROOT / "worker" / ".tmp" / "t18-images"


def main() -> int:
    samples = json.loads(SAMPLES_PATH.read_text(encoding="utf-8"))
    results = []

    for sample in samples:
        result = process_chapter(sample, provider="auto", max_candidates=3)
        images = generate_images_for_candidates(result.candidates, provider="mock-svg", max_images=1)
        for image in images:
            suffix = "svg" if image.mimeType == "image/svg+xml" else "img"
            image_path = IMAGE_DIR / f"{image.id}.{suffix}"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(base64.b64decode(image.imageBase64))
        results.append(
            {
                "chapterId": sample["chapterId"],
                "chapterTitle": sample["chapterTitle"],
                "expected": sample["expected"],
                "provider": result.provider,
                "candidates": [asdict(candidate) for candidate in result.candidates],
                "images": [
                    {
                        **asdict(image),
                        "localPath": str(IMAGE_DIR / f"{image.id}.{'svg' if image.mimeType == 'image/svg+xml' else 'img'}"),
                    }
                    for image in images
                ],
                "logs": [asdict(log) for log in result.logs],
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUTPUT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
