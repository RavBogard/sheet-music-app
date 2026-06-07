# Lane — iPad sweep: stress / resilience (`ipad-sweep-stress`)

**Wave:** ipad-sweep (in-Claude-Code Playwright/WebKit bug sweep on the band's real iPad surface)
**Risk tier:** 1 (test-only `e2e/**`; auth bridge already shipped — you consume it)
**Base SHA:** `9a6e6453c` (verify vs `.coord/shared/master-tip.md`)
**Lane id:** `ipad-sweep-stress` · **Branch:** `feat/ipad-sweep-stress` · **Worktree:** `sheet-music-app-ipad-sweep-stress/`
**Coder:** coder-4 · **Est:** ~3–4 hr

## The foundation you build on (READ FIRST — verify, don't trust line numbers)
coder-5 shipped the harness at `9a6e6453c`: `e2e/helpers/auth.ts` (`loginAsTestUser` now does Web-SDK sign-in → `auth.currentUser` populated), `e2e/helpers/seed.ts`, `e2e/perform-ipad.spec.ts` (reference), `playwright.config.ts` `ipad-webkit` @ 820×1180 + landscape.

## Goal
Stress the band's iPad surface under adverse real-world conditions — the band uses these over **shul wifi on 6 simultaneous iPads** during a live service. Find where it degrades, hangs, or crashes. Use Playwright's network/offline controls (WebKit context). These are resilience probes; expect to *find* things.

## What to probe
1. **Large setlist** — seed 40+ tracks (extend `seed.ts` if needed — new helper, no contention); measure Perform load + scroll; assert no overflow, no runaway memory/timeout, all rows reachable.
2. **Rapid interaction** — open/close the chart overlay repeatedly + fast track-to-track switching; assert no leaked listeners, no console-error storm, no stuck overlay.
3. **Slow network** — throttle to a 3G-ish profile (CDP/route delay) and load Perform: does it show loading states gracefully, or white-screen / time out? Charts (PDFs) under slow load.
4. **Offline / reconnect** — `context.setOffline(true)` mid-session, then back online: does the app recover (Firebase listeners resync), or wedge? (Be mindful of [[feedback_harness_real_firestore]] — real listener/cache races only show on a real backend; you're on prod, good.)
5. **PDF load failure** — `page.route` the chart byte request to abort/500: the overlay shows a graceful error, NOT a crash or infinite spinner (cross-ref the react-pdf worker risk [[feedback_react_pdf_worker]]).
6. **Concurrent roles** — two browser contexts (musician + band_leader) viewing the **same** setlist at once; both render correctly; no cross-talk.
7. **Console-error budget** — track console errors across all stress flows (filter the known `CONSOLE_NOISE_PATTERNS` from `perform-flow.spec.ts`); a clean budget is the bar.
8. **Landscape** — spot-check the heavy flows in landscape.

## Isolation (MANDATORY)
- Track minted uids + seeded setlists; clean by id in `afterAll`; NEVER `cleanup_all_test_data` ([[feedback_sandbox_test_isolation]]). Bearer: dogfood `mint_admin_bearer` off root, revoke children; never commit a token.

## Deliverable
- New spec(s) under `e2e/` (e.g. `e2e/stress-ipad.spec.ts`).
- **Findings file** `.paul/research/ipad-sweep-stress-FINDINGS.md` (repro, severity, caught-by; note any perf numbers — load ms, dropped frames). Bugs are FINDINGS, not fixes — do NOT edit app `src/` (sweep ≠ fix).
- SHIP-NOTICE to auditor + copy supervisor with prod run summary + finding count.

## Hard rules
- Stay in `e2e/**` (+ `seed.ts` additions). Do NOT edit `src/**`, `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`, `error-envelopes.ts`. `playwright.config.ts` only with a claim (Lane perform may also want it — coordinate via claims/HEADS-UP).
- Prod runs only (`PLAYWRIGHT_USE_REMOTE=1 ... --project=ipad-webkit`); apex→www direct. Be a considerate prod citizen — clean up fixtures; don't leave 40-track test setlists behind.

## Gates
`npm run test` (0 fail) + `playwright --list` + iPad prod run (green or findings). Push per narrow-lane caveat, OVERWRITE master-tip, SHIP-NOTICE.

## First actions
1. ACK in `supervisor.md` (sign `from coder-4`). 2. Cut worktree from `9a6e6453c`. 3. Read shipped `auth.ts` + `perform-ipad.spec.ts` + `seed.ts`. 4. Build.
