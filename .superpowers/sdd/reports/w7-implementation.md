# W7 Implementation Report

## Scope

Completed Batch 7 documentation and verification evidence only. No runtime product behavior, remote schema, remote data, main worktree, or remote branch was changed.

Updated:

- `server/README.md`
- `docs/decisions.md`
- `docs/supabase-setup.md`
- `docs/e2e-validation-v6-wikisource.md`

## Live Read-Only Validation

Validated the official Chinese Wikisource MediaWiki API for query `红楼梦`:

- search total: 855; first root hit pageid: `7683`;
- root source title: `紅樓夢`; `zh-hans` display title: `红楼梦`;
- canonical URL: `https://zh.wikisource.org/wiki/%E7%B4%85%E6%A8%93%E5%A4%A2`;
- direct main-namespace chapter children: 120;
- natural order: `第001回` through `第120回`;
- first chapter pageid: `9911`;
- first extract: 7,343 characters, 6,219 CJK characters, 10 substantial readable paragraphs;
- simplified `贾` and `宝` were present while traditional `賈` and `寶` were absent.

No response body or downloaded book fixture was saved.

## Diagnostic Evidence

Node 23 built-in `fetch` could not use the validation machine's Windows system proxy and timed out attempting direct `zh.wikisource.org:443` with `UND_ERR_CONNECT_TIMEOUT`. The exact URL and headers succeeded through PowerShell and Python. DNS, trusted URL validation, request headers, timeout, and recent provider changes were inspected.

Root-cause hypothesis confirmed: direct outbound HTTPS is blocked in this environment, while PowerShell and Python use the configured system proxy. This is environmental rather than a product defect. No proxy-specific runtime change was added.

## Supabase Compatibility

Used the configured project client for a read-only `source_attribution` column query. It returned PostgreSQL `42703`: `column books.source_attribution does not exist`.

Consequently:

- remote schema migration was not run;
- the import RPC was not called;
- no book, chapter, cover, or cleanup record was created;
- full remote atomic import and duplicate-import validation remain pending explicit schema migration and write authorization.

## Regression Evidence

All contract commands passed:

```text
server: npm run typecheck
server: npm test (35/35)
server: npm run build
mobile: npx tsx scripts/test-online-books.ts
mobile: npx tsc --noEmit
mobile: npm run test:scene-placement
mobile: npm run test:reader-pagination
mobile: npm run test:txt-import -- ..\docs\product-scope.md
worker: Python 3.13 unittest (9/9)
repository: git diff --check
```

## Concerns

- The current validation machine needs Node-compatible proxy configuration or direct HTTPS access for the local Node API to reach external providers.
- The configured remote Supabase project is not on the V6 schema, so remote whole-book persistence has not been validated.

Both constraints are documented without weakening trusted-URL controls or performing unauthorized writes.
