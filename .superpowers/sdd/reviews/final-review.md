# Final Review: Wikisource Whole-Book Import

- Base: `4cd0be719c9592c89787cd6b56f08dc34a21179b`
- Head: `a1f1ee31fcb348e1fdab7b11bfcdfbb6fcd77498`
- Verdict: `fail`
- Readiness: **Not ready to merge.** Two Important findings remain; no Critical finding was found.

## Scope reviewed

Reviewed the complete base-to-head diff against `AGENTS.md`, all repository `docs/*.md`, the approved proposal/specs/design/tasks/execution contract, SDD progress, implementation reports, and every wave review/re-review. The review covered provider aggregation and partial failures; Wikisource root normalization, chapter discovery and natural ordering, `zh-hans` TextExtracts batching/concurrency/cleaning/limits; atomic Supabase persistence, attribution, durable chapter order and race recovery; HTTP routing; mobile labels, warnings, import flow and pagination de-duplication; schema compatibility; documentation and live evidence; and range hygiene.

## Findings

### Critical

None.

### Important

1. **Wikisource search cards do not use the required simplified book title.**

   - Files: `server/src/wikisource.ts:487-515`, `server/test/wikisource.test.ts:134-177`
   - The approved proposal requires `zh-hans` for book titles, chapter titles, and body text, and the design explicitly says book and chapter display titles use the API's `zh-hans` title. The root-resolution request used during import asks for `varianttitles` and correctly selects `varianttitles['zh-hans']`, but the search root lookup requests only `inprop=url` and maps `title: rootPage.title.trim()`.
   - The real API evidence in `docs/e2e-validation-v6-wikisource.md:27-31` demonstrates the mismatch: the source title is `紅樓夢`, while the `zh-hans` display title is `红楼梦`. A live read-only request reproduced that response shape. Therefore a user searching `红楼梦` sees the traditional title on the result card even though the approved behavior is simplified display.
   - The focused test only asserts the global `variant=zh-hans` query parameter; its fixture omits `varianttitles` and never asserts the returned title, so it cannot catch the defect.
   - Fix by requesting `varianttitles` in the search root lookup, selecting `rootPage.varianttitles?.['zh-hans']` with the source title as fallback, and adding a fixture assertion where those two titles differ.

2. **The trusted-target boundary does not constrain HTTP redirects.**

   - File: `server/src/wikisource.ts:90-156`
   - Initial configuration is strictly validated as `https://zh.wikisource.org/w/api.php`, but `requestMediaWiki` calls `fetch` with the default `redirect: 'follow'` and accepts the resulting response without validating `response.url`. An HTTP redirect from the approved endpoint can consequently cause the service to request and parse JSON from a non-approved host.
   - This violates the approved requirement that search and body requests remain on the configured trusted Wikimedia HTTPS target. The canonical-page URL validation later in the file protects displayed metadata only; it does not protect the network request itself.
   - Existing URL tests prove rejection of an initially untrusted URL but do not simulate a redirect.
   - Fix by disabling automatic redirects (or validating every redirect/final response URL against the same exact endpoint policy) and add a regression test proving a redirect to another host is rejected as `BOOK_SOURCE_URL_REJECTED` without fetching that host.

### Minor

1. `git diff --check` reports a trailing blank line at EOF in five planning files: `.superpowers/sdd/execution-plan.md`, `changes/wikisource-whole-book-import/design.md`, all three listed spec/task files reported by the command. This is documentation-only whitespace and does not affect runtime behavior.

## Confirmed strengths

- Provider searches run concurrently, preserve source priority, return usable results with normalized `sourceErrors` on one-source failure, and fail only when all providers fail.
- Root page IDs are stable, chapter hits are collapsed per response, direct main-namespace chapter pages are classified and naturally sorted, and mobile pagination de-duplicates by `(source, sourceBookId)` while retaining first-seen order.
- Chapter discovery enforces the 200-chapter limit; TextExtracts uses `variant=zh-hans`, batches of 20, at most three concurrent requests, all-or-nothing batch failure, readable-text filtering, navigation cleanup, and a final UTF-8 20 MiB limit before persistence.
- Wikisource persistence is performed only after full preparation through one RPC. Attribution is mapped end-to-end, `chapter_order` is written with ordinality and read deterministically, legacy rows remain readable, and duplicate/race recovery is source-aware.
- The HTTP route accepts both known sources, rejects unknown sources and invalid visual styles, and preserves provider error statuses.
- Mobile UI shows exact source labels, non-blocking source warnings, source-aware import requests/results, attribution-capable types, and preserves the local-file import path.
- The schema migration is idempotent for the new nullable columns/order constraint, removes the legacy RPC overload, retains Gutenberg compatibility through a trailing default-null attribution parameter, and preserves the composite source identity index.
- Documentation accurately records the unperformed remote schema migration/import and does not overstate live database acceptance.
- The reviewed range contains no credentials, downloaded book bodies, binary response artifacts, dependency/lockfile changes, or unrelated runtime features.

## Verification

Executed at head `a1f1ee31fcb348e1fdab7b11bfcdfbb6fcd77498`:

- Server `npm test`: passed, 35/35.
- Server `npm run typecheck`: passed.
- Server `npm run build`: passed.
- Mobile `npx tsx scripts/test-online-books.ts`: passed.
- Mobile `npx tsc --noEmit`: passed.
- Mobile scene-placement, reader-pagination, and TXT-import regressions: passed.
- Worker Python 3.13 unittest discovery: passed, 9/9.
- `git diff --check` found only the Minor documentation EOF whitespace listed above.
- Worktree/index/HEAD were not changed by review except for this required report.

## Assessment

The core whole-book import implementation is well tested and the earlier durable-order and pagination-identity defects are resolved. However, the search display still violates the approved simplified-title behavior, and the external request layer does not fully enforce the trusted-host boundary across redirects. Both are focused repairs but are merge-blocking under the approved proposal and security specification. Re-review the repaired range before marking the feature ready.
