# Wave W1 / Batch 1 Review

## Review Range

- Base: `8a4a5b08e9ca2d415903872a778c0f860c912791`
- Head: `d0be862bf2fca9d34d07ead265a9062563e6cfef`
- Commit: `d0be862 feat(server): add online book provider aggregation`
- Diff: `git diff 8a4a5b0...d0be862`

## Scope Assessment

The diff is limited to the Batch 1 provider contract, registry, aggregation service, Gutenberg adapter/shared types, aggregation tests, Gutenberg regression assertion, and the W1 implementation report. It does not add Wikisource API behavior, import routing, persistence/schema changes, or mobile behavior. This matches the approved Batch 1 scope.

The provider boundary is reasonable for this wave: HTTP search continues through `searchOnlineBooks`, aggregation consumes only `OnlineBookProvider`, and the runtime registry intentionally contains only Gutenberg until Batch 2. Import dispatch remains explicitly deferred to Batch 5.

## Standards / Code Quality

### Critical

None.

### Important

None.

### Minor

- `server/test/onlineBookAggregation.test.ts:57`: the partial-failure test throws a plain `Error`, so it proves fallback to `BOOK_SOURCE_UNAVAILABLE` but does not exercise `normalizeOnlineBookProviderError` preserving the code from an `OnlineBookError`. This branch is part of the new Batch 1 error-normalization boundary and should have a direct regression assertion.

No documented-standard violations or material code smells were found. The registry, error type, and aggregation function are small and cohesive; Gutenberg's existing normalization and download/parsing paths were not unnecessarily rewritten.

## Spec / Contract Compliance

### Critical

None.

### Important

- **Gutenberg compatibility evidence is incomplete.** `execution-contract.md` requires existing Gutenberg search, download, deduplication, and import behavior to remain compatible, and Batch 1 completion requires Gutenberg regression tests. `tasks.md` further calls for compatibility confirmation of fields, pagination, and error behavior. However, `server/test/onlineBooks.test.ts:43` only extends the existing successful-pagination test with `sourceErrors: []`; no test covers a Gutenberg search failure/error code after moving `OnlineBookError`, and no test calls `createGutendexProvider(...).importBook` to prove the new adapter delegates unchanged. In `server/test/onlineBookAggregation.test.ts:25`, the provider import method is explicitly a non-used stub. The implementation appears compatible on inspection, but the approved review gate requires regression evidence, not inspection alone. Add focused tests for Gutenberg provider delegation and error-code compatibility before passing W1.

### Minor

None beyond the error-normalization branch noted under code quality.

The implemented aggregation semantics otherwise match the contract and design: provider searches start concurrently through `Promise.allSettled`, successful results are ordered Wikisource before Gutenberg, one failure returns remaining results plus `sourceErrors`, and all failures throw `BOOK_SOURCE_UNAVAILABLE`. The aggregation tests are deterministic and genuinely execute those branches.

## Test Evidence

Executed from `server/` at head `d0be862`:

- `npx tsx --test test/onlineBookAggregation.test.ts` — 3/3 passed.
- `npx tsx --test test/onlineBooks.test.ts` — 6/6 passed.
- `npm test` — 9/9 passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `git diff --check 8a4a5b0...d0be862` — passed.
- `git status --short` before this review report — clean.

## Verdict

**fail**

Reason: one Important contract/test-evidence gap remains. No production-code defect was demonstrated, but W1 should not pass its Gutenberg compatibility review gate until the new provider adapter and error compatibility are covered by focused regression tests.
