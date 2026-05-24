# iPad-WebKit Prod Sweep — FINDINGS

**Lane:** `ipad-webkit-prod-sweep` (Tier-0 ops/research)
**Dispatched:** `msg-ipad-webkit-prod-probe-sweep-001` from supervisor 2026-05-24T04:05Z
**Run window:** 2026-05-24T04:48Z – 2026-05-24T05:15Z (Sat 23:48 – Sun 00:15 CDT)
**Base SHA:** `54378d7e5` (origin/master at lane start)
**Target:** prod `https://www.centralreform.live` via `PLAYWRIGHT_USE_REMOTE=1`, project `ipad-webkit` (820×1180 portrait WebKit)
**Bearer:** Daniel inline `crl_live_…995f287c…aa95a9ba` (admin/band_leader; not persisted)
**Service-time guard:** Sat-night, outside Friday-eve + Shabbat-morning windows per `[[project_shul_cadence]]`. Safe.

---

## Overall verdict: 🟡 **YELLOW**

8 specs ran, 5 fully green, 3 with regressions on prod iPad WebKit. No CRITICAL live-service-breaking issue (today = Sat-night, no service tonight; tomorrow = Sun, no service). 1 HIGH (real-setlist render gaps — post-mortem of yesterday's + this-morning's setlists), 2 MEDIUM (wake-lock toggle + idle auto-precache regressions on prod), 1 NIT (transient `/api/drive/file` fetch flake). No CRITICALs.

---

## Per-spec summary

| Spec | Result | Wall | Failed assertions |
|---|---|---|---|
| `live-director-gesture` | ✅ **3/3 PASS** | 28.2s | — |
| `perform-ipad` | ❌ **2/3 PASS (1 FAIL)** | 48.3s | Keep-screen-on toggle — `navigator.wakeLock.request` did not fire under tap gesture (`ipad-wake-lock-fix` 2026-05-23 regression) |
| `perform-ipad-deep` | ✅ **8/8 PASS (1 skipped)** | 1m 06s | — (skipped: landscape-820 probe — different project) |
| `perform-ipad-offline` | ❌ **2/3 PASS (1 FAIL, 1 skipped)** | 1m 24s | f1 probe-1 idle auto-precache — Save-offline button stayed `data-state="idle"` (expected `"saved"`) |
| `perform-ipad-real-setlists` (bearer-free) | ❌ **0/2 PASS (2 FAIL)** | 4m | 2 chart-render failures (1 text-viewer fail + 1 stuck-spinner) on yesterday's + this-morning's real setlists |
| `chart-bind-ipad` | ✅ **2/2 PASS** | 20.2s | — |
| `library-ipad` | ✅ **4/4 PASS** | 17.2s | — |
| `onboarding-qr-ipad` | ✅ **10/10 PASS** | 34.0s | — |

**Aggregate:** 31 PASS / 4 FAIL / 1 skipped across 36 test invocations (probe-style sub-checks counted). Bearer-gated specs ALL ran (none `test.skip`-ed). No specs aborted mid-run.

---

## Findings

### F-1 (HIGH) — Kabbalat Shabbat 5/22 Song 5 of 9 — text viewer fails to load chart bytes that PDF viewer renders fine

**Spec:** `perform-ipad-real-setlists.spec.ts` › `kabbalat-shabbat-5-22`
**fileId:** `upload-046649f0-1c68-4586-b021-964bb84c3228`
**Symptom:** Per-chart verdict `FAILED Failed to load text file` at row 5.
**The smoking gun:** The SAME `upload-046649f0-...` fileId renders successfully at row 4 (RENDERED) and row 6 (RENDERED, retry attempt). The bytes are fetchable. Failure occurs only when the row routes to the **text viewer** for that fileId.
**Likely root cause:** `[[project_track_mimetype_gotcha]]` asymmetric mime-type stamping — `track.type:'text'` rows whose library_index entry was stamped via a path that didn't write `mimeType` send the request through a code path that can't resolve the file. The exact byte path that PDF viewer uses (offline-idb getFile → `/api/drive/file/<id>` net fallback per `audio-viewer-f7`) presumably works; the text-viewer's separate fetch path doesn't.
**Severity:** HIGH for a future Friday eve service; **MEDIUM now** (yesterday's service, post-mortem).
**Recommended next lane:** narrow Tier-1 — instrument TextScoreViewer's fetch error to surface the actual upstream error (404? cors? mime?), then converge it with the PDFViewer offline-first pattern.

---

### F-2 (HIGH) — Shavuot Yizkor 5/23 late-position stuck-spinner (intermittent across attempts)

**Spec:** `perform-ipad-real-setlists.spec.ts` › `shavuot-yizkor-5-23`
**Symptom:** Per-chart verdict `FAILED no render signature, audio-bond, or error within 25s (stuck spinner?)` at row 13 of 13.
**Why this is NOT a single broken chart:** First-attempt fileId = `6ca6e82c-e3be-4e6b-b6c1-63f60b3ac5cc`; retry-attempt fileId = `12JfLCHytM5q59btBQ05sz-V_SurQmUoT`. Different chart bytes, same failure shape. So the stuck-spinner pattern is **position-bound**, not chart-bound.
**Implication:** Walking 12+ charts on a single iPad viewport during prod sweep induces a stuck-spinner on the 13th. Could be queue/PDF.js worker starvation, IDB backpressure, or a memory-pressure WebKit shape. The "no error within 25s" failure mode masks the real issue and degrades UX.
**Confirmed working** despite this: 11 of 12 walked charts RENDERED, including all bonded charts from the audio-viewer-f7 + wider-blast restore lanes. The `audio-viewer-f7` audio-bond branch did not surface as `AUDIO` verdict in this sweep (audio-bonded tracks not in this prod-target Firestore list — needs spot-check).
**Severity:** HIGH for future Shabbat morning services (Yizkor is rare but other Saturday morning setlists are deep); **MEDIUM now** (this morning's service, post-mortem).
**Recommended next lane:** narrow Tier-0 — characterize the stuck-spinner mechanism (PDF.js worker stats? IDB queue? memory) via a probe spec that walks 15+ charts on the iPad viewport and logs viewer-internal state at each step. Then a fix lane based on findings.

---

### F-3 (MEDIUM) — Keep-screen-on toggle does not fire `navigator.wakeLock.request` on prod iPad WebKit

**Spec:** `perform-ipad.spec.ts:160` › `Keep-screen-on toggle — gesture-gated wake-lock holds across the setlist (ipad-wake-lock-fix 2026-05-23)`
**Error:** `navigator.wakeLock.request must have fired exactly once under the tap gesture` — Expected `>= 1`, Received `0`.
**Context:** This is the **prod-regression check for `ipad-wake-lock-fix` (`559c6c84d`, coder-5 2026-05-23T20:42Z)** — the lane that ratified the gesture-gated KeepAwakeToggle approach. The test failed both initial attempt AND retry (consistent, not flaky).
**Implication:** Either (a) the KeepAwakeToggle is not present on the prod page (rendering gate misses iPad WebKit), or (b) the toggle is present but the tap is not invoking `requestWakeLock`, or (c) the `isSupported` capability check incorrectly false-negatives on prod iPad WebKit. The screenshot in `test-results/perform-ipad-ipad-uat-harn-9b87d-d-wake-lock-fix-2026-05-23--ipad-webkit-retry1/test-failed-1.png` will disambiguate. Closes the standing "deployed-verify" wait noted in the supervisor pickup pointer for `ipad-wake-lock-fix`.
**Severity:** MEDIUM — the toggle is a UX-affordance (screen-stays-on during chart performance). Failure means the iPad screen will still time out per Daniel's prior workflow. Not data-loss, not crash, but a meaningful regression of a recently-shipped feature.
**Recommended next lane:** Tier-1 fix — re-verify the prod build picked up the wake-lock-fix dist + tighten the capability check + add a deployed-surface verify gate before declaring the next wake-lock change shipped.

---

### F-4 (MEDIUM) — Idle auto-precache does not fire on prod iPad WebKit

**Spec:** `perform-ipad-offline.spec.ts:218` › `probe 1 — idle auto-precache: open online, go offline, chart renders from cache (no tap to save)`
**Error:** `idle auto-precache must cache the whole setlist on entry` — Expected Save-offline button `data-state="saved"`, Received `"idle"`.
**Context:** Tested both initial + retry (consistent fail in 23-24s wall). Probe 2 (explicit "Save offline" CTA tap) **DOES PASS** — so manual save works; only the *idle/auto* path fails.
**Implication:** The auto-precache useEffect that's supposed to fire on Perform-mode entry and progress the Save-offline button to `"saved"` isn't completing on prod iPad WebKit within 20s. This means cold-boot offline scenarios depend on band/Daniel manually tapping Save-offline before going offline. Closes the standing "iPad PWA fresh-install test on a restored chart" deployed-verify wait noted in the supervisor pickup pointer.
**Severity:** MEDIUM — manual path works; auto path doesn't. Offline reliability depends on user remembering to tap.
**Recommended next lane:** Tier-1 fix — instrument idle auto-precache to log progress to `webVitalsObservations` or a similar prod sink, identify where it stalls (network? IDB? quota?), then fix.

---

### F-5 (NIT) — Transient `/api/drive/file/<id>` "Failed sending data to the peer" surfaced once on `kabbalat-shabbat-5-22` Song 1

**Spec:** `perform-ipad-real-setlists.spec.ts` › `kabbalat-shabbat-5-22`
**Symptom:** Console-error sequence on Song 1: `Failed to load resource: Failed sending data to the peer` (x2) + `[PDFViewer] Fetch error: Load failed | url: /api/drive/file/11hnNdTgFcqqmK1ExZYEeM3HqqHLfC28y`. **Song 1 RENDERED after an in-overlay retry** — the PDFViewer's own retry path recovered.
**Implication:** PDFViewer's offline-first → network-fallback path correctly recovers from a transient fetch flake. This is the audio-viewer-f7 sibling pattern working as designed. Not a regression. Logging it because the dispatch asked for `un-noised console error` coverage.
**Severity:** NIT — already mitigated by in-overlay retry.

---

## Standing-waits closure (from prior supervisor pickup-pointer)

The sweep closes the following standing "deployed-verify" follow-ups noted in `.coord/SUPERVISOR.md`:

| Standing wait | Closure verdict | Source |
|---|---|---|
| "Friday-gate fully GREEN display-path test" | 🟡 **YELLOW** — 19 of 21 walked charts on the actual prod Fri-eve + Shabbat-morning setlists RENDERED. F-1 (text viewer Song 5) + F-2 (late-position stuck spinner) remain. | F-1 + F-2 above |
| live-director-gesture deployed verify | ✅ **GREEN** — 3/3 PASS on prod iPad WebKit. The long-press → action-sheet → change-key → Dexie patch → key-badge flow works end-to-end. Closes the open Tier-1 verify wait. | `live-director-gesture.log` |
| iPad PWA fresh-install test on a restored chart (Yizkor → Eili Eili, etc.) | 🟡 **YELLOW** — manual offline-save path works (probe 2 pass); idle auto-precache does NOT (F-4). The display-path proof per `[[project_chart_loss_reports_are_display_bugs]]` is partially satisfied (chart bytes render online; offline path needs the manual tap). | F-4 above |
| `ipad-wake-lock-fix` deployed verify | 🔴 **RED** — F-3 reveals the toggle's wakeLock.request doesn't fire on prod iPad WebKit. Recent ship not behaving on prod. | F-3 above |

---

## Coverage gaps (surfaced, not addressed per dispatch out-of-scope)

The dispatch said: *"if you find a gap (e.g. PWA fresh-install isn't actually covered), surface it in FINDINGS, don't write the spec."*

- **No `AUDIO` verdict surfaced** in `perform-ipad-real-setlists` despite `audio-viewer-f7` shipping recently. The actual prod target setlists (Kabbalat Shabbat 5/22 + Shavuot Yizkor 5/23) don't include the Yizkor "Adon Olam" mp3 that motivated `audio-viewer-f7`. The audio-bond dispatch branch is exercised in unit tests but NOT verified on prod in this sweep. Recommend a follow-up Tier-0 lane that seeds a public setlist with a known mp3 bond and runs `perform-ipad-real-setlists` against it — OR widens `R1_SETLISTS` env override to include an audio-bonded prod setlist.
- **No PWA fresh-install spec** (cold-boot, no service worker cached). Idle auto-precache failure (F-4) suggests this gap matters in practice.
- **Landscape iPad** project (`ipad-webkit-landscape`) was NOT run in this sweep per dispatch scope (only `ipad-webkit` portrait). The `perform-ipad-deep.spec.ts` probe 8 (landscape golden subset) auto-skipped under the portrait project. Landscape gap.
- **`onboarding-qr-ipad` cycle-2 case** (`MCP_BEARER`-required cycle 2 with `member`-role grant) was only partially covered — saw "member-allowed flagged in FINDINGS" in test name. Pending a follow-up assertion that member-as-approver is actually intended policy.

---

## Lane execution gates

- ✅ All 8 specs RUN (none skipped at lane level, none aborted mid-run).
- ✅ Each per-spec log committed to `.paul/research/ipad-webkit-prod-sweep/` (8 `<spec>.log` + `SUMMARY-rolling.log`).
- ✅ FINDINGS.md present, parseable, severity-categorized.
- ✅ Per-FAIL specific assertion named (not "test failed").
- ✅ Out-of-scope honored: no spec edits, no app/test config edits, no playwright config edits, no new spec files written.

## Lane posture

- **Code changes:** 0. Research-only lane.
- **Held claims:** 0.
- **Worktree:** `sheet-music-app-ipad-sweep/` cut from `54378d7e5`. Awaits supervisor teardown sweep on SHIP-NOTICE per `[[feedback_worktree_teardown_timing]]`.
- **node_modules:** junction → `sheet-music-app-auditor-validation/node_modules` (Playwright + WebKit deps).
- **bridge-v1005-accumulator worktree** at `048297c8c` STAYS PARKED — untouched.

## Recommended follow-on lanes (priority order)

1. **F-3 wake-lock-toggle fix** — Tier-1 small surface; closes a RED standing-wait on a recent ship.
2. **F-4 idle auto-precache fix** — Tier-1; improves offline reliability for band iPads.
3. **F-1 text-viewer fetch fix** — Tier-1; converges TextScoreViewer with the PDFViewer offline-first pattern.
4. **F-2 late-position stuck-spinner characterization** — Tier-0 research first (mechanism unknown), then Tier-1 fix based on findings.
5. **Audio-bond prod verify** — Tier-0 spec extension or `R1_SETLISTS` override to include an audio-bonded setlist.
