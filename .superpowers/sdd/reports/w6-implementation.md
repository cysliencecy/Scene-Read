# W6 Implementation Report

## Scope

Implemented the mobile multi-source online-book flow for Chinese Wikisource and Project Gutenberg. Changes are limited to the approved mobile types, client, import screen, application flow, one focused mobile script, and this report.

## TDD Evidence

### RED

Command:

```powershell
cd mobile
npx tsx scripts/test-online-books.ts
```

Observed failure before production changes:

```text
TypeError: onlineBookSourceLabel is not a function
```

This confirmed that the source-label capability required by W6 did not exist.

### GREEN

The focused script now verifies:

- exact `中文维基文库` and `Project Gutenberg` labels;
- non-blocking partial-source warning copy;
- pagination warning preservation and de-duplication;
- `{ source, sourceBookId, visualStyle }` import payload;
- Chinese mappings for new Wikisource import errors and the generic fallback.

## Implementation

- Expanded mobile source types to `gutenberg | wikisource`, added `sourceErrors`, and retained source attribution on online and imported books.
- Added shared source labels, partial-failure warning copy, warning merge logic, and online error mapping.
- Changed online import to require the selected source explicitly.
- Updated the import screen to show per-result source labels and non-blocking partial-source warnings without disabling available results.
- Preserved and de-duplicated source warnings while loading more results.
- Matched imported search results by both source and source book ID to avoid cross-source collisions.

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

The worktree initially lacked dependencies. `npm ci` could not complete because the C drive was full (`ENOSPC`), so validation reused the already-installed dependencies from `F:\codexDemo\Scene Read\mobile\node_modules` through a local ignored directory junction. No dependency or lockfile change was made.

## Concerns

None in the W6 implementation. Real external API and persistence validation remain W7 work by contract.
