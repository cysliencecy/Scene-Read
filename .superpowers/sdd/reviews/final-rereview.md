# Replacement Final Review: Wikisource Whole-Book Import

- Base: `4cd0be719c9592c89787cd6b56f08dc34a21179b`
- Head reviewed: `24a4b1910150922f75d902663b46d2922d5562bc`
- Verdict: `pass`
- Readiness: **Ready to merge locally.** No Critical or Important finding remains. No push or remote mutation was performed.

## Scope

Re-read `AGENTS.md` and all `docs/*.md`, then reviewed the approved proposal, all specs, design, tasks, execution contract, progress ledger, initial final review, final repair report, and the complete base-to-head diff. The broad review covered provider aggregation and partial failures; Wikisource search/root normalization; direct-child chapter discovery and natural ordering; `zh-hans` title/body handling; TextExtracts batching, concurrency, cleaning and limits; trusted request targets; atomic persistence, attribution, durable order and race recovery; HTTP routing; mobile labels, warnings, source-aware import and pagination de-duplication; schema migration and Gutenberg compatibility; documentation/live evidence; and range hygiene.

## Replacement verification of prior Important findings

1. **Simplified search titles — resolved.**

   - `server/src/wikisource.ts` now requests `inprop=url|varianttitles` for root search normalization and selects `varianttitles['zh-hans']`, falling back to the source title only when the variant is absent.
   - The new fixture uses distinct `紅樓夢`/`红楼梦` values, asserts the requested property, and proves the returned card title is simplified. This matches the proposal and recorded real API response shape.

2. **Redirect confinement — resolved.**

   - Every MediaWiki request now uses `redirect: 'manual'` and rejects 3xx/opaque redirect responses as `BOOK_SOURCE_URL_REJECTED` before JSON parsing or any second request.
   - The regression test returns a 302 to an untrusted hostname, asserts manual redirect mode, proves only one fetch occurs, and checks the stable rejection code. Initial URL validation remains exact HTTPS `zh.wikisource.org/w/api.php` validation.

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## Full-range assessment

- Provider searches remain concurrent and source-prioritized; one-source failure returns usable results plus `sourceErrors`, while all-source failure returns `BOOK_SOURCE_UNAVAILABLE`.
- Wikisource chapter hits normalize to stable root page IDs, direct main-namespace children are classified and naturally ordered, and pagination de-duplicates `(source, sourceBookId)` without collapsing equal IDs from different sources.
- Chapter discovery rejects the 201st valid chapter. TextExtracts uses `variant=zh-hans`, batches no more than 20 titles with at most three concurrent requests, fails the whole preparation on a missing batch page, cleans navigation/template residue, and enforces the final 20 MiB UTF-8 body limit before persistence.
- Import preparation completes before the single Supabase RPC. Source attribution is preserved, `chapter_order` is written with ordinality and read with deterministic legacy fallback, and duplicate/concurrent import recovery remains source-aware.
- HTTP and mobile flows accept both approved sources, reject unknown sources and invalid styles, expose exact source labels/non-blocking warnings, send source-aware imports, and retain local TXT import behavior.
- The schema migration remains compatible with existing Gutenberg records/callers through nullable new fields and the trailing default-null RPC attribution parameter.
- Documentation correctly distinguishes deterministic automated coverage and real read-only Wikisource evidence from the still-unperformed remote Supabase migration/write acceptance. That external operational step is documented and is not misrepresented as complete.
- The complete range contains no credentials, downloaded book bodies, binary response artifacts, temporary logs, dependency or lockfile changes, generated build output, or unrelated runtime features. The ignored mobile `node_modules` junction was not modified.

## Independent verification

Executed at reviewed head `24a4b1910150922f75d902663b46d2922d5562bc`:

- Server `npm test`: passed, **37/37**.
- Server `npm run typecheck`: passed.
- Server `npm run build`: passed.
- Mobile `npx tsx scripts/test-online-books.ts`: passed.
- Mobile `npx tsc --noEmit`: passed.
- Mobile `npm run test:scene-placement`: passed.
- Mobile `npm run test:reader-pagination`: passed, 5 pages.
- Mobile `npm run test:txt-import -- ..\docs\product-scope.md`: passed, 1 chapter / 37 blocks.
- Worker Python 3.13 unittest discovery with worktree `PYTHONPATH`: passed, **9/9**.
- `git diff --check 4cd0be719c9592c89787cd6b56f08dc34a21179b..HEAD`: passed with no output.

## Conclusion

The focused repair closes both initial final-review blockers without expanding scope or weakening existing behavior. The full feature range satisfies the approved search, whole-book import, attribution, safety, persistence, compatibility, mobile, and evidence requirements. It is ready for local merge, subject only to the already documented deployment-time Supabase schema migration and controlled remote persistence acceptance.
