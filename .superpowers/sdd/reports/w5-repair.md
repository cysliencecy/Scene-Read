# W5 Durable Chapter Order Repair

## Finding

The initial W5 review found that online-import chapters shared the transaction timestamp from `now()` and were later ordered only by `created_at`, so database reads could lose W4 natural order.

## TDD Evidence

- RED: `npx tsx --test test/onlineBooks.test.ts` failed because schema lacked `chapter_order`/`WITH ORDINALITY` and repository reads lacked the required order chain.
- GREEN: focused online-book tests passed 12/12.
- Full regression: `npm test` passed 35/35, including Wikisource and Gutenberg import coverage.
- Type safety: `npm run typecheck` passed.
- Build: `npm run build` passed.
- Repository hygiene: `git diff --check` passed.

## Repair

- Added nullable `chapters.chapter_order` with an idempotent migration and positive-value constraint; existing rows remain valid with `NULL`.
- Extended Supabase chapter Row/Insert/Update types with nullable `chapter_order`.
- Changed the existing atomic `import_online_book` loop to use `jsonb_array_elements(p_chapters) WITH ORDINALITY` and persist each 1-based ordinal.
- Changed `listChaptersByBook` ordering to `chapter_order ASC NULLS LAST`, then `created_at ASC`, then `id ASC`, giving new rows durable natural order and legacy rows deterministic fallback order.
- Added a three-chapter `1, 2, 10` test proving the repository preserves RPC array order and statically checks the column, ordinality assignment, insert column, and read order together.
- Preserved the attribution parameter/default, legacy overload drop, single RPC transaction, and Gutenberg behavior.

## Self-review

- Review finding resolved: pass.
- New numbered rows before legacy null rows: pass.
- Deterministic legacy fallback: pass.
- Migration nullable/backward-compatible: pass.
- Scope limited to server persistence/schema/tests/report: pass.
- Concerns: none.
