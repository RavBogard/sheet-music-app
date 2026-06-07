# Lane — iPad sweep: library browse + chart-bind picker (`ipad-sweep-library`)

**Wave:** ipad-sweep (in-Claude-Code Playwright/WebKit bug sweep on the band's real iPad surface)
**Risk tier:** 1 (test-only `e2e/**` + a one-line `.gitignore` hygiene fix)
**Base SHA:** `9a6e6453c` (verify vs `.coord/shared/master-tip.md`)
**Lane id:** `ipad-sweep-library` · **Branch:** `feat/ipad-sweep-library` · **Worktree:** `sheet-music-app-ipad-sweep-library/`
**Coder:** coder-3 · **Est:** ~3–4 hr

## Deliverable 0 (do FIRST, one commit): gitignore the harness output dirs
Auditor flagged: `test-results/` + `playwright-report/` are git-tracked and get dirtied by every Playwright run. Add both to `.gitignore` (verify they're currently tracked: `git ls-files test-results playwright-report`; if tracked, `git rm -r --cached` them in the same commit). This unblocks clean runs for the whole sweep wave. Small, self-contained, ship it as your first commit (or fold into your final push — your call, but get it in).

## The foundation you build on (READ FIRST — verify, don't trust line numbers)
coder-5 shipped the harness at `9a6e6453c`: `e2e/helpers/auth.ts` (`loginAsTestUser` now does Web-SDK sign-in → `auth.currentUser` populated), `e2e/helpers/seed.ts`, `e2e/perform-ipad.spec.ts` (reference), `playwright.config.ts` `ipad-webkit` @ 820×1180 + landscape.

## Goal
Find bugs in the **library + chart-binding** surface on iPad WebKit — the path Daniel/leaders use to attach charts to setlist tracks, and the search that just got token-matching (Bug 3, shipped `1a9886f13`).

## What to probe
1. **Library browse** — `/library` on iPad: rows render dense (no cover art per [[feedback_no_cover_art]]), no overflow at 820px, scroll through a large catalog (568 rows in prod), tap-targets ≥44px.
2. **Token search** — type multi-word / reordered / "title + composer" queries on the iPad keyboard (e.g. "weisenberg eitz chayim"): hits the right rows (the Bug-3 fix); single-token still works; no-results state is graceful.
3. **Dedup display** — duplicates collapse in the UI (per the dedup grouping); orphaned/duplicate rows hidden by default.
4. **Chart-bind picker** — open the picker for a setlist track, browse/search, **bind a chart**; assert the track shows bonded (songId/fileId set), the chart then loads in Perform. Touch ergonomics of the picker (scroll, select, confirm).
5. **Track-doc mimeType gotcha** — picker/chart-binder track docs lack mimeType+fileName ([[project_track_mimetype_gotcha]]); verify file-type detection still backstops correctly when binding (no broken-type rows).
6. **Empty / large states** — empty search, very long result list scroll.
7. **Landscape** — library + picker render in landscape.

## Isolation (MANDATORY)
- Track minted uids + any setlists/bindings you create; clean by id in `afterAll`; NEVER `cleanup_all_test_data` ([[feedback_sandbox_test_isolation]]). Bearer: dogfood `mint_admin_bearer` off root, revoke children; never commit a token. If you bind charts, unbind/delete your test fixtures — don't mutate real library rows.

## Deliverable
- New spec(s) under `e2e/` (e.g. `e2e/library-ipad.spec.ts`) + the `.gitignore` fix.
- **Findings file** `.paul/research/ipad-sweep-library-FINDINGS.md` (repro, severity, caught-by). Bugs are FINDINGS, not fixes — do NOT edit app `src/` (sweep ≠ fix), except the `.gitignore` hygiene item.
- SHIP-NOTICE to auditor + copy supervisor with prod run summary + finding count.

## Hard rules
- Stay in `e2e/**` + `.gitignore`. Do NOT edit `src/**`, `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`, `error-envelopes.ts`. Do NOT touch dedup logic or library data. `playwright.config.ts` only with a claim.
- Prod runs only (`PLAYWRIGHT_USE_REMOTE=1 ... --project=ipad-webkit`); apex→www direct.

## Gates
`npm run test` (0 fail) + `playwright --list` + iPad prod run (green or findings). Push per narrow-lane caveat, OVERWRITE master-tip, SHIP-NOTICE.

## First actions
1. ACK in `supervisor.md` (sign `from coder-3`). 2. Cut worktree from `9a6e6453c`. 3. Do Deliverable 0 (gitignore). 4. Read shipped `auth.ts` + `perform-ipad.spec.ts`. 5. Build.
