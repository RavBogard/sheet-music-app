# Agent brief — sheet-music-app

Every builder or reviewer prompt in this repo points here, then adds only its own task's spec.

## Setup
- Repo: `C:\Users\dsbog\centralreform.live\sheet-music-app`. Work in your own git worktree on a
  branch named `<topic>/<short-slug>`, off the current `origin/master`.
- First command in a new worktree: `git config user.name "<your-agent-name>"` and
  `git config user.email "<your-agent-name>@coord.local"`.
- `npm ci` if `node_modules` is missing.

## Rules (from `CLAUDE.md`; read it once)
- Both tenants (CRC and Brothers Lazaroff) are live. Every query is org-scoped through
  `orgFrom(extra)` / `rowOrg`; new data access gets a test proving the other tenant can't see it.
- Never propose which setting or melody the band plays. Code may recall what people chose; it
  never picks a setting nobody chose.
- Row order is the author's. Publish is retired. No liturgical text in this repo.
- Overlays contract fields on setlists/tracks keep their names and types; adding fields is fine.
- MCP validation errors use `richError(...)` envelopes (`result.isError`), never JSON-RPC errors.
- Every new MCP tool goes into `READ_TOOLS` or the write list in `src/lib/mcp/tool-access.ts`.
  An ops-only tool (backfills, sweeps) also goes into `OPS_TOOLS` in `src/lib/mcp/surfaces.ts`.
- Back-fills and writes follow F-05: `dryRun` defaults to true and returns the full report; a real
  run needs `dryRun: false, force: true`.
- Any change that touches `route.ts` exports: run `SKIP_ENV_VALIDATION=1 npx next build --webpack`
  before pushing.

## Checks to run locally (never the full suites)
- `npx tsc --noEmit`
- `npx vitest run <the test files you added or changed>`
- Emulator tests you added: `npx firebase emulators:exec --only firestore,auth,storage "npx vitest run --config vitest.emulator.config.ts <files>"`
- CI runs everything else.

## Tests
Assert behaviour, roles and ids, not exact prose. One deliberate wording test per tool
description at most. Don't cover the same flow at two levels.

## Commits and PRs
- Plain-language commit messages: what changed and what's worth noticing. No `Lane:` trailer.
  End with the attribution lines the lead gives you.
- Push your branch, open a PR against `master` with `gh pr create`, then STOP. Don't wait on CI and
  don't rerun jobs; the lead watches CI.

## Report (under 15 lines)
PR URL, what shipped, checks run and their result, anything you couldn't do and why, and any
decision you made that the plan didn't.
