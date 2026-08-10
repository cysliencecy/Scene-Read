# Wave W1 / Batch 1 Implementation Report

## Scope

Implemented only the approved Batch 1 multi-provider contract and search aggregation skeleton. No Wikisource API behavior, route changes, persistence changes, or mobile changes are included.

Branch/worktree preflight confirmed the isolated branch `wikisource-whole-book-import` at `C:\Users\18270\orca\workspaces\Scene Read\wikisource-whole-book-import`; `main` was not edited. The contract records that local spec-superflow state automation is unavailable, so no state script was run.

## RED Evidence

1. Added `server/test/onlineBookAggregation.test.ts` before production changes, covering:
   - both providers succeeding, with Wikisource items before Gutenberg items;
   - one provider failing while the other returns results plus `sourceErrors`;
   - all providers failing with `BOOK_SOURCE_UNAVAILABLE`.
2. The first command attempt exposed a worktree setup prerequisite (`ERR_MODULE_NOT_FOUND` for the existing `fast-xml-parser` dependency). Ran `npm install`; it produced no tracked dependency changes.
3. Re-ran:

   ```powershell
   npx tsx --test test/onlineBookAggregation.test.ts
   ```

   The test process failed with:

   ```text
   SyntaxError: The requested module '../src/onlineBookService.js' does not provide an export named 'aggregateOnlineBookSearch'
   tests 1; pass 0; fail 1
   ```

   This is the intended RED: the approved provider/aggregation implementation did not yet exist.

## GREEN Evidence

After the minimal implementation:

```text
npx tsx --test test/onlineBookAggregation.test.ts
tests 3; pass 3; fail 0

npx tsx --test test/onlineBooks.test.ts
tests 6; pass 6; fail 0

npm run typecheck
tsc --noEmit (exit 0)

npm test
tests 9; pass 9; fail 0

git diff --check
exit 0
```

## Changed Files

- `server/src/types.ts`
  - Added `OnlineBookSource`, `OnlineBookSourceError`, `sourceErrors`, and optional source attribution fields.
- `server/src/onlineBookProvider.ts`
  - Added the provider contract, typed registry, shared online-book error, and provider error normalization.
- `server/src/gutendex.ts`
  - Preserved Gutenberg normalization/search/download behavior, returned an empty provider error list, and exposed a Gutenberg provider adapter.
- `server/src/onlineBookService.ts`
  - Added concurrent `Promise.allSettled` aggregation, Wikisource-first successful result ordering, partial failure reporting, all-failure error behavior, source-aware imported-ID lookup, and the default Gutenberg registration.
- `server/test/onlineBookAggregation.test.ts`
  - Added the three required aggregation scenarios.
- `server/test/onlineBooks.test.ts`
  - Extended Gutenberg pagination regression coverage for the compatible empty `sourceErrors` field.
- `.superpowers/sdd/reports/w1-implementation.md`
  - This implementation evidence.

## Risks And Follow-up Boundaries

- The runtime registry intentionally contains only Gutenberg in Batch 1. Batch 2 must register the Wikisource provider; no Wikisource network request exists yet.
- The Gutenberg adapter receives the existing import implementation from the service to avoid moving stable parsing/persistence code in this batch. Import dispatch remains a Batch 5 responsibility.
- `sourceAttribution` exists only at the shared type boundary here; database/RPC mapping remains Batch 5.
- Aggregate pagination follows the approved sum/any model and does not implement cross-provider ranking or cursors.

## Commit Scope

Commit only the seven files listed above. No secrets, downloaded book data, package changes, or unrelated worktree changes are included.
