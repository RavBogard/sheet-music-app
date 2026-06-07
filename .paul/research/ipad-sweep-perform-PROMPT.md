# Lane — iPad sweep: Perform-mode deep coverage (`ipad-sweep-perform`)

**Wave:** ipad-sweep (in-Claude-Code Playwright/WebKit bug sweep on the band's real iPad surface)
**Risk tier:** 1 (test-only `e2e/**`; the Web-SDK auth bridge already shipped — you consume it)
**Base SHA:** `9a6e6453c` (verify vs `.coord/shared/master-tip.md`)
**Lane id:** `ipad-sweep-perform` · **Branch:** `feat/ipad-sweep-perform` · **Worktree:** `sheet-music-app-ipad-sweep-perform/`
**Coder:** coder-1 · **Est:** ~3–4 hr

## The foundation you build on (READ FIRST — verify, don't trust this prompt's line numbers)
coder-5 just shipped the harness at `9a6e6453c`. On master:
- `e2e/helpers/auth.ts` — `mintTestAccount` (MCP `create_test_account`), `loginAsTestUser` (now **signs in the Web SDK** so `auth.currentUser` is populated, not just the cookie), `revokeTestAccount(s)`.
- `e2e/helpers/seed.ts` — `seedPublishedSetlist`.
- `playwright.config.ts` — an **`ipad-webkit`** project at **820×1180** (standard 11" iPad; Daniel-confirmed hardware — see [[project-band-ipad-hardware]]) + a landscape variant.
- `e2e/perform-ipad.spec.ts` — the reference pattern (golden path). **Read it and mirror its structure.**

## Goal
Find bugs in **Perform mode** (`/perform/setlist/[id]` — the band's primary surface) on real WebKit at the iPad viewport, beyond the golden path. Write reusable specs (permanent regression value) AND surface findings.

## What to probe (each an assertion or a documented finding)
1. **Setlist switching** — seed 2 setlists; navigate between them; correct tracks render each time, no stale state.
2. **Sequential chart nav** — open the overlay, page next/prev through *every* bonded track; each chart paints under WebKit; no crash at the ends.
3. **Transpose** — up/down in the overlay; does the displayed chart/key respond? Does transposition **persist** when you nav to the next chart and back? (perform-flow.spec notes the dense-row key-badge reads a different source — verify/triage that mismatch.)
4. **Long setlist** — seed 30+ tracks (extend `seed.ts` with a new helper if needed — new file/fn, no contention); assert no horizontal overflow, smooth scroll, all rows reachable, tap-targets ≥44px deep in the list.
5. **Unbonded / missing chart rows** — include an unbonded row (use `update_track({songId:null})`, now shipped) and tap it: graceful empty-state, NOT a crash or infinite spinner.
6. **Header/section rows** — non-track rows render as labels, aren't tappable-as-charts.
7. **Annotation surface** — confirm presence/absence (perform-flow.spec dropped this as "no user-draw surface shipped"); if one exists now, probe draw→persist→nav.
8. **Landscape** — run the golden subset under the landscape project too (music stands rotate).

## Isolation (MANDATORY — parallel sweep lanes share prod)
- Mint with a lane-distinct identity; track every minted uid + seeded setlist id; **revoke/delete by id in `afterAll`**. NEVER call `cleanup_all_test_data` (blanket sweep cross-kills sibling lanes — [[feedback_sandbox_test_isolation]]).
- Bearer: dogfood `mint_admin_bearer` off the live root, revoke children post-run. Never write a token to a tracked file.

## Deliverable
- New spec file(s) under `e2e/` (e.g. `e2e/perform-ipad-deep.spec.ts`).
- **Findings file** `.paul/research/ipad-sweep-perform-FINDINGS.md` — one entry per bug (repro, severity, the assertion that caught it). Bugs are **FINDINGS, not fixes** — do NOT edit app `src/` to fix them in this lane (sweep ≠ fix; fixes go to a follow-up wave). Flag anything you're tempted to fix.
- SHIP-NOTICE to `.coord/inbox/auditor.md` + copy `supervisor.md` with the prod run summary + finding count.

## Hard rules
- Stay in `e2e/**` (+ `seed.ts` additions). Do NOT edit `src/**`, `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`, `error-envelopes.ts`. If you must touch `playwright.config.ts`, claim it in `shared/claims.md` (Lane stress may also want it — coordinate).
- Prod runs only (`PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live --project=ipad-webkit`); apex→www direct (apex 307 strips auth).

## Gates
`npm run test` (0 fail) + `playwright --list` (specs load, projects intact) + the iPad prod run (green or findings documented). Push `feat/ipad-sweep-perform:master` per narrow-lane caveat, OVERWRITE master-tip, SHIP-NOTICE.

## First actions
1. ACK in `supervisor.md` (sign `from coder-1`). 2. Cut worktree from `9a6e6453c`. 3. Read the shipped `e2e/helpers/auth.ts` + `perform-ipad.spec.ts` + `seed.ts`. 4. Build.
