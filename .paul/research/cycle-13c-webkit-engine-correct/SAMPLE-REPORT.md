# Cycle-13c Real-WebKit engine-correct — REPORT (FICTIONAL SAMPLE)

> ⚠️ **This is a SAMPLE.** No cowork instance has run yet. It demonstrates what a finished
> cycle-13c RUN's REPORT.md looks like in the divergence methodology. Numbers, UA strings,
> traces, and findings are FICTIONAL but realistic — anchored on real components, real SHAs,
> the real `467e788ed5` SW, and the real `cd2010f4` tracks-shape. Use it to imagine the run
> before reading the real one.

**Run date:** 2026-05-30T18:30Z (fictional)
**Wall-clock:** 74 min single-thread
**Master SHA at run:** `952edac4c3` (no drift since dispatch)
**ENGINE PROVEN:** WebKit — UA=`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15`; browserType=`webkit`; vendor=`Apple Computer, Inc.`  ✓ §1.3 gate passed all 3 checks
**Chromium control lane UA:** `Mozilla/5.0 (...) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36` (the run-2 substitute, 820×1180 + iPad UA)
**Provisioning path used:** (a) Docker `mcr.microsoft.com/playwright:v1.52.0-noble` — WebKit launched with baked-in system libs; no `apt` needed at run-time
**Personas exercised:** Aviva (musician) + David (band_leader) + Daniel (admin via admin-test-session; `MCP_ADMIN_TEST_SESSION_SECRET` was set)
**Reference setlist (read-only):** `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` — 20 tracks · 16 songs · 4 dividers · never mutated
**Fixture clone (write target):** `7c4f9a1e-fictional-sample-id-3b8d2e6a1f0c` — `[CYCLE13C-webkit] real-WebKit engine-correct probe`; `isTest:true` auto-stamped ✓
**Anchor coverage:** A1 ✓ A2 ✓ A3 OUT (axis 13a) A4 ✓
**Engine-divergence headline:** **SW shell-cache offline RELOAD diverges — ✓ PASS Chromium / ✗ FAIL WebKit (F-C13C-001).** Wake-lock auto-release pill also diverges (F-C13C-002). Offline blob: chart read is engine-agnostic (PASS both).
**Cleanup state:** clean (§G verified)

---

## §A — Engine-correctness verdict (≤200 words)

Real WebKit launched (Docker path (a)) — the §1.3 gate proved engine=webkit via launch,
UA, and `navigator.standalone`/vendor; this is the first cycle to grade these cells on the
band's actual engine. Two of the three HIGH cells diverge from the Chromium substitute.
The headline: **the `467e788ed5` service-worker fix that closed F-C12-R2-009 does NOT hold
on WebKit** — offline `page.reload()` returns the iOS Safari offline page (cache evicted /
`clients.claim` not yet controlling), while the identical steps PASS on Chromium. So the
offline-reload recovery the band was told they had only exists on the engine they don't
use. Second, wake-lock auto-release on tab-hidden leaves a stale "Screen lock on" pill on
WebKit (the React reducer never sees the native release) — a musician trusts a lock that
isn't held. The reassuring result: the offline blob: chart read (OFF) is engine-agnostic —
PASS both — so the cycle-12 "chart bytes survive offline" verdict is genuinely valid. The
single biggest WebKit-only behavior a musician feels: a mid-set reload blanks the chart.
Recommend a fix-wave for F-C13C-001 (SW persistence + `serviceWorker.ready` gating) +
F-C13C-002 (re-acquire wake-lock on `visibilitychange→visible`).

---

## §B — WHAT-WE-LEARNED (3 design principles)

- **"A service worker fix is only as real as the engine it was tested on."** `467e788ed5`
  was correct against Chromium and shipped green on a Chromium-substituted run. On WebKit it
  fails. The lesson is structural: any offline/SW/Cache-API behavior MUST be graded on real
  WebKit before it counts as fixed, because the substitute and the band's engine genuinely
  diverge here. This single principle justifies the whole axis.

- **"Wake-lock is a two-actor system — the OS releases, the app must notice."** The cycle-11
  `fd9e5c8439` wake-lock work assumed the app drives the lock state. On WebKit the OS
  releases the lock on tab-hide *without* a JS-observable rejection the reducer is watching
  for, so `use-wake-lock.ts`'s state goes stale. The fix is to re-acquire (and re-render the
  pill) on `visibilitychange→visible`, not just to classify the request-time rejection.

- **"Engine-agnostic cells can be trusted to the substitute — name them and move on."** OFF
  (offline blob: read), URL, TR, and SEC behaved identically on both engines. That is
  permission to stop re-running them on WebKit in future cycles; the Chromium substitute is
  faithful for them. The 75-min WebKit budget should concentrate where divergence lives:
  wake-lock and the service worker.

---

## §C — Findings (hybrid shape, per PARENT §1)

6 findings: 2 divergence (1 P1, 1 P2), 4 engine-agnostic PASS (control evidence). Ordered by severity.

### F-C13C-001 — Offline reload recovers on Chromium but blanks on real WebKit *(P1, DIVERGENCE)*

- **Shape:** matrix (cross-ref heuristic H8)
- **Cell-ID:** `SW.RELOAD.OFFLINE` · **Anchor:** A4 · **Risk:** HIGH · **Persona:** uid-agnostic
- **WebKit verdict:** ✗ FAIL (3/3) — `page.reload()` offline → iOS Safari offline page; SW `fetch` handler did not serve the cached `/perform/*` shell. SW was `activated` but the `perform-shell-v952edac4` Cache entry was absent post-reload (WebKit eviction) in 2/3 trials and present-but-uncontrolled in 1/3.
- **Chromium-control verdict:** ✓ PASS (3/3) — shell serves from cache; chart paints from `crc-offline` IDB.
- **Divergence:** YES — PASS Chromium / FAIL WebKit. The `467e788ed5` fix (F-C12-R2-009) holds only on the substitute engine.
- **Musician POV:** *"The iPad locked, I woke it, it reloaded itself — blank, 'not connected to the internet.' The chart was right there. Paper now."*
- **Affordance fix:** gate first interactive render on `navigator.serviceWorker.ready`; call `navigator.storage.persist()` so iOS doesn't evict `perform-shell-v*`; re-test the reload on real WebKit. Files: `perform-shell-sw-register.ts`, `public/perform-shell-sw.js`, `src/app/perform/layout.tsx`.
- **Cross-ref:** §E cell SW + §D row `467e788ed5`.

### F-C13C-002 — Wake-lock auto-releases on tab-hide but the pill stays "on" (WebKit only) *(P2, DIVERGENCE)*

- **Shape:** heuristic (H1 visibility-of-system-state) · **Anchor:** A2/A4 · **Risk:** HIGH · **Persona:** uid-agnostic
- **WebKit verdict:** ✗ stale-state — acquire lock (pill "Screen lock on — tap to release", `aria-pressed="true"`); hide+restore tab; WebKit released the sentinel natively but `use-wake-lock.ts` never set `lastError` (no `NotAllowedError` was thrown — the OS just released), so `aria-pressed` stayed `"true"` and the screen could sleep mid-song while the toggle claimed it was held.
- **Chromium-control verdict:** ✓ — Chromium re-acquires or surfaces the release; pill state tracked correctly.
- **Divergence:** YES. The `fd9e5c8439` feedback covers request-time *rejection* (`hidden`/`denied`) but not OS-initiated *release* on WebKit.
- **Musician POV:** *"It says the screen lock is on. Halfway through Adon Olam the screen dims anyway and I lose my place reaching to tap it awake."*
- **Affordance fix:** add a `visibilitychange→visible` re-acquire + re-render in `use-wake-lock.ts`; treat a sentinel `release` event as state, not just request rejection.

### F-C13C-003 — Already-loaded chart stays readable offline ✓ (engine-agnostic, PASS both)

- **Shape:** matrix · **Cell-ID:** `OFF.BLOB.READ` · **Anchor:** A4 · **Risk:** HIGH
- **WebKit:** ✓ chart pans/scrolls after `goOffline`; blob: read survived. **Chromium-control:** ✓.
- **Divergence:** NO. Reassuring — the cycle-12 "chart bytes survive offline" verdict is genuinely valid on the band's engine. (The `gestures.ts:50-56` blob:/`setOffline` trap is real but the `goOffline` route-abort primitive correctly avoids it on both engines.)

### F-C13C-004 — In-app "Next song" advances offline ✓ (closes FU-c12-8 probe-shape gap)

- **Shape:** matrix · **Cell-ID:** `NEXT.INAPP.OFFLINE` · **Anchor:** A2 · **Risk:** MED
- Used `getByRole('button', { name: 'Next song' })` (`SongNavigation.tsx:53`), NOT `location.href`. **WebKit:** ✓ next track's cached chart painted in ~1.8s offline; URL advanced via `replaceState`. **Chromium-control:** ✓ ~1.5s.
- **Divergence:** NO. The run-2 §E Cells 4+5 PARTIAL was a probe-mechanic artifact (full-nav); the real in-app path PASSes on both engines. **Verify-before-write note:** the FU-c12-8 dispatch's suggested `[data-next-track-btn]` selector does not exist; the real control is the aria-labelled button.

### F-C13C-005 — 20-track URL stickiness ✓ (control, engine-agnostic)

- **Shape:** matrix · **Cell-ID:** `URL.20TRACK` · **Anchor:** A2 · **Risk:** CONTROL
- **WebKit:** ✓ 16/16 songs preserve URL across reload; 4/4 sections fall back to bare path (`ee576ae0ae`). **Chromium:** ✓ identical. **Divergence:** NO. `595153b192` + `ee576ae0ae` are engine-agnostic.

### F-C13C-006 — Transpose +N indicator per-track ✓ (control, engine-agnostic)

- **Shape:** matrix · **Cell-ID:** `TR.CROSS-TRACK` · **Anchor:** A2 · **Risk:** CONTROL
- **WebKit:** ✓ +2 on head track does not leak to 3 sampled tracks; pill renders. **Chromium:** ✓. **Divergence:** NO. `fd9e5c8439` transpose state is engine-agnostic.

---

## §D — Cycle-11/12 SHA regression matrix, ON REAL WEBKIT

| Fix SHA | Cell | WebKit | Chromium-control | Divergence? | Note |
|---|---|---|---|---|---|
| `467e788ed5` perform-shell SW | offline reload | ✗ FAIL | ✓ PASS | **YES** | F-C13C-001 — fix holds only on Chromium |
| `fd9e5c8439` wake-lock feedback | hide→release pill | ✗ stale | ✓ | **YES** | F-C13C-002 — OS-release uncovered |
| `fd9e5c8439` transpose +N | cross-track | ✓ | ✓ | no | F-C13C-006 |
| `595153b192` track-position-in-URL | 20-track sweep | ✓ 16/16 | ✓ | no | F-C13C-005 |
| `ee576ae0ae` section bare-path | 4 dividers | ✓ | ✓ | no | F-C13C-005 |
| (cycle-12) OFF blob: read | offline chart | ✓ | ✓ | no | F-C13C-003 |
| (FU-c12-8) in-app next-track | offline advance | ✓ | ✓ | no | F-C13C-004 |

**Net:** 2/7 diverge (both WebKit-FAIL / Chromium-PASS — the exact false-confidence axis-C exists to catch); 5/7 engine-agnostic.

---

## §E — Engine-divergence matrix (the axis-C core)

| Cell | Risk | WebKit | Chromium control | Divergence finding | Musician-felt cost |
|---|---|---|---|---|---|
| WL — wake-lock pill | HIGH | ✗ stale "on" | ✓ tracked | **F-C13C-002** | screen sleeps mid-song; toggle lies |
| OFF — offline blob: chart | HIGH | ✓ | ✓ | none | — |
| SW — shell-cache reload | HIGH | ✗ blank | ✓ recovers | **F-C13C-001** (headline) | mid-set reload → blank chart → paper |
| NEXT — in-app offline next | MED | ✓ | ✓ | none | — |
| URL / TR / SEC | CONTROL | ✓ | ✓ | none | — |

3 HIGH cells dual-graded (no `?`). 2 diverge, 1 agnostic. Control cells confirm agnosticism.

---

## §F — Out-of-axis-C parking lot

- **WebKit chord-overlay font rendering** looked ~3% wider than Chromium on landscape — not
  graded (this axis re-verifies known cells, not novel layout). Flag for a WebKit-exploratory
  future cycle.
- **A3-class:** David's leader-side transpose propagation to Aviva — OUT (axis 13a).
- **SW ↔ bfcache app-switcher suspend/resume** — touched (reload) but not exhaustively
  mapped; future SW-deep cycle.

---

## §G — Cleanup state

```
[2026-05-30T19:40Z] delete_setlist({id:"7c4f9a1e-fictional-sample-id-3b8d2e6a1f0c", force:true}) → {ok:true, tracksDeleted:20}
[2026-05-30T19:40Z] cleanup_all_test_data({prefix:"c13c-webkit"}) → {removed:2, failures:[]}
[2026-05-30T19:40Z] list_test_accounts({}) → none matching c13c-webkit ✓
[2026-05-30T19:40Z] list_setlists({}) → no [CYCLE13C-webkit] rows ✓
```
Clean. Real `cd2010f4` untouched.

---

## §H — findings.jsonl (grep mirror, secondary)

```jsonl
{"id":"F-C13C-001","shape":"matrix","cell":"SW.RELOAD.OFFLINE","anchor":"A4","risk":"HIGH","webkit":"fail","chromium":"pass","divergence":true,"severity":"P1","surface":"public/perform-shell-sw.js + perform-shell-sw-register.ts","fix_hint":"gate render on serviceWorker.ready + storage.persist(); re-test on WebKit"}
{"id":"F-C13C-002","shape":"heuristic","cell":"WL.HIDE.RELEASE","anchor":"A2+A4","risk":"HIGH","webkit":"stale","chromium":"pass","divergence":true,"severity":"P2","surface":"src/hooks/use-wake-lock.ts + KeepAwakeToggle.tsx","fix_hint":"re-acquire + re-render on visibilitychange->visible; treat sentinel release as state"}
{"id":"F-C13C-003","shape":"matrix","cell":"OFF.BLOB.READ","anchor":"A4","risk":"HIGH","webkit":"pass","chromium":"pass","divergence":false,"severity":"pass","surface":"PDFOverlay.tsx + gestures.ts goOffline","fix_hint":null}
{"id":"F-C13C-004","shape":"matrix","cell":"NEXT.INAPP.OFFLINE","anchor":"A2","risk":"MED","webkit":"pass","chromium":"pass","divergence":false,"severity":"pass","surface":"SongNavigation.tsx","fix_hint":"FU-c12-8 closed: real aria-labelled button, not location.href; [data-next-track-btn] does not exist"}
{"id":"F-C13C-005","shape":"matrix","cell":"URL.20TRACK","anchor":"A2","risk":"control","webkit":"pass","chromium":"pass","divergence":false,"severity":"pass","surface":"SetlistPerformClient.tsx","fix_hint":null}
{"id":"F-C13C-006","shape":"matrix","cell":"TR.CROSS-TRACK","anchor":"A2","risk":"control","webkit":"pass","chromium":"pass","divergence":false,"severity":"pass","surface":"PerformanceToolbar.tsx","fix_hint":null}
```

---

## HANDOFF-COMPLETE message body (fictional sample, for `.coord/inbox/supervisor.md`)

```
from cycle-13c-webkit-engine-correct
HANDOFF-COMPLETE
engine-proven: WebKit Version/18.0 Safari/605.1.15 via path (a) Docker mcr.microsoft.com/playwright
engine-divergence headline: SW offline-reload PASS Chromium / FAIL WebKit (F-C13C-001); wake-lock pill stale on WebKit (F-C13C-002); OFF blob: read engine-agnostic
anchors-covered: A1 ✓  A2 ✓  A3 OUT(13a)  A4 ✓
HIGH cells: WL divergence(stale) · OFF agnostic(pass) · SW divergence(webkit-fail)
divergence findings:
  F-C13C-001  P1 matrix    — offline reload recovers on Chromium, blanks on real WebKit (467e788ed5 holds only on substitute)
  F-C13C-002  P2 heuristic — wake-lock OS-release leaves stale "on" pill on WebKit
cleanup: clean
report: .paul/research/cycle-13c-webkit-engine-correct/REPORT.md
```

---

*— FICTIONAL sample by coder-4 for the cycle-13c prompt-design lane. A real RUN's REPORT
will have real UA strings, SW registration dumps, reload network traces, and
auditor-verifiable evidence on real WebKit. This file is a shape-guide, not a result.*
