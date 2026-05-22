# R1 — iPad Perform/charts E2E test STRATEGY + SMOKE PROOF

**Lane:** R1 (coder-3), Tier-0 READ-ONLY research, iPad fleet launch 2026-05-22 (Fri eve)
+ 2026-05-23 (Shabbat morning). **Parent:** `ipad-launch-stress-test-PARENT.md`.
**Companion deliverables:** `ipad-launch-R1-claude-code-PROMPT.md` (Playwright run),
`ipad-launch-R1-cowork-PROMPT.md` (exploratory pass), `e2e/perform-ipad-real-setlists.spec.ts`
(the committed real-setlist render-sweep artifact).

---

## TL;DR launch verdict (from a real WebKit run against prod, READ-ONLY)
- **TONIGHT — "Kabbalat Shabbat — May 22" (`226309e2-78b7-48af-aa21-6aaf606b4fbe`): all openable charts RENDER on the 11" iPad. ✅** 4 RENDERED / 0 FAILED.
  **BUT 2 charts Daniel bonded are UNREACHABLE in Perform** (Finding A — needs a Daniel call before tonight).
- **TOMORROW — "Shavuot Yizkor — May 23" (`UnjLqKTtS4lNKQfMY6hB`): all 12 PDF charts RENDER. ✅** 11 RENDERED / 1 AUDIO / 0 FAILED. The 1 AUDIO is "Adon Olam" bonded to an .mp3 — degrades gracefully, but the band sees no chart (Finding C — content).
- **No hard render failures.** One transient "Failed to load PDF" (WebKit blob-precache fallback) self-healed on retry (Finding B — intermittent, worth a fix-wave look).

This was validated by an actual autonomous WebKit run — see **§Smoke proof** below.

---

## The verified foundation (what already exists — don't rebuild)
The repo already ships a strong iPad-WebKit E2E base. R1's job is to **orchestrate + validate
it against the REAL launch setlists**, plus add the one missing piece (a real-setlist render sweep).

- **Viewport (exact):** `playwright.config.ts` defines `--project=ipad-webkit` = WebKit at
  **820×1180** (Daniel-confirmed 11" iPad) and `ipad-webkit-landscape` = 1180×820. ✅ matches PARENT.
- **Run against prod:** `PLAYWRIGHT_USE_REMOTE=1` + `PLAYWRIGHT_BASE_URL=https://www.centralreform.live`
  skips the local dev server (aligns with "never use local dev server"). ✅
- **Existing iPad specs:** `perform-ipad.spec.ts` (golden react-pdf paint), `perform-ipad-deep.spec.ts`
  (switching, sequential nav, transpose dense-badge + nav-reset, long-list layout/tap-targets,
  unbonded + header rows, landscape, scraped-text routing regression), `perform-ipad-offline.spec.ts`
  (IndexedDB ArrayBuffer precache + a no-bearer `REPRO_SETLIST_ID` deployed mode), plus
  `chart-bind-ipad.spec.ts`, `library-ipad.spec.ts`, `onboarding-qr-ipad.spec.ts`, `stress-ipad.spec.ts`.
- **Auth (no humans):** `e2e/helpers/auth.ts` + `cycle-4/harness/lib/probe.mjs`:
  - `mintTestAccount(req, baseURL, MCP_BEARER, {role})` → `test-*` user + `crl_live_*` bearer (admin/band_leader bearer required).
  - `loginAsTestUser(ctx, baseURL, bearer)` → `__session` cookie (server auth) + a `customToken`.
  - `signInWebSdk(page, customToken, {required:false})` → wakes the client Firebase Web SDK via
    the in-bundle `window.__c7_auth_for_probes__` bridge (prod is built with
    `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1`, so it works; degrades to cookie-only if absent).
  - `probe.mjs mintSession({…, firebaseAuth})` is the Cowork-side equivalent (`signInWithCustomToken`).

**Key access fact that shapes the strategy:** `/perform/setlist/[id]` is **PUBLIC by design**
(server-fetches tracks via Admin SDK; chart bytes public per the chart-access policy). So the
**launch-critical real-chart render check needs NO auth/bearer** and mutates nothing — it is the
cheapest, highest-value probe. Auth is only needed for the *musician-specific* surfaces
(transpose-as-musician, save-offline, monitor, leader controls).

## Data model (verified against prod Firestore, READ-ONLY)
- Setlists: top-level `setlists/{id}`. Newer ones are `hydrated:true` and carry a denormalized
  `fileIds` array (the bonded charts) — NOT an inline `tracks` field.
- Tracks: top-level **`tracks` collection**, `where setlistId == <id>`, ordered by `order`. Each
  track has `type` (`song`|`header`|`prayer`|…), `title`, `key`, `fileId`/`songId`, `fileName`, `notes`.
- Chart metadata: **`library_index/{fileId}`** (doc id == fileId; the field is `id`, NOT `fileId`).
  Carries `mimeType`, `name`, `source`, `storageUrl`, `status`, salvage/orphan flags.

## The real launch chart manifest (enumerated 2026-05-22, isTest:false)
**TONIGHT — Kabbalat Shabbat (15 tracks; 6 bonded charts, all `application/pdf`):**
Yedid Nefesh, Mizmor Shiru Ladonai, Barechu*, Adonai Sifatai*, Mi Chamocha/Ana B'Koach, Mishebeirach.
(*Barechu + Adonai Sifatai are `type:"prayer"` → UNREACHABLE; see Finding A.)
**TOMORROW — Shavuot Yizkor (36 tracks; 13 bonded; 12 PDF + 1 audio):**
Fiddley Tune, Modeh ani-Klepper, Ma tovu/Hinei ma tov, Psukei d'zimrah, Ahava raba, Shema (major),
Mi chamocha (6-8), Adonai sfatai, Oseh shalom-Nava tehila, Mi shebeirach, Eitz chayim-Weisenberg,
Eili Eili/Eit Dodim/Elijah Rock (salvaged B-006 orphan → renders fine), **Adon Olam = Adon Olam.mp3 (audio)**.
- No MusicXML / text / image charts in either setlist → the launch render risk is **react-pdf canvas
  paint under WebKit**, almost exclusively. The octet-stream mime weak link does NOT bite tonight/tomorrow.
- 3 charts lack a `storageUrl` in `library_index` (Mizmor Shiru Ladonai, Mi Chamocha Ana B'Koach,
  salvaged Eili Eili) → serve via Drive fallback. All three rendered in the sweep.

## Coverage matrix (✅ covered by existing spec / ➕ added by R1 / ⚠️ gap)
| # | Behavior | Status |
|---|---|---|
| 1 | Auth + entry (mintSession → `/perform` as musician) | ✅ perform-ipad-deep `loginAndGoto` |
| 2 | Setlist → Perform, next/prev nav, ends-disabled, keyboard | ✅ perform-ipad-deep probe 1/2 |
| 3 | **Chart render across formats** (PDF canvas / OSMD svg / text / image; octet-stream) | ✅ golden + deep probe 9; ➕ **real-setlist sweep** (the launch check) |
| 4 | Transpose (MusicXML re-render; dense-badge mismatch; nav-reset) | ✅ perform-ipad-deep probe 3 (note: tonight/tomorrow are all PDF → transpose N/A on the real charts; the button should show unavailable) |
| 5 | Annotate / zoom / metronome don't crash | ✅ deep probe 7 (annotate absent by design); zoom/metronome via toolbar |
| 6 | Chart-bind picker (TEST setlist only) | ✅ chart-bind-ipad.spec.ts |
| 7 | Gig-packet generate/print | ✅ gig-packet-print.spec.ts (➕ verify under ipad-webkit) |
| 8 | Offline / precache (ArrayBuffer IDB, WebKit blob path) | ✅ perform-ipad-offline.spec.ts (+ deployed `REPRO_SETLIST_ID` no-bearer mode) |
| 9 | **REAL-setlist render verification (READ-ONLY)** | ➕ **`perform-ipad-real-setlists.spec.ts`** (THIS lane) |
| 10 | Long-setlist layout / 44px tap targets / no horizontal overflow | ✅ deep probe 4; landscape probe 8 |
| 11 | Unbonded + header rows = graceful non-interactive | ✅ deep probe 5/6 (➕ Finding A extends this: bonded *prayer* rows are also non-interactive) |

## Oracles (programmatic, no human)
- **Render success per chart:** a render signature visible within ~25s — `canvas` (PDF),
  `svg` under `[aria-label="Sheet music score"]` (MusicXML/OSMD), `.text-brand.font-bold` chord
  line (text), or `img[src*="/api/drive/file/"]` (image).
- **Graceful audio bond:** "bonded to an audio file / not a chart" text → AUDIO (not a fail).
- **Failure:** `Failed to load PDF | render error | Could not load chart | Chart failed to load |
  Invalid PDF | chart load timed out`, an infinite spinner (no signature in 25s), a 500/crash.
  The sweep taps the in-overlay **Retry** once before recording FAILED, so a verdict means
  "broken even after a retry" (truly launch-blocking) vs a one-off flake.
- **Console hygiene:** un-noised `console.error`/`pageerror` = fail. Noise list (per spec) covers
  Firebase/COOP/4xx/service-worker/Firestore-blip + three WebKit-specific benign lines: the
  `blob:` precache fallback, a CSP-blocked ancillary resource, and the audio-bond diagnostic.
- **Layout:** no horizontal overflow at 820/1180; tap targets ≥44px (deep spec).

## Fixture vs real (safety)
- **READ-ONLY real:** the real-setlist render sweep only navigates the PUBLIC route + screenshots.
  Never writes. The cowork exploratory pass views real setlists READ-ONLY for visual judgment.
- **TEST-`*` fixtures for every write/stress path:** the seeded suites mint their own
  `test-*` accounts/setlists/charts and `revoke_test_account` by uid in `afterAll` — never
  `cleanup_all_test_data` (would sweep sibling lanes). Use a per-instance `uidPrefix` for isolation.
- **Monitor desk:** untouched by R1. (R2 owns the safe live-desk oracle with the service-time guard.)

---

## ★ SMOKE PROOF (actually run — this is the validation the lane requires)
Command (no bearer; public; READ-ONLY; against prod):
```
PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live R1_RUN=both \
  npx playwright test e2e/perform-ipad-real-setlists.spec.ts --project=ipad-webkit --retries=2
```
Result (final run, 2026-05-22; both tests pass — `2 flaky` = each passed on a retry, the
documented prod first-load Firestore blip the existing iPad specs also absorb with `--retries=2`):
```
[R1] kabbalat-shabbat-5-22 SUMMARY: 4 RENDERED, 0 AUDIO, 0 FAILED of 4 walked
[R1] shavuot-yizkor-5-23  SUMMARY: 11 RENDERED, 1 AUDIO, 0 FAILED of 12 walked
  2 flaky   (0 failed)
```
Per-chart (representative clean attempt, tomorrow), each with the fetched `fileId`:
Songs 1–12 RENDERED (incl. the salvaged `6ca6e82c-…` "Eili Eili"); Song 13 AUDIO (`12JfLCHy…`
"Adon Olam.mp3"). Screenshots: `test-results/r1-*-NN-RENDERED.png` / `-AUDIO.png` (one per chart).
The auth path is also validated by inspection (probe.mjs/auth.ts against origin/master) and is
exercised end-to-end by the existing authed suites (run them with `MCP_BEARER`).

**Conclusion: the autonomous approach works, and every chart the band will open tonight +
tomorrow renders on a real 11" iPad WebKit viewport.** No launch-blocking *render* failure.

---

## Findings (surfaced to inbox/supervisor.md + coder-4)
- **Finding A (LAUNCH, reachability bug):** `SetlistRow.tsx:47` `hasFile = isSong && !!track.fileId`
  (+ open-gate `:56`) → a track typed `prayer`/`reading` with a real bonded chart is NOT openable
  in Perform. **Tonight that hides Barechu + Adonai Sifatai** (both `type:"prayer"`, real PDFs,
  Barechu bonded by Daniel at 22:54 the night before). Decision for Daniel: bug (let
  prayer/reading rows with a chart open → `hasFile = !isHeader && !!fileId`) vs data fix
  (re-type those 2 tracks to `song`). Either is small + tonight-relevant.
- **Finding B (render, intermittent):** a transient `Failed to load PDF` under WebKit with NO
  `/api/drive/file/` request observed → the offline/precache `blob:` resolution failed and the
  network fallback raced; self-healed on retry / re-tap. The band could see a one-off "Failed to
  load PDF" that a tap-Retry clears. Worth a fix-wave look at PDFOverlay's blob-first→network
  fallback timing on WebKit (relates to the F1 offline precache lane).
- **Finding C (content, data — R2):** tomorrow's "Adon Olam" row is bonded to `Adon Olam.mp3`
  (`audio/mpeg`), not a chart. The app degrades gracefully AND its own diagnostic says
  "Re-bind to a PDF chart, or change the row type away from 'song'." Confirm with Daniel: an
  intentional audio reference, or a misbond to fix before tomorrow.

## Run order for the executor (see the Claude-Code prompt for exact commands)
1. **First, no bearer:** the real-setlist render sweep (`perform-ipad-real-setlists.spec.ts`,
   `--project=ipad-webkit --retries=2`). Any `FAILED` verdict = launch-blocking → escalate.
2. **With an admin/band_leader `MCP_BEARER`:** the authed iPad suites
   (`perform-ipad`, `perform-ipad-deep`, `perform-ipad-offline`, `chart-bind-ipad`) under
   `ipad-webkit` + `ipad-webkit-landscape`, `--retries=2`.
3. **Cowork:** the exploratory legibility/ergonomics pass for the human-judgment gaps.
