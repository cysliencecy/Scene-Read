# Wave W1 Focused Repair Report

## Review Finding

Addressed the single retryable W1 review gap from `.superpowers/sdd/reviews/w1-review.md`: missing focused regression evidence for Gutenberg provider import delegation and concrete provider error-code compatibility.

## Repair Scope

Only test evidence changed. No production source, API, provider behavior, schema, mobile code, or Wikisource implementation was modified.

## Added Evidence

- `server/test/onlineBooks.test.ts`
  - Proves `createGutendexProvider(importFn).importBook` forwards the exact `sourceBookId` and `visualStyle` arguments.
  - Proves the adapter returns the exact object returned by `importFn` using reference equality.
  - Proves direct Gutenberg search failure is still an instance of the re-exported shared `OnlineBookError`, with `BOOK_SOURCE_UNAVAILABLE` and status `502` after the error-class move.
- `server/test/onlineBookAggregation.test.ts`
  - Proves a rejected provider throwing `OnlineBookError('ONLINE_BOOK_NOT_FOUND', 404)` retains `ONLINE_BOOK_NOT_FOUND` in aggregate `sourceErrors` rather than falling back to the generic code.

The tests passed immediately against the reviewed implementation, confirming an evidence gap rather than a production defect.

## Verification

```text
npx tsx --test test/onlineBookAggregation.test.ts
tests 4; pass 4; fail 0

npx tsx --test test/onlineBooks.test.ts
tests 8; pass 8; fail 0

npm test
tests 12; pass 12; fail 0

npm run typecheck
tsc --noEmit (exit 0)

npm run build
tsc -p tsconfig.json (exit 0)

git diff --check
exit 0
```

## Risks

None introduced. The repair adds deterministic mock-based regression coverage only and makes no runtime changes.

## Commit Scope

- `server/test/onlineBookAggregation.test.ts`
- `server/test/onlineBooks.test.ts`
- `.superpowers/sdd/reports/w1-repair.md`
