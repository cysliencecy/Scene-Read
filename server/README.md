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

Online book search aggregates Chinese Wikisource and Project Gutenberg. The App never fetches either source directly:

- Gutenberg uses Gutendex metadata and Project Gutenberg EPUB/TXT downloads. `GUTENDEX_BASE_URL` defaults to `https://gutendex.com`.
- Chinese Wikisource uses the official MediaWiki API. `WIKISOURCE_API_URL` defaults to `https://zh.wikisource.org/w/api.php`; overrides must use that exact HTTPS hostname and API path.
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
- aggregated Chinese Wikisource and Project Gutenberg search with partial-provider failure handling
- server-side Gutenberg EPUB/TXT import and Wikisource direct-chapter `zh-hans` whole-book import
- EPUB-first parsing with UTF-8 TXT fallback, source metadata normalization, deduplication, and cover storage

Not included:

- task retry logic
- user auth and ownership policies
