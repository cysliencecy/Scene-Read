# W5 Replacement Code Review

- Wave: `W5`
- Base: `2f8b636b32dffb860957754805455e2dcf0bedba`
- Head: `78f9c3b05b7d3bb6d3301458b39ca7762f3caf83`
- Report: `.superpowers/sdd/reviews/w5-rereview.md`
- Verdict: `pass`

### Strengths

- The previous Important finding is fixed. `supabase/schema.sql:46-59` adds a nullable `chapter_order` column with an idempotent migration and a constraint allowing legacy `NULL` rows while requiring new numeric values to be positive.
- `supabase/schema.sql:100-111` uses `jsonb_array_elements(p_chapters) WITH ORDINALITY` and stores the 1-based ordinal in the same atomic transaction as the book and chapter inserts.
- `server/src/repository.ts:335-348` reads numbered chapters first by `chapter_order`, then uses ascending `created_at` and `id` as a deterministic fallback for legacy null-order rows.
- Supabase chapter Row/Insert/Update types include nullable `chapter_order` without exposing a new required domain-field contract, preserving existing create/import paths.
- The repair leaves the W5 attribution and PostgREST compatibility design intact: the legacy 11-argument overload is dropped, the single 12-argument RPC retains trailing `p_source_attribution default null`, and Gutenberg continues to send `null`.
- Original W5 behavior remains covered: both HTTP sources, unknown-source rejection, registry dispatch, preparation-before-persistence, zero RPC calls on failure, exactly one RPC on success, duplicate/race recovery, source attribution mappings, and Gutenberg compatibility.
- Independent verification passed: focused W5/Wikisource tests 35/35, full server tests 35/35, typecheck, build, and full-range `git diff --check`.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

None.

#### Minor (Nice to Have)

None.

### Recommendations

- During W7's controlled Supabase acceptance, include one multi-chapter readback assertion to complement the deterministic schema/repository fixture and confirm PostgREST emits the intended `chapter_order.asc.nullslast,created_at.asc,id.asc` ordering against the migrated database.

### Assessment

**Ready to merge?** Yes

**Reasoning:** Durable natural chapter order is now represented, atomically written, positively constrained, and deterministically read with backward-compatible legacy handling. No Critical or Important issue remains in the full repaired W5 range.

ssf execution review changes/wikisource-whole-book-import --wave W5 --base 2f8b636b32dffb860957754805455e2dcf0bedba --head 78f9c3b05b7d3bb6d3301458b39ca7762f3caf83 --report .superpowers/sdd/reviews/w5-rereview.md --verdict pass
