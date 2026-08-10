# W2 Code Review

- Wave: `W2`
- Base: `a277796f8ee433cc27a0472f89199b0e49de666c`
- Head: `07736d8049d45afc282c414b6c8a4fbd7ff9495a`
- Report: `.superpowers/sdd/reviews/w2-review.md`
- Verdict: `fail`

### Strengths

- `server/src/wikisource.ts:46-68` validates the configured API endpoint before any fetch and restricts it to HTTPS, the exact Wikisource hostname, default port, and `/w/api.php` path.
- `server/src/wikisource.ts:70-112` centralizes MediaWiki requests with the required 15-second timeout and `SceneReader/0.1` User-Agent, while normalizing network, HTTP, and JSON failures to the shared error model.
- `server/src/wikisource.ts:151-196` resolves search hits to root metadata, uses the resolved root `pageid` as the stable source ID, and deduplicates emitted IDs.
- The focused fixtures are deterministic and the full server suite passed: 15 tests, plus typecheck and build. `git diff --check` also passed.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

1. **Search incorrectly discards roots based on the matched child page's title**
   - File: `server/src/wikisource.ts:114-119`
   - Test encoding the deviation: `server/test/wikisource.test.ts:24-27,57`
   - What's wrong: `rootTitleFromSearchHit` rejects any subpage whose suffix contains `目录、版本、说明、校勘、序、跋、附录、版权`. The approved search design (Decision 3) says every main-namespace `根标题/子页` hit is reduced to the root title and then resolved. Auxiliary-page filtering belongs to chapter discovery/import in Decision 4, not to root-work search. As written, a query that matches only `某作品/序章`, `某作品/目录`, or another filtered child produces no result for `某作品`, even though that child still identifies the work root. It also overmatches legitimate chapter names such as `序章`.
   - Why it matters: this violates the requirement that chapter-subpage hits represent one root work and makes valid books undiscoverable depending on which child MediaWiki search returns.
   - How to fix: remove auxiliary-suffix filtering from search root normalization. For every non-empty namespace-0 hit, truncate at the first `/`, resolve that root, and deduplicate by resolved page ID. Keep auxiliary filtering only in Batch 3's direct-child chapter classifier. Update the fixture so `西游记/目录` contributes the `西游记` root rather than being dropped.

#### Minor (Nice to Have)

1. **The claimed page-ID deduplication test does not exercise duplicate resolved IDs**
   - File: `server/test/wikisource.test.ts:37-50`
   - What's wrong: the root response fixture contains only page IDs `100` and `300`; duplicate raw titles are removed before root lookup, so the `seenPageIds` branch is never tested.
   - Why it matters: Batch 2 explicitly requires a page-ID deduplication test, especially for aliases/redirects that resolve different requested titles to one root page.
   - How to fix: add a fixture where distinct requested root titles resolve to repeated entries with the same `pageid`, and assert that only one book is emitted.

### Recommendations

- Keep search normalization intentionally broad and defer content-page classification to the chapter-discovery batch, preserving the design's separation between “identify the work” and “select importable chapters.”
- Add one redirected/aliased-root fixture to cover resolved-title and resolved-page-ID behavior together.

### Assessment

**Ready to merge?** No

**Reasoning:** The provider boundary, security checks, request behavior, and stable-ID mapping are sound, but the search-time auxiliary filter is a spec/design deviation that can suppress valid root works. Because an Important finding remains, W2 requires repair and a fresh review before a passing receipt.

ssf execution review changes/wikisource-whole-book-import --wave W2 --base a277796f8ee433cc27a0472f89199b0e49de666c --head 07736d8049d45afc282c414b6c8a4fbd7ff9495a --report .superpowers/sdd/reviews/w2-review.md --verdict fail
