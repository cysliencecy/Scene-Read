# W2 Focused Repair Report

## Failed Review Receipt

- Wave: `W2`
- Reviewed range: `a277796f8ee433cc27a0472f89199b0e49de666c..07736d8049d45afc282c414b6c8a4fbd7ff9495a`
- Review: `.superpowers/sdd/reviews/w2-review.md`
- Verdict: `fail`
- State automation: manual fallback because the local `ssf`/spec-superflow CLI is unavailable.

## Important Finding Addressed

Search root normalization incorrectly discarded child-page hits whose suffix looked auxiliary, such as `西游记/目录`. W2 is responsible only for identifying the root work; deciding whether a child is an importable chapter belongs to W3.

## TDD Evidence

### Red

The Wikisource fixture was changed to require `西游记/目录` to contribute the `西游记` root. The targeted suite failed because the actual root-title requests omitted `西游记`.

### Green

`rootTitleFromSearchHit` now reduces every non-empty namespace-0 hit to the title segment before the first `/`. Auxiliary-page filtering is not performed during search and remains deferred to W3 chapter discovery.

### Additional Coverage

A separate fixture resolves two distinct root titles to the same canonical `pageid` and verifies only one online book is emitted, exercising resolved page-ID deduplication.

## Verification

- `npx tsx --test test/wikisource.test.ts`: 4 passed.
- `npm test`: 16 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.

## Scope

The repair changes only W2 root normalization and its deterministic fixtures. It does not add W3 chapter discovery behavior or modify other providers.

