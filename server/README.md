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
$env:WORKER_SCENE_PROVIDER="heuristic"
$env:IMAGE_PROVIDER="mock-svg"
$env:WORKER_MAX_IMAGES="1"
```

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
- `GET /scene-images/:imageId`
- `POST /worker/scene-candidates`
- `GET /worker/scene-candidates`
- `POST /worker/scene-images`

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
