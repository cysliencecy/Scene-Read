# SceneReader Server

Node.js / TypeScript API skeleton for the SceneReader app.

This backend can run with in-memory mock data or Supabase.

- Without Supabase env vars: read mock data, reject persistent writes.
- With Supabase env vars: read and write `books`, `chapters`, and `generation_tasks`.

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

## Scope

Included:

- Express API skeleton
- TypeScript strict mode
- mock books, chapters, generation tasks, and scene images
- response shapes aligned with current mobile mock data
- optional Supabase data layer for books, chapters, and generation tasks

Not included:

- real file import
- Python Worker
- AI scene recognition
- image generation
