# Project Context

- At the start of every task in this repository, including tasks opened in a newly created worktree, read the Markdown files under `docs/` before planning or changing code.
- Use those documents to understand the product scope, architecture decisions, technical choices, roadmap, current task line, setup requirements, and validation history.
- Re-read any directly relevant document when the task changes or when repository behavior conflicts with prior assumptions.
- Treat the current code and configuration as authoritative when they conflict with stale documentation, and call out the mismatch before making a consequential change.

# Execution Defaults

- Do not use spec-superflow or create proposal, spec, design, task, execution-contract, decision-point, review-receipt, or archive-planning artifacts unless the user explicitly opts back into that workflow.
- Do not dispatch subagents or independent reviewer agents. Complete repository work in the current agent session.
- For change requests, implement directly after reading `docs/`, then run only the relevant tests and validations in proportion to the change risk.
- Existing spec-superflow artifacts are historical records. Do not resume their state machines unless the user explicitly requests it.
