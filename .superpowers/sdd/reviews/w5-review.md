# W5 Code Review

- Wave: `W5`
- Base: `2f8b636b32dffb860957754805455e2dcf0bedba`
- Head: `38965e884f640bdd2623ad6f6afd915db61c57c2`
- Report: `.superpowers/sdd/reviews/w5-review.md`
- Verdict: `fail`

### Strengths

- `server/src/index.ts:270-286` accepts both approved sources, rejects unknown sources, validates visual style, and routes imports through the provider registry while preserving `OnlineBookError` status codes.
- `server/src/onlineBookService.ts:184-224` normalizes numeric Wikisource IDs, returns existing imports before remote preparation, invokes preparation before exactly one persistence call, and handles unique-conflict races by re-reading the existing book.
- The injected dependency seam has useful coverage: every approved preparation error plus an unexpected parse error is proven to produce zero persistence calls, while the success case proves one call with the complete prepared book, chapters, attribution, and no cover.
- `server/src/repository.ts:306-332` maps the complete book and chapter array into one RPC call and includes `p_source_attribution`; row/create mappings preserve Wikisource attribution while Gutenberg supplies `null`.
- `supabase/schema.sql:56-109` drops the legacy 11-argument overload, creates one backward-compatible 12-argument function with a trailing default-null attribution argument, and inserts the book and chapters in one PL/pgSQL transaction. Removing the pre-insert duplicate return correctly allows the unique index to surface races to the service.
- Independent verification passed: focused persistence/Wikisource tests 34/34, full server tests 34/34, typecheck, build, and full-range `git diff --check`.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

1. **Natural chapter order is lost at the persistence boundary**
   - Files: `supabase/schema.sql:46-53,95-105`; `server/src/repository.ts:335-342`
   - What's wrong: the ordered W4 chapter array is inserted in a single transaction, but `chapters` has no durable order column. Every inserted row uses `created_at default now()`; in PostgreSQL, `now()` is the transaction-start timestamp, so all chapters inserted by this RPC normally receive the same value. `listChaptersByBook` then orders only by `created_at`, leaving equal-timestamp rows in unspecified order.
   - Why it matters: both the immediate successful import response and later duplicate/reload paths call `listChaptersByBook`. A real Supabase query can therefore return chapters in a different order from the discovered natural order, violating the whole-book requirement to create and return all chapters in sequence. The current tests inject an already ordered chapter list and only regex-check the schema, so they cannot expose this database behavior.
   - How to fix: persist an explicit chapter ordinal. A backward-compatible approach is a nullable `chapter_order` column, populate it from `jsonb_array_elements(p_chapters) WITH ORDINALITY` inside the atomic RPC, add it to Supabase row types, and order repository reads by `chapter_order` with a deterministic fallback for legacy rows. Add a repository/schema test that demonstrates a multi-chapter RPC round trip preserves `1, 2, 10` natural order; if a live database test is unavailable, at minimum assert the ordinal column, `WITH ORDINALITY` assignment, and repository order clause together.

#### Minor (Nice to Have)

None.

### Recommendations

- After repairing durable order, rerun both Wikisource and Gutenberg import regressions because `listChaptersByBook` is shared by both providers.
- Retain the current default-null RPC parameter and explicit legacy overload drop; these correctly avoid PostgREST ambiguity while keeping old Gutenberg callers compatible.

### Assessment

**Ready to merge?** No

**Reasoning:** Routing, dispatch, atomic RPC usage, attribution, error handling, and race behavior are otherwise well covered, but the database does not preserve the approved natural chapter order. This Important persistence defect requires a focused repair and replacement review.

ssf execution review changes/wikisource-whole-book-import --wave W5 --base 2f8b636b32dffb860957754805455e2dcf0bedba --head 38965e884f640bdd2623ad6f6afd915db61c57c2 --report .superpowers/sdd/reviews/w5-review.md --verdict fail
