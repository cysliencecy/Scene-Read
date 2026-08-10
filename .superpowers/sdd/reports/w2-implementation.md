# Wave W2 / Batch 2 Implementation Report

## Scope

Implemented only the approved Wikisource search and root-work normalization boundary:

- trusted Chinese Wikisource MediaWiki API configuration;
- injectable/mockable fetch client with timeout and User-Agent;
- main-namespace search using simplified Chinese variant parameters;
- logical page offset and continuation-to-`hasNextPage` mapping;
- chapter-subpage to root-title reduction;
- auxiliary subpage exclusion;
- root metadata lookup, stable root `pageid`, canonical URL, and same-page deduplication;
- provider factory that accepts a later import implementation without implementing import here.

No `allpages` chapter discovery, chapter classification/order, TextExtracts body retrieval, persistence, route registration, or mobile behavior is included.

## RED Evidence

Created `server/test/wikisource.test.ts` before production code. The first run:

```powershell
npx tsx --test test/wikisource.test.ts
```

failed with:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../server/src/wikisource.js'
tests 1; pass 0; fail 1
```

This confirmed the approved Wikisource search client/provider did not exist.

During URL-boundary refinement, adding a fixture for `https://zh.wikisource.org:444/w/api.php` produced a focused RED: the mock fetch was reached and the error became `BOOK_SOURCE_UNAVAILABLE` instead of `BOOK_SOURCE_URL_REJECTED`. Adding the non-default-port rejection made this boundary GREEN.

## GREEN Evidence

```text
npx tsx --test test/wikisource.test.ts
tests 3; pass 3; fail 0

npm run typecheck
tsc --noEmit (exit 0)

npm test
tests 15; pass 15; fail 0

npm run build
tsc -p tsconfig.json (exit 0)

git diff --check
exit 0
```

All test fetches are injected fixtures; no real network request is required.

## Changed Files

- `server/src/wikisource.ts`
  - Added the scoped MediaWiki search client, root normalization, trusted URL validation, provider factory, and unified results.
- `server/test/wikisource.test.ts`
  - Added deterministic fixtures for root/direct hit merging, duplicate roots, auxiliary pages, stable root pageids, canonical URLs, logical continuation, simplified query parameters, trusted URL acceptance, and rejected URL targets.
- `server/.env.example`
  - Documented the only accepted Wikisource API endpoint.
- `.superpowers/sdd/reports/w2-implementation.md`
  - This evidence report.

## Risks And Deferred Work

- `total` reflects MediaWiki search hits rather than globally deduplicated works; the approved page-number protocol does not provide a cross-page unique-work count.
- The search client maps MediaWiki continuation availability to `hasNextPage`; it does not consume every continuation page into one response, preserving the approved logical pagination model.
- The runtime provider registry is not changed in this batch. Registration and import dispatch remain later service/routing work after whole-book import exists.
- Chapter discovery via `list=allpages`, chapter ordering, content extraction, limits, and persistence are explicitly deferred to Batches 3-5.

## Commit Scope

Commit only the four files listed above. No secrets, downloaded content, generated fixtures, or unrelated changes are included.
