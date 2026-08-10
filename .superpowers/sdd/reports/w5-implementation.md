# W5 Implementation Report

## Scope

Implemented Batch 5 provider import dispatch, Wikisource persistence orchestration, HTTP routing, Supabase attribution mappings, and the atomic RPC schema extension. No mobile changes, documentation/live acceptance, remote migration, or external Supabase data mutation was performed.

## TDD Evidence

- RED: focused tests failed because `index.ts` did not export the app and `repository.ts` lacked the RPC argument builder/attribution mapping seam.
- GREEN: focused aggregation/persistence tests passed 20/20.
- Full regression: `npm test` passed 34/34.
- Type safety: `npm run typecheck` passed.
- Build: `npm run build` passed.
- Repository hygiene: `git diff --check` passed.

## Implemented Behavior

- `POST /online-books/import` accepts `gutenberg` and `wikisource`, rejects unknown sources with `INVALID_ONLINE_BOOK`, and preserves provider error status codes.
- Both providers are registered behind `OnlineBookProviderRegistry`; import dispatch no longer hard-codes Gutenberg.
- Wikisource import normalizes numeric page IDs, checks existing imports, runs the complete W4 preparation, then makes exactly one repository RPC call.
- Injected repository tests cover every W4 validation/source error plus an unexpected parse error and prove zero RPC calls on preparation failure.
- Existing imports return stored chapters with `alreadyImported=true`; unique-conflict races are re-read and returned the same way.
- `BookRow`, create-book, RPC arguments, and domain mapping now preserve `source_attribution` and recognize `source=wikisource`; Gutenberg passes `null` and retains prior behavior.
- Schema adds nullable `books.source_attribution`, replaces the legacy RPC overload with a trailing default-null parameter, and inserts the book plus every chapter in one PL/pgSQL transaction.
- The RPC relies on the existing unique index for concurrency errors so the service can report raced imports accurately rather than silently returning `alreadyImported=false`.

## Self-review

- Provider boundary and HTTP validation/status stability: pass.
- Prepare-before-persist and zero-write failure proof: pass.
- Duplicate/race semantics: pass.
- Attribution/type/schema mapping: pass.
- Atomicity and Gutenberg compatibility: pass.
- W6/W7 and external writes absent: pass.
- Concerns: none.
