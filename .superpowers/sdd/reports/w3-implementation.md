# W3 Implementation Report

## Scope

Implemented Batch 3 chapter discovery, classification, natural ordering, and the 200-chapter limit in `server/src/wikisource.ts`, with fixture coverage in `server/test/wikisource.test.ts`. No chapter extracts or content fetching from Batch 4 was added.

## TDD Evidence

- RED: `npx tsx --test test/wikisource.test.ts` failed because `discoverWikisourceChapters` was not exported by `wikisource.ts`.
- GREEN: the focused Wikisource suite passed 7/7 after the minimum implementation.
- Full regression: `npm test` passed 19/19.
- Type safety: `npm run typecheck` passed.
- Build: `npm run build` passed.
- Repository hygiene: `git diff --check` passed.

## Implemented Behavior

- Enumerates `list=allpages` with `apnamespace=0`, `aplimit=max`, and `apcontinue` until exhaustion.
- Accepts only direct children of the resolved root title and rejects nested or foreign-root pages.
- Rejects auxiliary directory, index, version, explanation, collation, preface/postface, appendix, and copyright titles.
- Recognizes `第<数字><回|章|节|卷>`, `<卷|篇|部><数字>`, and `上|中|下 + 卷|篇`.
- Parses Arabic and Chinese numbers, including place-value forms, then sorts by pattern category, numeric value, normalized title, and page ID.
- Returns stable 1-based `order` values and fails with `ONLINE_BOOK_TOO_MANY_CHAPTERS` on the 201st classified chapter without truncation.

## Self-review

- Contract/spec boundary: pass; only Batch 3 files and this report changed.
- Direct-subpage and namespace fence: pass.
- Required pattern and natural-sort coverage: pass.
- 200/201 exact boundary: pass.
- W4 extracts/content fetching absent: pass.
- Concerns: none.
