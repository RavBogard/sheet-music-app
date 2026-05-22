# R1 — Claude Code (Playwright/WebKit) autonomous test run — READY TO PASTE

> Paste this whole block into a fresh Claude Code session on this machine to run
> the iPad Perform/charts autonomous test suite end-to-end against **prod**, no
> humans. It is **READ-ONLY** against the real setlists/charts; all write/stress
> paths use test-* isolated fixtures. See `ipad-launch-R1-STRATEGY.md` for the
> matrix + rationale and `ipad-launch-stress-test-PARENT.md` for the hard safety
> constraints (both bind this run).

---

You are running the **R1 iPad Perform autonomous test suite** for the CRC sheet-music
app the night of the iPad fleet launch (Fri 2026-05-22 eve + Sat 2026-05-23 morning).
Goal: prove every chart in the real setlists renders on an 11" iPad and shake out any
Perform-mode regression, with **zero mutations to live data**.

## 0. Hard safety constraints (NON-NEGOTIABLE)
1. **READ-ONLY on real data.** The render sweep (`perform-ipad-real-setlists.spec.ts`)
   only navigates the PUBLIC `/perform/setlist/[id]` route + screenshots — it never
   writes. The seeded suites create their OWN `test-*` setlists/accounts and revoke
   them by uid. NEVER mutate/reorder/publish/delete a real setlist or chart.
2. **No live monitor-desk writes during services** (Fri eve / Shabbat morning,
   America/Chicago). This suite does not touch the monitor desk at all — keep it that way.
3. **Real iPad fidelity:** Playwright **webkit** at **820×1180** (`--project=ipad-webkit`),
   not chromium. Landscape = `--project=ipad-webkit-landscape`.
4. **No humans.** Auth is programmatic (below). Assertions are programmatic.

## 1. Environment setup
- Work in a worktree off `origin/master` (do not pollute the canonical checkout, which
  may sit on a stale WIP branch):
  ```bash
  cd C:/Users/dsbog/centralreform.live/sheet-music-app
  git fetch origin
  git worktree add ../sheet-music-app-r1-run origin/master   # or reuse sheet-music-app-R1-ipad-perform-ux
  cd ../sheet-music-app-r1-run
  ```
- node_modules: junction the complete sibling install (same SHA) — fastest, no build needed
  since we run against REMOTE prod:
  ```bash
  rmdir node_modules 2>/dev/null
  cmd //c "mklink /J node_modules ..\\sheet-music-app-auditor-validation\\node_modules"
  cp ../sheet-music-app-mcp/.env.local .env.local   # harmless; not required for remote runs
  ```
- WebKit browser is already cached (`%LOCALAPPDATA%\ms-playwright\webkit-*`). If missing:
  `npx playwright install webkit`.

## 2. THE launch-critical run (no bearer, public, READ-ONLY) — DO THIS FIRST
Verifies every bonded chart in tonight's + tomorrow's REAL setlists renders on iPad WebKit:
```bash
PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live R1_RUN=both \
  npx playwright test e2e/perform-ipad-real-setlists.spec.ts --project=ipad-webkit --retries=1 --reporter=line
```
- Targets default to TONIGHT (`226309e2-78b7-48af-aa21-6aaf606b4fbe`) + TOMORROW
  (`UnjLqKTtS4lNKQfMY6hB`). For a future week override with
  `R1_SETLISTS="label:<id>,label:<id>"`.
- **Read the `[R1] … SUMMARY` lines** + per-chart `RENDERED|AUDIO|FAILED` lines, and the
  screenshots in `test-results/r1-*.png`. ANY `FAILED` = a chart that won't render for the
  band tonight = launch-blocking → escalate immediately.
- Known-OK signals: an `AUDIO` verdict (a track bonded to an .mp3, degrades gracefully) is
  a content note, not a render failure. A `[PDFViewer] Fetch error: Load failed … blob:`
  console line is the WebKit precache-fallback (the canvas still paints) and is filtered.
- **Reachability gap to check by hand:** the sweep walks only the OPENABLE overlay queue
  (`type:"song"` + fileId). Cross-check against the setlist's bonded `fileIds`: any bonded
  chart whose track `type` is `prayer`/`reading` is UNREACHABLE in Perform
  (`SetlistRow.tsx:47` `hasFile = isSong && !!fileId`). Tonight that hides Barechu +
  Adonai Sifatai — see STRATEGY "Finding A".

## 3. Authed musician-flow suites (needs an admin or band_leader MCP bearer)
Mint a fresh bearer via MCP `create_test_account` (admin), or reuse a known
`crl_live_*` admin/band_leader bearer. Then:
```bash
export MCP_BEARER=crl_live_...   # admin or band_leader; create_test_account refuses otherwise
PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
  npx playwright test \
    e2e/perform-ipad.spec.ts \
    e2e/perform-ipad-deep.spec.ts \
    e2e/perform-ipad-offline.spec.ts \
    e2e/chart-bind-ipad.spec.ts \
    --project=ipad-webkit --project=ipad-webkit-landscape --retries=2 --reporter=line
```
These cover: golden react-pdf paint, setlist switching, sequential nav, transpose
(in-overlay vs dense-row badge + nav-reset), long-list layout/tap-targets, unbonded +
header rows, landscape, scraped-text routing, **offline IndexedDB precache** (the
biggest live-service risk: shul wifi drops mid-service). They mint `test-*` fixtures and
revoke by uid in `afterAll` — never `cleanup_all_test_data` (would sweep sibling lanes).
`--retries=2` absorbs transient prod Firestore first-load blips.

Auth recipe these specs use (for reference / new specs):
- `mintTestAccount(request, baseURL, MCP_BEARER, {role})` → `{uid: test-…, token, …}`.
- `loginAsTestUser(context, baseURL, testBearer)` → sets `__session` cookie (server auth) +
  returns a `customToken`.
- `signInWebSdk(page, customToken, {required:false})` → wakes the client Firebase Web SDK
  via the in-bundle `window.__c7_auth_for_probes__` bridge (prod is built with
  `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1`, so it works; `required:false` degrades to cookie-only
  if ever absent). The page MUST already be on an app route before calling it.

## 4. Offline deployed-repro (no bearer) — optional extra confidence
Drive the offline precache against a REAL public setlist:
```bash
PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
  REPRO_SETLIST_ID=UnjLqKTtS4lNKQfMY6hB REPRO_PDF_ROW="Fiddley Tune" \
  REPRO_PDF_FILEID=11w4r08HnXYR-eRFzcMIs-ud4k1Ut1jwB \
  npx playwright test e2e/perform-ipad-offline.spec.ts --project=ipad-webkit
```
("Fiddley Tune" is a real bonded PDF in tomorrow's setlist.)

## 5. Oracles (what counts as a fail)
- Un-noised `console.error` / `pageerror` during a sweep = fail (noise list is in each spec).
- A chart that shows no render signature (canvas for PDF, `svg` under
  `[aria-label="Sheet music score"]` for MusicXML, chord text, or `img`) within ~25s, or
  shows `Failed to load|render error|Could not load chart|Chart failed to load|Invalid PDF`
  = FAILED.
- An infinite spinner / a 500 / a route crash = fail.
- Horizontal overflow at 820/1180 = fail (deep spec checks this).

## 6. Report back
Summarize: per-setlist RENDERED/AUDIO/FAILED counts; any FAILED chart (fileId + title +
detail) — escalate these to `.coord/inbox/supervisor.md` as launch-blocking; pass/fail of
each authed suite; offline-precache result; any new console errors. Attach the
`test-results/r1-*.png` paths. Do NOT teardown the worktree (supervisor does that).
