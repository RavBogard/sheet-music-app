# Cycle-13c — DESIGN-NOTES

**Authored:** 2026-05-29 (coder-4 lane `cycle-13c-webkit-engine-correct-PROMPT-design`)
**Anchor SHA:** origin/master `952edac4c3`
**Companion docs:** [PROMPT.md](./PROMPT.md), [SAMPLE-REPORT.md](./SAMPLE-REPORT.md)
**Charter:** `.coord/cycle-13-CHARTER.md` (axis C of 4 — disjoint from 13a/13b/13d)

---

## Why an engine-correctness axis (and why now)

Every prior cycle assumed its iPad probes ran on the band's engine. They did not. Cycle-12
run-2 is the proof: the supervisor pre-ran `npx playwright install webkit`, the harness
*tried* to drive `ipad-webkit`, and the WebKit binary **could not launch** because the
cowork sandbox lacked four system shared libraries (`libevent-2.1.so.7`, `libenchant-2-2`,
`libsecret-1-0`, `libGLESv2`) and had no `sudo`/`apt` to install them. The run fell back to
**Chromium-with-an-iPad-UA at 1180×820** and was honest about it (its §A header note + §F
items #5/#6 spell out the substitution). But honesty doesn't close the gap: **every
WebKit-specific behavior on the surface the 6 band iPads actually use is still un-probed.**

This is not a hypothetical worry. The clearest evidence is in the harness itself:
`e2e/helpers/gestures.ts:50-56` documents that `context.setOffline(true)` breaks `blob:`
URL fetches **on ipad-webkit specifically** — react-pdf reads a cached chart via a `blob:`
URL, so `setOffline` yields a *false* failure on WebKit but not on Chromium. That comment
is empirical proof that this app already has at least one behavior that differs by engine.
If the offline matrix is graded on Chromium, that whole class of WebKit-only behavior is
invisible.

**Why now:** cycle-12 surfaced the gap and queued it as FU-c12-9. Cycle-13 runs four
surface-axes in parallel (charter); axis C is the one that asks "is the engine even right?"
before any future cycle spends another 75 minutes producing Chromium verdicts mislabeled as
iPad verdicts. It is cheap insurance against a whole category of false-confidence.

**The methodology choice — DIVERGENCE, not re-discovery.** This axis does NOT re-hunt for
new bugs. It re-runs cycle-12's *already-graded* offline + stickiness cells with one new
variable: the engine. The unit of value is a **divergence** — a cell whose verdict changes
between real WebKit and the Chromium substitute. The strongest possible finding is "PASSES
on Chromium, FAILS on WebKit," because that is a bug the band feels every week that no prior
cycle could see. The second-strongest is the reassuring inverse: "zero divergence across all
HIGH cells," which *retires the engine-substitution caveat* and lets future cycles trust the
substitute for these surfaces. Either outcome is high-value; a NOT-RUN (couldn't launch
WebKit again) is honest but low-value and must be loud.

---

## How cycle-13c grades the anchor moments + bug-classes

Same anchor set as the charter; this axis touches three:

| Anchor | 13c status | Engine angle |
|--------|-----------|--------------|
| **A1 setup-prep** | light | chart-load + offline-cache priming feeds the OFF/SW cells; not a standalone grade. |
| **A2 between-songs** | IN | the in-app "Next song" offline path (NEXT, closes FU-c12-8) + transpose/URL stickiness controls. |
| **A3 mid-service change** | OUT | owned by axis 13a; do not probe. |
| **A4 sanctuary edge** | IN — primary | the offline matrix (OFF/SW) + wake-lock (WL) under flaky-wifi conditions. This is where engine divergence concentrates. |

Bug-classes: **stickiness** is the regression surface (the cycle-11/12 SHAs re-graded on
WebKit). **Fresh-tablet** is OUT (cycle-11 M3). **Auth-divergence** is secondary, and is
the ONE place the 3-persona axis carries real information — the offline chart-overlay cells
are uid-agnostic (run-2 §B principle #1), so persona divergence lives at the listing /
`list_setlists` scope, not under the offline probe.

The novel grading dimension this axis adds is **engine-divergence-risk** (HIGH vs CONTROL),
which the `/ui-ux-pro-max` design lens drove (below). The 75-minute budget is spent on the
three HIGH cells; CONTROL cells run once each to confirm engine-agnosticism.

---

## The design judgment — which cells diverge, and the musician's cost (`/ui-ux-pro-max` lens)

The core design call is the HIGH/CONTROL ranking. It is not arbitrary; each HIGH cell has a
concrete, documented reason WebKit's behavior departs from Chromium's, and a concrete
musician-felt cost:

- **WL (wake-lock) — HIGH.** iOS Safari shipped the Screen Wake Lock API only in 16.4 and
  auto-releases the lock on `visibilitychange→hidden` with different timing and different
  transient-activation rules than Chromium. `use-wake-lock.ts:100` classifies
  `hiddenAtRequest` *before* the request and maps `NotAllowedError`→`hidden`/`denied`
  (lines 124-126). Run-2 validated the pill copy by **monkey-patching**
  `navigator.wakeLock.request` to throw on Chromium — which tests the *React reducer*, not
  the *engine*. On real WebKit the native rejection + native auto-release is what fires, and
  it may strand a stale "on" pill or show the wrong copy. **Musician cost:** the screen
  dims mid-song; the chart goes dark on a stand under sanctuary lights; the toggle says
  "on" but the screen slept. That is a panic moment with hands full.

- **OFF (offline blob: chart) — HIGH.** The `goOffline` helper exists *because* WebKit
  breaks blob: fetches under `setOffline` (`gestures.ts:50-56`). The blob: URL lifetime +
  offline read is the single most engine-dependent behavior in the app. A Chromium
  substitute provably cannot validate it. **Musician cost:** wifi blips during a reading;
  the chart that was on screen blanks; paper.

- **SW (shell-cache reload) — HIGH, the headline.** `467e788ed5` re-introduced a hand-rolled
  NetworkFirst SW (`public/perform-shell-sw.js`, registered by `registerPerformShellSW()` in
  `perform-shell-sw-register.ts`, mounted `perform/layout.tsx:151`) specifically to fix
  F-C12-R2-009 (offline reload returned `net::ERR_FAILED` because the old `public/sw.js` is
  a self-uninstalling tombstone). iOS WebKit's SW + Cache API differs sharply from Chromium:
  7-day + storage-pressure eviction, different activation/`clients.claim` timing, and — the
  one a designer must call out — **iOS overscroll pull-to-refresh can trigger the very
  reload the SW must survive.** The fix was never run on real WebKit. **Musician cost:** the
  iPad home-screens (a kid bumps it), they reopen, and either the SW saves them (the fix
  works) or they get a blank offline page (the fix only works on the engine they don't use).

- **NEXT — MED.** React-state navigation likely survives offline on both engines, but it
  couples to OFF (the new track's blob: read). The design fix vs run-2 is mechanical but
  important: use the **real** "Next song" control (`SongNavigation.tsx`, `aria-label="Next
  song"`), not `location.href` — a verify-before-write correction, because FU-c12-8's
  dispatch suggested a `[data-next-track-btn]` selector that **does not exist** in the code.

- **URL / TR / SEC — CONTROL.** `history.replaceState`, React transpose state, section
  special-case — engine-agnostic JS. They run once on each engine to *confirm* that
  agnosticism and to serve as the divergence control. If a CONTROL cell diverges, that is a
  genuine surprise worth promoting.

The `/ui-ux-pro-max` UX guidelines reinforced the cost framing: "Error Recovery — provide
clear next steps, not an error-only state" and "Error Feedback — no silent failures" are
exactly what the WL and SW cells test (does the musician get a path back when the engine
behaves differently?). The 44px touch-target + 8px-spacing rules underwrite why the "Next
song" control is the right primitive (it is a real, reachable button, `h-14 w-14` per
`SongNavigation.tsx`).

---

## The report shape — one worked-example finding, end-to-end

To make the divergence shape concrete, here is one fictional-but-realistic finding walked
end-to-end. (Anchored on real components + the real `467e788ed5` SW.)

### F-C13C-001 — Offline reload recovers on Chromium but blanks on real WebKit

- **Shape:** matrix (with heuristic cross-reference — H8 recover-from-errors)
- **Cell-ID:** `SW.RELOAD.OFFLINE` (engine-divergence)
- **Anchor moment:** A4 (sanctuary edge)
- **Engine-divergence risk:** HIGH (the headline cell)
- **Persona:** uid-agnostic (SW lifecycle is browser-global)
- **Action:** online-load `/perform/setlist/<clone>/track/<trackId>` until `_next/static`
  chunks + HTML are in the `perform-shell-v*` cache; `goOffline(page)`; `page.reload()`.
- **WebKit verdict:** ✗ FAIL — `page.reload()` while offline returns the iOS Safari offline
  page; the SW's `fetch` handler did not serve the cached shell. Cause hypothesis: WebKit
  evicted the `perform-shell-v*` Cache entry under storage pressure within the session, OR
  `clients.claim()` had not completed control of the navigation before the reload (WebKit's
  activation timing). Reproduced 3/3.
- **Chromium-control verdict:** ✓ PASS — identical steps; the shell serves from cache; the
  chart paints from the `crc-offline` IDB store. Reproduced 3/3.
- **Divergence:** YES — PASS Chromium / FAIL WebKit. **This is the axis-C jackpot:** the
  `467e788ed5` fix that closed F-C12-R2-009 *on Chromium* does not hold on the band's
  engine, and no prior cycle could have seen it because they all ran Chromium.
- **The musician's experience (first-person POV):**
  > "The iPad locked while I waited for the next song. I tapped it awake and it reloaded
  > itself. Blank page — 'Safari cannot open the page because it is not connected to the
  > internet.' The chart was right there a second ago. I'm on paper now."
- **Affordance fix (1-3 sentences):** Verify the SW reaches `activated` + `clients.claim()`
  *before* the perform route is interactive (gate first render on `navigator.serviceWorker.ready`),
  and add a WebKit-targeted Cache-persistence request (`navigator.storage.persist()`) so iOS
  doesn't evict `perform-shell-v*` under pressure. Re-test the reload on real WebKit, not
  Chromium. Until fixed, the run's §A notes the band should avoid reloading mid-set on the
  iPads (paper fallback remains the implicit backstop).
- **Cross-reference:** §E matrix cell SW + §D row `467e788ed5`.

**Why this finding is divergence-primary:** the *value* is entirely in the two-engine
contrast. On its own, "offline reload fails on WebKit" reads like a known limitation; paired
with "but PASSES on Chromium," it becomes "we shipped a fix that only works on the wrong
engine" — which is the exact false-confidence this axis exists to catch. A cycle-12-style
single-engine run would have recorded a green SW cell and moved on.

---

## Honest weaknesses — what cycle-13c will likely MISS

1. **It re-grades known cells; it does not hunt new bugs.** If real WebKit has a *novel*
   failure outside the cycle-11/12 cell set (say, a WebKit-only layout break in the chord
   overlay, or a font-rendering issue in the chart), this axis isn't looking for it. It is a
   verification axis, not a discovery axis. A future cycle could do a broad WebKit-only
   exploratory sweep.

2. **It is hostage to the provisioning problem it is trying to solve.** If neither the
   Docker image (a) nor a privileged warm-worktree (b) lands at run-time, the run produces a
   loud NOT-RUN (outcome c) and learns nothing about the engine — the same gap, one cycle
   later. The PROMPT mitigates by recommending the Docker path concretely, but it cannot
   *guarantee* the run environment; that is a Phase-3 supervisor/Daniel provisioning call.

3. **The Chromium control lane is the run-2 substitute, not Daniel's dev Chrome.** Divergence
   is measured against the *same* Chromium-with-iPad-UA run-2 used, so a "no divergence"
   result certifies "the substitute was fine for these cells" — it does NOT certify against a
   third engine (Firefox/Gecko) or against a real device's quirks beyond engine (true touch
   latency, real GPU, real battery throttling). Real-hardware is still a gap.

4. **Wake-lock on WebKit is partially un-simulatable.** Some iOS Safari wake-lock behaviors
   (true screen-sleep timing, low-power-mode interactions) only manifest on physical
   hardware; Playwright-WebKit on a Linux/Docker host approximates the engine, not the OS
   power manager. The WL cell can catch API-shape + reducer divergence but not OS-level
   sleep behavior. Note this explicitly in the run's §A.

5. **uid-agnostic cells dilute the 3-persona axis.** As run-2 found, WL/OFF/SW don't differ
   by persona, so the persona axis is "control" on the HIGH cells. The auth-divergence
   bug-class is therefore lightly covered here; axis 13b (MCP authoring) and the listing-page
   scope carry it better.

6. **bfcache and SW interaction is a known WebKit minefield only sampled.** iOS Safari's
   back-forward cache interacts with service workers in ways the SW cell touches (reload)
   but doesn't exhaustively map (back-nav restore, app-switcher suspend/resume). A deeper SW
   ↔ bfcache probe is a future-cycle item.

These are shipped knowingly. The supervisor's post-13c triage should treat (1)-(6) as
planned gaps, not missed bugs.

---

## What "engine-correctness verdict" means in §A

- **CLEAN — zero divergence.** All 3 HIGH cells behave identically on WebKit and Chromium.
  Strong, reassuring: the engine-substitution caveat is RETIRED for these surfaces; future
  cycles may trust the Chromium substitute for the offline+stickiness matrix.
- **DIVERGENCE FOUND <IDs>.** ≥1 HIGH cell diverges. Each divergence is a band-felt bug
  invisible to prior cycles; the supervisor's triage owns the fix-wave dispatch (Phase 4).
- **NOT-RUN — real WebKit unavailable.** Neither provisioning path landed; loud BLOCKER. The
  gap persists; the run learned only "we still can't launch WebKit," which routes back to
  the provisioning problem (Docker image / privileged warm-worktree).

The verdict is the cowork instance's call; the supervisor's triage owns the dispatch.

---

— from coder-4 (lane `cycle-13c-webkit-engine-correct-PROMPT-design`)
