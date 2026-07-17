# SceneReader Server

Node.js / TypeScript API skeleton for the SceneReader app.

This T6 backend uses in-memory mock data only. It does not connect to Supabase, Python Worker, AI, or image generation.

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

## Validation

```powershell
npm run typecheck
npm run build
```

## Endpoints

- `GET /health`
- `GET /books`
- `GET /books/:bookId`
- `GET /books/:bookId/chapters`
- `GET /chapters/:chapterId`
- `GET /generation-tasks`
- `GET /generation-tasks/:taskId`
- `GET /scene-images/:imageId`

## Scope

Included:

- Express API skeleton
- TypeScript strict mode
- mock books, chapters, generation tasks, and scene images
- response shapes aligned with current mobile mock data

Not included:

- Supabase
- real file import
- Python Worker
- AI scene recognition
- image generation
