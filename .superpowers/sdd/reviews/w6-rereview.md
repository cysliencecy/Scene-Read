# W6 Replacement Review: Mobile Multi-Source Experience

## Scope

- Change: `changes/wikisource-whole-book-import`
- Wave: W6 / Batch 6 replacement review
- Base: `c29cc69dd96769d18be39aecc088d2ac46fbd2d8`
- Repaired head: `c10fab2bb27a5897c2cacb6a77f649c3387312a8`
- Read the initial failed review and W6 repair report, inspected the focused repair and the complete W6 range, and revalidated the approved Batch 6 behavior.

## Repair Verification

- `mobile/src/api/client.ts` now de-duplicates the combined page items by `(source, sourceBookId)`.
- Filtering the current page before the incoming page retains the first-seen object and preserves the combined first-seen order.
- The identity includes `source`, so equal `sourceBookId` values from Wikisource and Gutenberg remain distinct.
- Source warning preservation and de-duplication remains independently keyed by `(source, code)`.
- `mobile/scripts/test-online-books.ts` exercises all of those properties with a repeated `wikisource/42`, a distinct `gutenberg/42`, and a new `wikisource/43`. It also verifies that the first Wikisource title wins.

## Findings

### Critical

None.

### Important

None. The prior pagination de-duplication finding is resolved.

### Minor

None.

## Complete W6 Behavior

- Search cards retain the exact `中文维基文库` and `Project Gutenberg` source labels.
- Partial-source failures remain visible as non-blocking, de-duplicated warnings while available results can still be selected.
- Loading more preserves unique book identities, first-seen ordering, warning state, and the incoming pagination metadata.
- Online import still sends `{ source, sourceBookId, visualStyle }`, and imported-result matching remains source-aware.
- The new Wikisource error codes retain their Chinese messages, mobile types cover both sources and source attribution, and the local TXT import regression remains intact.

## Verification

Executed from `mobile/` at head `c10fab2bb27a5897c2cacb6a77f649c3387312a8`:

- `npx tsx scripts/test-online-books.ts` - passed.
- `npx tsc --noEmit` - passed.
- `npm run test:scene-placement` - passed.
- `npm run test:reader-pagination` - passed (5 pages).
- `npm run test:txt-import -- ..\docs\product-scope.md` - passed (1 chapter, 37 blocks).
- `git diff --check c29cc69dd96769d18be39aecc088d2ac46fbd2d8 c10fab2bb27a5897c2cacb6a77f649c3387312a8` - passed.
- The worktree was clean before this report was created. No dependency, lockfile, index, or HEAD changes were made during review.

## Assessment

**Ready to proceed to the dependent wave?** Yes.

The previous Important defect now has a focused implementation repair and meaningful regression coverage. The complete W6 range satisfies the mobile source-label, partial-failure, source-aware import, attribution, pagination merge, and existing-regression obligations. No Critical or Important finding remains.

ssf execution review changes/wikisource-whole-book-import --wave W6 --base c29cc69dd96769d18be39aecc088d2ac46fbd2d8 --head c10fab2bb27a5897c2cacb6a77f649c3387312a8 --report .superpowers/sdd/reviews/w6-rereview.md --verdict pass
