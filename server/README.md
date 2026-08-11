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

When the App submits `POST /chapters/:chapterId/generation-task`, the local API starts one Worker process only when `WORKER_AUTO_RUN=true`. This opt-in supports the local product loop: import a book, stay on the reader page, then wait for the generated scene image to appear.

Formal Worker activation and limits:

```powershell
$env:WORKER_AUTO_RUN="true"
$env:WORKER_MAX_IMAGES="1"
$env:VISION_AUDIT_ENDPOINT="https://your-vision-endpoint.example/v1/audit"
$env:VISION_AUDIT_MODEL="vision-model"
$env:VISION_AUDIT_VERSION="audit-v1"
```

Formal dispatch is closed unless `WORKER_AUTO_RUN` is exactly `true`, and its arguments are hard-fenced to Kimi classification plus GLM generation. `WORKER_SCENE_PROVIDER`, `IMAGE_PROVIDER`, `heuristic`, and `mock-svg` cannot override a formal task. Formal tasks fail closed when Kimi, GLM, or vision-audit configuration is unavailable. See [`docs/expanded-image-pipeline.md`](../docs/expanded-image-pipeline.md) before migration or activation.

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

Online book search aggregates Chinese Wikisource and Project Gutenberg. The App never fetches either source directly:

- Gutenberg uses Gutendex metadata and Project Gutenberg EPUB/TXT downloads. `GUTENDEX_BASE_URL` defaults to `https://gutendex.com`.
- Chinese Wikisource uses the official MediaWiki API. `WIKISOURCE_API_URL` defaults to `https://zh.wikisource.org/w/api.php`; overrides must use that exact HTTPS hostname and API path.
- If Node cannot reach external book sources directly, set `HTTPS_PROXY` in `server/.env` (for example `http://127.0.0.1:7897`). `NO_PROXY=localhost,127.0.0.1` keeps local callbacks direct. Proxy settings apply only to external book-source requests, not Supabase.
- If one provider fails, search still returns the other provider's items and records the failed provider in `sourceErrors`. Only a total provider failure returns `BOOK_SOURCE_UNAVAILABLE`.

Run the latest `supabase/schema.sql` before importing an online book. Search remains available without Supabase, but import returns `SUPABASE_NOT_CONFIGURED`.

### Online book API

```http
GET /online-books/search?q=红楼梦&page=1
```

The response page contains `items`, `page`, `total`, `hasNextPage`, and `sourceErrors`. Each item has a stable composite identity of `source` plus `sourceBookId`; supported sources are `wikisource` and `gutenberg`.

```http
POST /online-books/import
Content-Type: application/json

{
  "source": "wikisource",
  "sourceBookId": "7683",
  "visualStyle": "插画"
}
```

Wikisource import resolves the stable root page, discovers recognizable direct chapter subpages, sorts them naturally, and requests simplified `zh-hans` TextExtracts. It validates the complete in-memory book before calling the atomic `import_online_book` RPC. Re-importing the same `(source, sourceBookId)` returns the existing book with `alreadyImported: true`.

Limits and safety boundaries:

- no more than 200 valid chapters;
- no more than 20 MiB of final UTF-8 paragraph text;
- TextExtracts batches contain at most 20 pages with at most three concurrent requests;
- only `https://zh.wikisource.org/w/api.php` is trusted for Wikisource metadata and text;
- links found inside source text are never followed;
- a failed fetch, parse, limit check, or RPC does not persist a partial book.

Stable online-book error codes:

| Code | Meaning |
| --- | --- |
| `BOOK_SOURCE_UNAVAILABLE` | All search providers failed, or the selected source is unavailable. |
| `BOOK_SOURCE_URL_REJECTED` | The configured Wikisource API URL is not the trusted HTTPS target. |
| `BOOK_DOWNLOAD_FAILED` | A Gutenberg source file could not be downloaded. |
| `ONLINE_BOOK_FORMAT_UNSUPPORTED` | A Gutenberg work has no supported EPUB or UTF-8 TXT format. |
| `ONLINE_BOOK_PARSE_FAILED` | A downloaded Gutenberg file could not be parsed. |
| `ONLINE_BOOK_NOT_FOUND` | The requested stable source page does not exist. |
| `ONLINE_BOOK_HAS_NO_CHAPTERS` | No supported direct chapter subpages were found. |
| `ONLINE_BOOK_HAS_NO_READABLE_TEXT` | The discovered chapters contained no readable paragraphs. |
| `ONLINE_BOOK_TOO_MANY_CHAPTERS` | The work contains more than 200 valid chapters. |
| `BOOK_DOWNLOAD_TOO_LARGE` | The final UTF-8 text exceeds 20 MiB. |
| `SUPABASE_NOT_CONFIGURED` | Search is available, but persistent import is not configured. |

Imported Wikisource books retain their canonical source URL and the attribution text `来源：中文维基文库；作品版权与许可状态以来源页标注为准`. `authorized` means the source platform supplies the work under its stated terms; it is not a blanket claim that every Wikisource work is public domain. Follow the canonical source page for the work-specific license notice.

## Validation

```powershell
npm test
npm run typecheck
npm run build
npm test
```

## Endpoints

- `GET /health`
- `GET /books`
- `POST /books`
- `GET /books/:bookId`
- `GET /books/:bookId/chapters`
- `GET /online-books/search?q=...&page=1`
- `POST /online-books/import`
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
    "rules": [{
      "rule": "fact-consistency",
      "passed": false,
      "severity": "severe",
      "explanation": "The generated landmark conflicts with the source facts."
    }],
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
    verdict = 'publishable'
    rules = @(@{
      rule = 'environment-composition'; passed = $true; severity = 'info'
      explanation = 'The image satisfies the environment composition contract.'
    })
    severeFactConflict = $false
    provider = 'vision'; model = 'vision-model'; auditVersion = 'audit-v1'
  }
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/worker/image-generation-attempts' -ContentType 'application/json' -Body $attempt
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
- aggregated Chinese Wikisource and Project Gutenberg search with partial-provider failure handling
- server-side Gutenberg EPUB/TXT import and Wikisource direct-chapter `zh-hans` whole-book import
- EPUB-first parsing with UTF-8 TXT fallback, source metadata normalization, deduplication, and cover storage

Not included:

- task retry logic
- user auth and ownership policies
