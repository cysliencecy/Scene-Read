# SceneReader Worker

Python Worker for chapter text processing and scene recognition.

Current T12 scope:

- Read one chapter payload.
- Use GLM through an OpenAI-compatible API when configured.
- Output location/environment changes, source snippets, insertion positions, prompt drafts, validation logs.
- Fall back to local heuristic recognition when no AI key is configured.
- Generate at least one scene image from the selected prompt.
- Post generated image data back to the API so the server can upload to Supabase Storage and write `scene_images`.

## Requirements

- Python 3.11 or newer

The `python` command on this machine currently points to Python 2.7. Use a Python 3 executable explicitly.

## AI Configuration

Real AI recognition defaults to GLM:

Option 1: create a local `worker/.env` file. This file is ignored by git.

```text
GLM_API_KEY=your-glm-or-bigmodel-key
AI_MODEL=glm-4-flash
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_PROVIDER=openai
```

You can copy from `worker/.env.example`.

Option 2: set environment variables in the current shell.

```powershell
$env:GLM_API_KEY="your-api-key"
$env:AI_MODEL="glm-4-flash"
$env:AI_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
$env:AI_PROVIDER="openai"
```

`AI_MODEL` and `AI_BASE_URL` are optional because the Worker already defaults to the values above. `ZHIPU_API_KEY` and `BIGMODEL_API_KEY` are also accepted as fallback key names, but `GLM_API_KEY` is preferred. Kimi/Moonshot key names remain supported only as backward-compatible fallbacks.

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
GLM_IMAGE_SIZE=1024x1024
```

For App import flow triggered by the server, also put the image provider in `server/.env`, because the server process starts the Worker:

```text
IMAGE_PROVIDER=glm
WORKER_SCENE_PROVIDER=auto
WORKER_MAX_IMAGES=1
GLM_API_KEY=your-glm-or-bigmodel-key
GLM_IMAGE_MODEL=glm-image
GLM_IMAGE_SIZE=1024x1024
```

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

Post output to the local API:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --api-url http://localhost:4000
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

Generate and post the image to the local API:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --provider heuristic --generate-images --image-provider mock-svg --api-url http://localhost:4000
```

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
