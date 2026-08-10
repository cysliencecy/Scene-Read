# Final Review Repair Report

## Scope

Repaired the two Important findings from `.superpowers/sdd/reviews/final-review.md` and removed the five exact EOF blank lines reported by the full-range whitespace check. No schema, mobile, unrelated documentation, external data, main worktree, or remote branch was changed.

## TDD Evidence

### RED: simplified search title

Added a search fixture whose root page contains:

```text
title: 紅樓夢
varianttitles['zh-hans']: 红楼梦
```

The test requires the root lookup to request `inprop=url|varianttitles` and the returned online-book card title to equal `红楼梦`.

Before the production change, the focused test failed because the actual request sent only `inprop=url`.

### RED: redirect confinement

Added a fetch mock that returns HTTP 302 with `Location: https://untrusted.example.test/books.json`. The test requires:

- `redirect: manual` on the single fetch call;
- exactly one fetch call;
- rejection with `BOOK_SOURCE_URL_REJECTED`.

Before the production change, the test received `BOOK_SOURCE_UNAVAILABLE` because redirect handling was not manual and 302 was treated as a generic unavailable response.

### GREEN

`server/src/wikisource.ts` now:

- requests root `varianttitles` and uses `varianttitles['zh-hans']` with the source title as fallback;
- sets fetch redirects to `manual`;
- rejects manual/opaque redirect responses as `BOOK_SOURCE_URL_REJECTED` before parsing or issuing another request.

The focused Wikisource suite passes 16/16, including both new regression tests.

## Whitespace Repair

Removed only the trailing EOF blank line from:

- `.superpowers/sdd/execution-plan.md`
- `changes/wikisource-whole-book-import/design.md`
- `changes/wikisource-whole-book-import/specs/online-book-search/spec.md`
- `changes/wikisource-whole-book-import/specs/source-attribution-and-safety/spec.md`
- `changes/wikisource-whole-book-import/tasks.md`

## Verification

All commands passed:

```text
npx tsx --test test/wikisource.test.ts (16/16)
npm test (37/37)
npm run typecheck
npm run build
git diff --check 4cd0be719c9592c89787cd6b56f08dc34a21179b HEAD
```

The final full-range whitespace check is executed against the repaired commit during handoff.

## Concerns

None. Redirects are intentionally rejected rather than followed, preserving the exact trusted MediaWiki API boundary.
