# Execution Plan Revision 1

- Mode: SDD (manual persistence fallback; spec-superflow CLI unavailable)
- Contract: `changes/wikisource-whole-book-import/execution-contract.md`
- Branch: `wikisource-whole-book-import`
- Worktree: `C:\Users\18270\orca\workspaces\Scene Read\wikisource-whole-book-import`
- Current: true
- Parallel dispatch capability: available, but no waves are independent under the approved task dependencies.

| Wave | Strategy | Task | Depends on | Initial status |
|---|---|---|---|---|
| W1 | serial | Batch 1 — provider contract and aggregation | none | eligible |
| W2 | serial | Batch 2 — Wikisource search/root normalization | W1 pass | blocked |
| W3 | serial | Batch 3 — chapter discovery and ordering | W2 pass | blocked |
| W4 | serial | Batch 4 — simplified extracts and in-memory assembly | W3 pass | blocked |
| W5 | serial | Batch 5 — routing, persistence and attribution | W4 pass | blocked |
| W6 | serial | Batch 6 — mobile multi-source flow | W5 pass | blocked |
| W7 | serial | Batch 7 — documentation and live validation | W6 pass | blocked |

Each wave requires a persisted review report under `.superpowers/sdd/reviews/` with verdict `pass` before its dependent wave begins.
