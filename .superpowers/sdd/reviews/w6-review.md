# W6 Review: Mobile Multi-Source Experience

## Scope

- Change: `changes/wikisource-whole-book-import`
- Wave: W6 / Batch 6
- Base: `c29cc69dd96769d18be39aecc088d2ac46fbd2d8`
- Head: `d9381a40154c21bb571951acdb90aea1a3a4a783`
- Reviewed the complete range against the approved execution contract, Batch 6 tasks, and the online-book-search specification.

## Strengths

- The mobile source model now covers both `wikisource` and `gutenberg`, preserves optional source attribution, and consumes the server's `sourceErrors` contract.
- Result cards display the exact required source labels, and partial-source failures are rendered as non-blocking warnings without disabling available books.
- Online import sends the required `{ source, sourceBookId, visualStyle }` payload, while imported-result reconciliation uses both source and source book ID.
- Wikisource import failures have focused Chinese messages and the existing local-file import path remains unchanged.
- Pagination preserves and de-duplicates repeated source warnings by `(source, code)`.

## Findings

### Critical

None.

### Important

1. **Loaded search pages do not de-duplicate books by their stable source identity.**

   - Files: `mobile/src/api/client.ts:92-104`, `mobile/src/screens/ImportScreen.tsx:133-136`, `mobile/scripts/test-online-books.ts:16-37`
   - `mergeOnlineBookSearchPages` de-duplicates `sourceErrors`, but combines books with `items: [...current.items, ...incoming.items]`.
   - Wikisource root-page de-duplication is scoped to each server response. Different MediaWiki search pages can contain different chapter hits that resolve to the same root `pageid`, so loading another page can repeat the same `(source, sourceBookId)` already displayed.
   - The combined mobile list then renders duplicate cards and duplicate React keys because the card key is `${book.source}-${book.sourceBookId}`. This breaks the intended root-work result identity during the normal load-more flow and can produce unstable reconciliation behavior.
   - The focused mobile test uses empty `items` on both pages, so it only proves warning preservation/de-duplication and cannot detect this defect.
   - Fix by de-duplicating the merged `items` using `(source, sourceBookId)`, preserving first-seen ordering, and add a regression case where the second page repeats one book and adds another.

### Minor

None.

## Verification

Executed from `mobile/` at head `d9381a40154c21bb571951acdb90aea1a3a4a783`:

- `npx tsx scripts/test-online-books.ts` — passed.
- `npx tsc --noEmit` — passed.
- `npm run test:scene-placement` — passed.
- `npm run test:reader-pagination` — passed (5 pages).
- `npm run test:txt-import -- ..\docs\product-scope.md` — passed (1 chapter, 37 blocks).
- `git diff --check c29cc69dd96769d18be39aecc088d2ac46fbd2d8 d9381a40154c21bb571951acdb90aea1a3a4a783` — passed.
- `git status --short` was empty before writing this report. `mobile/node_modules` is an ignored junction to `F:\codexDemo\Scene Read\mobile\node_modules`; it did not change tracked dependencies or lockfiles.

## Assessment

**Ready to proceed to the dependent wave?** No.

The required source labels, partial-failure behavior, source-aware import request, error copy, typecheck, and existing regressions are sound. However, the load-more helper does not preserve unique book identity across the combined result list, and the current test omits item pagination entirely. This Important issue requires a focused repair and replacement passing review before Batch 7.

ssf execution review changes/wikisource-whole-book-import --wave W6 --base c29cc69dd96769d18be39aecc088d2ac46fbd2d8 --head d9381a40154c21bb571951acdb90aea1a3a4a783 --report .superpowers/sdd/reviews/w6-review.md --verdict fail
