# Expanded-image pipeline activation runbook

This runbook covers the direct replacement of the legacy three-type formal image path with the six-type, composition-driven pipeline. The replacement is permitted only after a fresh, saved offline report passes all four gates. It is not a shadow run, dual write, or percentage rollout.

## Runtime contract

Formal chapter tasks use Kimi K3 discovery and classification, deterministic composition contracts, one GLM generation, and one vision audit. A classification below `0.65` is retained for debug and creates no automatic attempt. A severe audit result retains the attempt artifact for debug but creates no `scene_images` reader projection. Manual regeneration creates append-only attempt history. Existing `scene`, `object`, and `character` rows remain readable; a legacy `character` is reclassified through the six-type pipeline when regenerated and is never assumed to be `portrait`.

Worker callbacks are sent in this order:

```text
GET  /worker/tasks/:taskId/chapter-payload
POST /worker/scene-candidates
POST /worker/image-generation-attempts
PATCH /worker/tasks/:taskId
```

The formal task runner defaults to `--provider openai --image-provider glm`. `heuristic`, `mock-svg`, and `generate_images_for_candidates(...)` are compatibility or local-debug facilities and are not formal generation routes. There is no shadow invocation.

## Required environment

Configure the Server process, which passes its environment to the Worker:

```text
WORKER_AUTO_RUN=true
WORKER_SCENE_PROVIDER=openai
WORKER_MAX_IMAGES=3

KIMI_API_KEY=<secret>
AI_MODEL=kimi-k3
AI_BASE_URL=https://api.kimi.com/coding
AI_PROVIDER=anthropic

IMAGE_PROVIDER=glm
GLM_API_KEY=<secret>
GLM_IMAGE_MODEL=glm-image

VISION_AUDIT_ENDPOINT=<vision-capable endpoint>
VISION_AUDIT_MODEL=<approved model>
VISION_AUDIT_VERSION=<approved version>

SUPABASE_URL=<project URL>
SUPABASE_SECRET_KEY=<server-side secret>
```

Do not commit credentials. Formal GLM generation uses the code-owned `1536x1024` landscape size; no runtime size override is needed. A missing audit configuration fails the attempt closed.

## Migration and pre-cutover verification

1. Take a recoverable database snapshot and record the application release SHA.
2. Apply `supabase/migrations/20260807_expanded_image_types.sql` once. The migration is additive and preserves old image rows.
3. Run the disposable migration fixture from `server/`:

   ```powershell
   npx tsx --test src/migration.test.ts
   ```

4. Run all automated verification:

   ```powershell
   # worker/
   $env:PYTHONPATH = 'src'
   & 'C:\Users\18270\AppData\Local\Programs\Python\Python313\python.exe' -m unittest discover -s tests -v

   # server/
   npm test
   npm run typecheck
   npm run build

   # mobile/
   npm run test:scene-debug
   npx tsc --noEmit
   ```

5. Generate a fresh offline report from a new result snapshot, not the checked-in example fixture:

   ```powershell
   # worker/
   $env:PYTHONPATH = 'src'
   & 'C:\Users\18270\AppData\Local\Programs\Python\Python313\python.exe' scripts/run_expanded_image_quality_check.py `
     --samples samples/expanded-image-quality-samples.json `
     --results path/to/fresh-results.json `
     --output path/to/saved-expanded-image-quality-report.json
   ```

6. Verify the JSON and Markdown counterparts are saved, `passed` is `true`, and the report contains approved `modelVersions`, `promptVersions`, `contractVersions`, and `auditVersions`. The required gates are classification accuracy at least 80%, composition compliance at least 85%, severe fact-conflict rate at most 5%, and blind type-recognition rate at least 75%.

The checked-in `worker/samples/expanded-image-quality-results.example.json` deliberately fails a gate and is never activation evidence. Provider credentials, fresh generated results, and independent human blind labels must be real; do not synthesize them.

## Direct activation

1. Confirm the saved passing report path, hashes, versions, and reviewer approval in the release evidence.
2. Deploy the migrated Server and matching Worker code together with the formal environment above.
3. Enable `WORKER_AUTO_RUN=true`. New formal tasks now use only the two-stage six-type path; do not run the old classifier alongside it.
4. Smoke-test one eligible, one below-threshold, one blocked-audit, one manual-regeneration, and one legacy-read fixture. Confirm only the eligible/publishable attempt appears in `GET /scene-images`, while all attempts remain queryable through `GET /scene-candidates?chapterId=...&includeAttempts=true`.
5. Confirm the normal reading UI renders only publishable `3:2` images and exposes no type selector, ranked classification, audit details, or blocked image URL.

## Rollback

If cutover verification fails, set `WORKER_AUTO_RUN=false` to stop new automatic dispatches, then redeploy the previous application release. Leave the additive migration, legacy rows, attempt history, and reader projections intact; do not drop the new tables, delete attempts, rewrite old image types, or batch-regenerate images. Diagnose and produce a new fresh quality report before attempting activation again.

Database rollback is intentionally non-destructive: the prior application continues to read its existing tables while the expanded schema remains in place. Any later schema cleanup requires a separate reviewed migration.

## Evidence status for this repository verification

Automated mock fixtures and the disposable local migration can verify behavior without external credentials. Production provider calls, a genuinely passing 60-sample report, human blind-review labels, a production database migration, and production activation are external evidence and must be reported as unavailable when they were not actually performed.
