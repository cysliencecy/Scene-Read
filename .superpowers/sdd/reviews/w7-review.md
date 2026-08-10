# W7 Review: Documentation and Live Wikisource Validation

## Scope

- Change: `changes/wikisource-whole-book-import`
- Wave: W7 / Batch 7
- Base: `2da1ac3ac55bacecd1dbb6887d46a17dad5f1ed3`
- Head: `9306adc9401fa6b0ca605b006d803ec8893d2a2a`
- Reviewed the complete documentation-only range against Batch 7, the completion gate/definition, the implemented server behavior, and `supabase/schema.sql`.

## Strengths

- `server/README.md` accurately documents the two-provider API, composite source identity, partial-provider failure behavior, source-aware import request, stable errors, import limits, trusted Wikisource target, and attribution semantics.
- `docs/supabase-setup.md` correctly describes the nullable `source_attribution` column, the replaced RPC signature, its trailing defaulted parameter, durable `chapter_order`, the existing source identity index, and the need to execute the full schema rather than patching only one column.
- The license language is appropriately narrow: Wikisource imports are marked `authorized`, retain the canonical source URL and attribution, and are not represented as uniformly public domain.
- The live validation report clearly separates read-only official API evidence from deterministic fixture coverage and from the unperformed remote persistence validation.
- The Node proxy diagnosis is internally consistent with the implementation: the code uses the correct HTTPS endpoint, headers, and timeout, while Node 23 built-in `fetch` does not automatically consume the recorded Windows system proxy. The report does not weaken trusted-target validation or claim that the local Node API completed the live call.
- The remote PostgreSQL `42703` result is used only as schema-version evidence. The report explicitly states that migration, RPC import, duplicate-import validation, cleanup, and all remote writes were not performed.
- The W7 range contains documentation and its implementation report only; it includes no runtime changes, secrets, downloaded book text, response fixtures, temporary logs, dependency changes, or unrelated generated files.

## Independent Evidence Checks

Read-only calls to the official API independently reproduced the recorded facts on 2026-08-10:

- query `红楼梦`: 855 total hits; first result/root pageid `7683`;
- root source title `紅樓夢`, `zh-hans` title `红楼梦`, and the documented canonical URL;
- 120 direct main-namespace child pages, from `第001回` through `第120回`;
- first chapter pageid `9911`, 7,343 characters, 6,219 CJK characters, 14 non-empty paragraphs, 10 paragraphs of at least 50 characters, and a 445-character first substantial paragraph;
- simplified `贾`/`宝` present and traditional `賈`/`寶` absent.

The remote Supabase query could not be independently repeated from this clean worktree because no Supabase credentials are present. This is consistent with the no-secret requirement. The documented `42703` statement matches the expected PostgREST/PostgreSQL response when `books.source_attribution` is absent, and the repository schema and RPC mapping match the stated required migration.

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## Regression Verification

Executed at head `9306adc9401fa6b0ca605b006d803ec8893d2a2a`:

- Server `npm run typecheck` - passed.
- Server `npm test` - passed, 35/35.
- Server `npm run build` - passed.
- Mobile `npx tsx scripts/test-online-books.ts` - passed.
- Mobile `npx tsc --noEmit` - passed.
- Mobile `npm run test:scene-placement` - passed.
- Mobile `npm run test:reader-pagination` - passed, 5 pages.
- Mobile `npm run test:txt-import -- ..\docs\product-scope.md` - passed, 1 chapter and 37 blocks.
- Worker Python 3.13 unittest discovery - passed, 9/9.
- `git diff --check 2da1ac3ac55bacecd1dbb6887d46a17dad5f1ed3 9306adc9401fa6b0ca605b006d803ec8893d2a2a` - passed.
- The worktree was clean before this review report was created; no index or HEAD change was made.

## Assessment

**Ready to complete W7?** Yes.

Batch 7 records reproducible real search, root resolution, complete direct-chapter discovery, natural ordering, and simplified first-chapter evidence. The full regression suite passes. The missing remote schema is accurately captured as the completion definition's permitted external condition: no migration or write was authorized, so the report leaves atomic persistence and duplicate-import validation pending rather than overstating completion. Documentation matches the implemented API, safety boundaries, schema, and attribution model, and no Critical or Important issue remains.

ssf execution review changes/wikisource-whole-book-import --wave W7 --base 2da1ac3ac55bacecd1dbb6887d46a17dad5f1ed3 --head 9306adc9401fa6b0ca605b006d803ec8893d2a2a --report .superpowers/sdd/reviews/w7-review.md --verdict pass
