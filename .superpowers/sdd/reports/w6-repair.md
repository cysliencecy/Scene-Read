# W6 Repair Report

## Review Finding

The initial W6 review found that loading another search page appended duplicate books. Wikisource chapter hits can resolve to the same root work on separate server pages, so the mobile aggregate must preserve unique `(source, sourceBookId)` identities across pages.

## TDD Evidence

### RED

Extended `mobile/scripts/test-online-books.ts` with two pages containing:

- a first-page `wikisource/42` item;
- a distinct `gutenberg/42` item, proving IDs are scoped by source;
- a repeated second-page `wikisource/42` item with a different title;
- a new second-page `wikisource/43` item.

Command:

```powershell
cd mobile
npx tsx scripts/test-online-books.ts
```

The assertion failed because the actual output contained the repeated second-page `wikisource/42` item.

### GREEN

`mergeOnlineBookSearchPages` now filters the combined item list by `(source, sourceBookId)`, retaining the first occurrence and its ordering. The existing `(source, code)` source-error merge and de-duplication behavior is unchanged.

The focused test passes and proves:

- an overlapping book appears once;
- the first-seen book metadata and order are preserved;
- the same `sourceBookId` from a different source remains present;
- new second-page books are appended;
- source warnings remain preserved and de-duplicated.

## Verification

All commands passed:

```text
npx tsx scripts/test-online-books.ts
npx tsc --noEmit
npm run test:scene-placement
npm run test:reader-pagination
npm run test:txt-import -- ..\docs\product-scope.md
git diff --check
```

Validation reused the existing ignored dependency junction. `npm ci` was not run, and no dependency or lockfile changed.

## Concerns

None. The repair is limited to the failed review finding and its regression evidence.
