# Wave W1 / Batch 1 Replacement Review

## Review Range

- Base: `8a4a5b08e9ca2d415903872a778c0f860c912791`
- Head: `d996bc74e84dddf33502746727bf6d4f8a379a59`
- Commits:
  - `d0be862 feat(server): add online book provider aggregation`
  - `8246403 review: record W1 compatibility test gap`
  - `d996bc7 test(server): cover provider compatibility`
- Diff: `git diff 8a4a5b0...d996bc7`

## Replacement Review Result

The prior Important finding is resolved with deterministic regression tests:

- `server/test/onlineBooks.test.ts` proves `createGutendexProvider` forwards the exact `sourceBookId` and `visualStyle`, then returns the same import-result object by reference.
- `server/test/onlineBookAggregation.test.ts` proves a concrete `OnlineBookError('ONLINE_BOOK_NOT_FOUND', 404)` retains its code in partial-failure `sourceErrors`.
- `server/test/onlineBooks.test.ts` proves a direct Gutenberg 503 response still rejects with the re-exported shared `OnlineBookError`, code `BOOK_SOURCE_UNAVAILABLE`, and status `502`.

The repair commit changes only the two focused test files and its repair report. Across the complete range, production changes remain limited to approved Batch 1. The other additions are W1 implementation/review/progress records. No Wikisource API behavior, route dispatch, schema/persistence, or mobile implementation was introduced.

## Standards / Code Quality

### Critical

None.

### Important

None.

### Minor

None.

The added tests exercise public behavior, restore global fetch and environment state in `finally`, and use reference equality where adapter transparency is the requirement. No production code was changed merely to satisfy the review.

## Spec / Contract Compliance

### Critical

None.

### Important

None.

### Minor

None.

Batch 1 now has direct evidence for dual success, generic partial failure, concrete partial-failure error preservation, all-provider failure, Gutenberg normalized fields and pagination, Gutenberg provider import delegation, and Gutenberg direct error compatibility. The provider boundary, result ordering, partial-failure semantics, all-failure behavior, and Gutenberg compatibility satisfy the W1 review gate.

## Test Evidence

Executed from `server/` at head `d996bc7`:

- `npx tsx --test test/onlineBookAggregation.test.ts` — 4/4 passed.
- `npx tsx --test test/onlineBooks.test.ts` — 8/8 passed.
- `npm test` — 12/12 passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `git diff --check 8a4a5b0...d996bc7` — passed.
- `git status --short` before this replacement report — clean.

## Verdict

**pass**

No Critical or Important findings remain. W1 may advance to the next approved batch.
