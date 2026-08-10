# W4 Implementation Report

## Scope

Implemented Batch 4 canonical root resolution, `zh-hans` TextExtracts fetching/cleaning, and complete in-memory Wikisource `Book`/`Chapter[]` preparation. No route registration, repository/RPC integration, schema, or attribution persistence mapping from Batch 5 was added.

## TDD Evidence

- RED: `npx tsx --test test/wikisource.test.ts` failed because `onlineBookService.ts` did not export `prepareWikisourceImport`.
- GREEN: focused Wikisource tests passed 14/14.
- Full regression: `npm test` passed 26/26.
- Type safety: `npm run typecheck` passed.
- Build: `npm run build` passed.
- Repository hygiene: `git diff --check` passed.

## Implemented Behavior

- Resolves the numeric source page ID to the canonical main-namespace root title before direct-subpage discovery, while retaining the `zh-hans` variant title for display.
- Fetches official API TextExtracts in batches of at most 20 titles with at most three requests in flight and the existing trusted URL/timeout/User-Agent boundary.
- Requests `variant=zh-hans`, plain extracts, plain section formatting, and variant titles; a missing requested page fails the whole preparation.
- Splits text on blank lines, strips heading markers, navigation-only lines, edit controls, footnote markers, and template decoration while preserving navigation words inside normal prose.
- Builds stable book/chapter/block IDs from root page ID and discovered order; unreadable individual pages are omitted without renumbering later chapters.
- Rejects missing roots, no classified chapters, all-unreadable content, and final UTF-8 body size above 20 MiB; exactly 20 MiB passes.
- Returns only a fully validated in-memory `{ book, chapters }`; repository persistence remains downstream, so remote/parse/limit failures cannot produce a write.

## Self-review

- Contract/spec and W3 canonical-title integration: pass.
- Batch size/concurrency and trusted request target: pass.
- Cleaning preserves ordinary prose: pass.
- Complete validation before persistence boundary: pass.
- W5 routes/schema/repository attribution absent: pass.
- Concerns: none.
