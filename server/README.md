# SceneReader Server

Node.js / TypeScript API skeleton for the SceneReader app.

This backend can run with in-memory mock data or Supabase.

- Without Supabase env vars: read mock data, reject persistent writes.
- With Supabase env vars: read and write `books`, `chapters`, `generation_tasks`, and `scene_images`.

## Run

```powershell
cd "F:\codexDemo\Scene Read\server"
npm install
npm run dev
```

Default URL:

```text
http://localhost:4000
```

When the App submits `POST /chapters/:chapterId/generation-task`, the local API starts one Worker process automatically by default. This is meant for the first local product loop: import a book, stay on the reader page, then wait for the generated scene image to appear.

Worker defaults:

```powershell
$env:WORKER_SCENE_PROVIDER="openai"
$env:IMAGE_PROVIDER="glm"
$env:WORKER_MAX_IMAGES="1"
$env:VISION_AUDIT_ENDPOINT="https://your-vision-endpoint.example/v1/audit"
$env:VISION_AUDIT_MODEL="vision-model"
$env:VISION_AUDIT_VERSION="audit-v1"
```

Formal tasks fail closed when Kimi, GLM, or vision-audit configuration is unavailable. `heuristic` and `mock-svg` are explicit local-debug modes, not formal fallbacks. See [`docs/expanded-image-pipeline.md`](../docs/expanded-image-pipeline.md) before migration or activation.

On Windows, the server tries `py -3` by default. If your machine does not have the Python launcher configured, set the Python 3 executable explicitly before running the server:

```powershell
$env:WORKER_PYTHON="C:\Users\18270\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
```

Disable automatic Worker execution only when debugging the queue manually:

```powershell
$env:WORKER_AUTO_RUN="false"
```

Supabase setup:

```powershell
Copy-Item .env.example .env
```

Then fill `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Full setup notes are in `docs/supabase-setup.md`.

## Validation

```powershell
npm test
npm run typecheck
npm run build
```

## Endpoints

- `GET /health`
- `GET /books`
- `POST /books`
- `GET /books/:bookId`
- `GET /books/:bookId/chapters`
- `POST /chapters`
- `GET /chapters/:chapterId`
- `GET /generation-tasks`
- `POST /generation-tasks`
- `GET /generation-tasks/:taskId`
- `GET /scene-candidates?chapterId=:chapterId&includeAttempts=true`
- `POST /scene-candidates/:candidateId/regenerations`
- `GET /scene-images`
- `GET /scene-images/:imageId`
- `POST /worker/scene-candidates`
- `POST /worker/image-generation-attempts`
- `GET /worker/tasks/:taskId/chapter-payload`

## Expanded image callback order

The Worker first loads the chapter payload. It includes the current `profiles` array used by classification and prompt construction. The Worker then posts canonical candidates before attempts so every attempt has an existing candidate parent:

```text
GET  /worker/tasks/task-1/chapter-payload
POST /worker/scene-candidates
POST /worker/image-generation-attempts
PATCH /worker/tasks/task-1
```

Candidate callbacks use the approved ranked-classification shape. Repeating the same candidate IDs replaces no history and returns the same logical debug records:

```json
{
  "taskId": "task-1",
  "bookId": "book-1",
  "chapterId": "chapter-1",
  "candidates": [{
    "id": "candidate-1",
    "sourceBlockId": "p1",
    "position": 0,
    "readingValue": 0.9,
    "classification": {
      "primaryType": "environment",
      "rankedTypes": [
        { "imageType": "environment", "confidence": 0.91 },
        { "imageType": "atmosphere", "confidence": 0.72 },
        { "imageType": "object", "confidence": 0.31 }
      ],
      "evidence": [{ "sourceBlockId": "p1", "sourceText": "Rain crossed the bridge." }],
      "reason": "The bridge establishes the setting.",
      "auxiliaryTags": ["rain"],
      "status": "eligible",
      "model": "kimi-k3",
      "promptVersion": "kimi-classification-v1"
    },
    "contractVersion": "composition-v1",
    "profileVersion": "profile-v1"
  }],
  "profileFactSuggestions": []
}
```

Attempt callbacks are idempotent by `idempotencyKey`. Only `publishable` attempts update `scene_images`; blocked and failed artifacts remain in candidate debug history only. There is no direct Worker-to-reader projection endpoint.

```json
{
  "idempotencyKey": "task-1:candidate-1",
  "candidateId": "candidate-1",
  "taskId": "task-1",
  "trigger": "automatic",
  "requestedType": "environment",
  "prompt": "deterministic 3:2 prompt",
  "status": "blocked",
  "provider": "glm",
  "model": "glm-image-1",
  "width": 768,
  "height": 512,
  "imageBase64": "...",
  "mimeType": "image/png",
  "audit": {
    "verdict": "blocked",
    "rules": [],
    "severeFactConflict": true,
    "provider": "vision",
    "model": "vision-model",
    "auditVersion": "audit-v1"
  }
}
```

Manual regeneration is candidate-scoped and requires both an explicitly confirmed canonical override and an idempotency key:

```http
POST /scene-candidates/candidate-1/regenerations
Content-Type: application/json

{ "overrideImageType": "interaction", "idempotencyKey": "manual-2026-08-07-1" }
```

The response contains the queued task and append-only attempt, linked to the previous attempt through `parentAttemptId`. Repeating the request returns the same pair. A legacy `character` candidate submitted without a confirmed override receives a `reclassify` instruction; the server never assumes `portrait`.

Worker attempt callbacks use the dedicated append-only endpoint; only `publishable` creates or replaces a reader projection:

```powershell
$attempt = @{
  idempotencyKey = 'task-1:candidate-1'
  candidateId = 'candidate-1'
  taskId = 'task-1'
  trigger = 'automatic'
  requestedType = 'environment'
  prompt = 'deterministic 3:2 prompt'
  status = 'publishable'
  provider = 'glm'
  model = 'glm-image'
  width = 1536
  height = 1024
  imageBase64 = '<base64>'
  mimeType = 'image/png'
  audit = @{
    verdict = 'publishable'; rules = @(); severeFactConflict = $false
    provider = 'vision'; model = 'vision-model'; auditVersion = 'audit-v1'
  }
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri 'http://localhost:4001/worker/image-generation-attempts' -ContentType 'application/json' -Body $attempt
```

## Scope

Included:

- Express API skeleton
- TypeScript strict mode
- mock books, chapters, generation tasks, and scene images
- response shapes aligned with current mobile mock data
- optional Supabase data layer for books, chapters, generation tasks, and scene images
- Supabase Storage upload for generated scene images
- local automatic Worker execution after chapter generation task submission

Not included:

- task retry logic
- user auth and ownership policies
