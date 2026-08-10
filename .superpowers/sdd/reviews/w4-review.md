# W4 Code Review

- Wave: `W4`
- Base: `2d7fbabb71e9e487dc9e364069bd4b1c34bd5cae`
- Head: `6e73c09b3edad3f4109f2f7a9e2330f8f369ca5d`
- Report: `.superpowers/sdd/reviews/w4-review.md`
- Verdict: `pass`

### Strengths

- `server/src/wikisource.ts:183-205` resolves the numeric source page ID first, rejects missing/non-main-namespace roots, retains the canonical source title for `allpages`, and uses the API's `zh-hans` variant title for display. This correctly implements the W3 canonical-root recommendation.
- `server/src/wikisource.ts:416-456` requests `prop=extracts|info`, `explaintext=1`, `exsectionformat=plain`, `exlimit=max`, and variant titles through the existing trusted URL, timeout, and User-Agent boundary.
- Extract requests are sliced into at most 20 titles and run through a stable-order worker pool capped at three concurrent requests (`server/src/wikisource.ts:391-456`). Missing pages or extracts fail the complete preparation.
- `server/src/wikisource.ts:353-389` removes standalone navigation, edit controls, footnote markers, template decoration, and heading markup while preserving navigation words inside ordinary prose.
- `server/src/onlineBookService.ts:107-163` constructs the complete book and readable chapter array only after root resolution, chapter discovery, all extract requests, cleaning, and size validation. IDs derive from root page ID and discovered natural order, so they remain stable even when an unreadable page is omitted.
- The final body limit uses UTF-8 byte counts and rejects only above `20 * 1024 * 1024`; tests cover exactly-at-limit and one-byte-over behavior.
- The W4 function has no persistence call or persistence callback. All missing-root, no-chapter, missing-extract, no-readable-text, and size failures therefore occur before the W5 persistence boundary.
- Independent verification passed: Wikisource tests 14/14, full server tests 26/26, server typecheck, and full-range `git diff --check`.
- A read-only real API check confirmed that root `pageid=7683` supplies canonical `紅樓夢`, `varianttitles.zh-hans=红楼梦`, and that TextExtracts for the first chapter supplies the expected simplified extract and variant title fields.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

None.

#### Minor (Nice to Have)

None.

### Recommendations

- In W5, preserve this preparation/persistence seam and add the planned repository-spy assertions proving every preparation failure results in zero RPC calls before wiring the provider import path.
- Keep the real external API check outside stable CI, as required, while retaining its canonical-title and `varianttitles` observations for final《红楼梦》acceptance evidence.

### Assessment

**Ready to merge?** Yes

**Reasoning:** W4 satisfies the approved canonical-root, simplified TextExtracts, batching/concurrency, cleaning, stable in-memory assembly, and 20 MB failure requirements. No Critical or Important issue remains.

ssf execution review changes/wikisource-whole-book-import --wave W4 --base 2d7fbabb71e9e487dc9e364069bd4b1c34bd5cae --head 6e73c09b3edad3f4109f2f7a9e2330f8f369ca5d --report .superpowers/sdd/reviews/w4-review.md --verdict pass
