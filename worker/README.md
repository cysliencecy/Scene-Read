# SceneReader Worker

Python Worker for chapter text processing and scene recognition.

The formal expanded-image flow:

- Uses Kimi K3 for whole-chapter discovery and local-context six-type classification.
- Saves below-threshold candidates for debug without generating an image.
- Builds a deterministic `3:2` composition prompt, generates once with GLM, and audits once.
- Posts candidates to `/worker/scene-candidates` and attempts to `/worker/image-generation-attempts`.
- Publishes only attempts accepted by the audit; blocked artifacts remain debug-only.

The local `heuristic` and `mock-svg` modes remain development aids. They are not formal generation fallbacks and cannot publish a new formal reader image.

## Requirements

- Python 3.11 or newer

The `python` command on this machine currently points to Python 2.7. Use a Python 3 executable explicitly.

## AI Configuration

Real AI recognition defaults to Kimi K3:

Option 1: create a local `worker/.env` file. This file is ignored by git.

```text
KIMI_API_KEY=your-kimi-key
AI_MODEL=kimi-k3
AI_BASE_URL=https://api.kimi.com/coding
AI_PROVIDER=anthropic
```

You can copy from `worker/.env.example`.

Option 2: set environment variables in the current shell.

```powershell
$env:KIMI_API_KEY="your-api-key"
$env:AI_MODEL="kimi-k3"
$env:AI_BASE_URL="https://api.kimi.com/coding"
$env:AI_PROVIDER="anthropic"
```

`AI_MODEL` and `AI_BASE_URL` are optional because the Worker already defaults to the values above. `MOONSHOT_API_KEY` is accepted as a backward-compatible fallback for `KIMI_API_KEY`.

## Image Generation Configuration

The Worker supports these image providers:

- `mock-svg`: local placeholder image, no external API cost.
- `pollinations`: external URL-based image generation.
- `glm`: Zhipu BigModel image generation API.

For manual Worker runs, put GLM image settings in `worker/.env`:

```text
IMAGE_PROVIDER=glm
GLM_API_KEY=your-glm-or-bigmodel-key
GLM_IMAGE_MODEL=glm-image
```

For App import flow triggered by the server, also put the image provider in `server/.env`, because the server process starts the Worker:

```text
IMAGE_PROVIDER=glm
WORKER_SCENE_PROVIDER=openai
WORKER_MAX_IMAGES=1
GLM_API_KEY=your-glm-or-bigmodel-key
GLM_IMAGE_MODEL=glm-image
VISION_AUDIT_ENDPOINT=https://your-vision-endpoint.example/v1/audit
VISION_AUDIT_MODEL=vision-model
VISION_AUDIT_VERSION=audit-v1
```

Formal GLM requests always use the code-owned supported landscape size `1536x1024`;
there is no runtime size override.

Do not commit real API keys.

## Input

```json
{
  "taskId": "task-sample-1",
  "bookId": "book-sample",
  "chapterId": "chapter-sample-1",
  "chapterTitle": "第一章 为难时相遇",
  "blocks": [
    {
      "id": "p1",
      "type": "paragraph",
      "text": "夜里，街道上的风很冷。"
    }
  ]
}
```

## Run

```powershell
cd "F:\codexDemo\Scene Read\worker"
python -m scene_reader_worker --input samples/chapter-input.json
```

Force local heuristic mode:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --provider heuristic
```

Force real AI mode:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --provider openai
```

Write output to a file:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --output .tmp/scene-candidates.json
```

Run the formal two-stage pipeline against a local API task. This posts canonical candidates and attempt callbacks to their dedicated endpoints:

```powershell
python -m scene_reader_worker --task-id task-1 --api-url http://localhost:4001 --provider openai --generate-images --image-provider glm --max-images 1
```

Generate one image and include it in the output:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --provider heuristic --generate-images --image-provider mock-svg --output .tmp/scene-image-result.json
```

Generate one image with GLM:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --provider openai --generate-images --image-provider glm --max-images 1
```

Use the default external image provider:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --provider openai --generate-images --max-images 1
```

Local debug-only heuristic output can still be inspected, but it does not create a formal attempt or reader projection:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --provider heuristic --output .tmp/heuristic-debug.json
```

The full migration, activation, callback, and rollback procedure is in [`docs/expanded-image-pipeline.md`](../docs/expanded-image-pipeline.md).

## Offline expanded-image quality gate

The six-type activation gate is a local, offline evaluator. It validates exactly 60 unique, evidence-backed samples (ten each for `environment`, `portrait`, `interaction`, `action`, `object`, and `atmosphere`) and writes only a JSON plus Markdown report. It never calls Server/Supabase or Worker callbacks, and evaluation mode intentionally has no `--api-url` option.

```powershell
$env:PYTHONPATH = 'src'
& 'C:\Users\18270\AppData\Local\Programs\Python\Python313\python.exe' scripts/run_expanded_image_quality_check.py `
  --samples samples/expanded-image-quality-samples.json `
  --results samples/expanded-image-quality-results.example.json `
  --output .tmp/expanded-image-quality-report.json
```

The checked-in results file is an explicitly non-activation example fixture; it deliberately fails the severe fact-conflict gate. Use a fresh pipeline/audit snapshot and the review process in [`docs/expanded-image-quality-gate.md`](../docs/expanded-image-quality-gate.md) for an actual direct-activation decision.

## Output

```json
{
  "taskId": "task-sample-1",
  "bookId": "book-sample",
  "chapterId": "chapter-sample-1",
  "status": "completed",
  "candidates": [
    {
      "id": "chapter-sample-1-scene-1",
      "chapterId": "chapter-sample-1",
      "sourceBlockId": "p1",
      "position": 0,
      "reason": "地点或环境关键词命中，可能适合插入场景插图",
      "sourceText": "夜里，街道上的风很冷。",
      "promptDraft": "阅读辅助插图，克制写实风格，根据原文呈现场景氛围，不要文字、水印或夸张构图：夜里，街道上的风很冷。",
      "locationChange": "关键词启发式识别到环境或地点描写",
      "confidence": 0.47
    }
  ],
  "provider": "heuristic",
  "logs": [
    {
      "level": "info",
      "message": "Heuristic scene recognition completed.",
      "data": {
        "count": 1
      }
    }
  ]
}
```
