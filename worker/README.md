# SceneReader Worker

Python Worker skeleton for chapter text processing.

T10 scope:

- Read one chapter payload.
- Produce placeholder scene candidates from chapter text.
- Optionally post the result back to the local API.
- No real AI, no image generation, no Supabase writes.

## Requirements

- Python 3.11 or newer

The `python` command on this machine currently points to Python 2.7. Use a Python 3 executable explicitly.

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

Write output to a file:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --output .tmp/scene-candidates.json
```

Post output to the local API:

```powershell
python -m scene_reader_worker --input samples/chapter-input.json --api-url http://localhost:4000
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
      "reason": "地点或环境关键词命中",
      "sourceText": "夜里，街道上的风很冷。",
      "promptDraft": "根据原文生成克制的阅读插图：夜里，街道上的风很冷。"
    }
  ]
}
