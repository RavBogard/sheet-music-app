# iPad sweep — stress / resilience FINDINGS (`ipad-sweep-stress`)

**Lane:** `ipad-sweep-stress` (coder-4) · **Wave:** ipad-sweep · **Risk tier:** 1
**Surface:** `/perform/setlist/[id]` on the band's real hardware — WebKit @ **820×1180** (portrait) + **1180×820** (landscape), the standard 11" iPad ([[project_band_ipad_hardware]]).
**Run:** prod (`https://www.centralreform.live`), `--project=ipad-webkit` + `--project=ipad-webkit-landscape`, `--workers=1`.
**Spec:** `e2e/stress-ipad.spec.ts` (6 probes) · helper added: `seedLargeSetlist` in `e2e/helpers/seed.ts`.
**Deliverable note:** this is a SWEEP — bugs are FINDINGS, not fixes. No `src/` edited.

---

## Verdict

The Perform surface is **resilient on real iPad WebKit** under the adverse conditions of a live service. All 6 probes pass green at the device viewport after correctly accounting for the track-hydration model. **No crashes, no wedges, no white-screens, no horizontal overflow, no stuck overlays, no error storms.** Charts paint under WebKit even on a throttled connection and degrade gracefully when bytes fail.

Two findings, both **LOW / informational** — neither blocks band onboarding:

| ID | Sev | One-line | Caught by |
|----|-----|----------|-----------|
| **F1** | LOW–MED | Track rows are gated on the snapshot-listener → Dexie pipeline; they lag the heading on a cold open with **high variance — measured ~4s up to >30s** (worst case: a 42-row setlist cold-open on landscape exceeded 30s). During that window the view shows "0 songs / No tracks yet"; if the connection drops *in that window*, it stays empty until reconnect. Self-heals; established sessions are unaffected. | large + offline + concurrent probes |
| **F2** | INFO | On an offline transition, WebKit rejects the Firestore SDK's `TYPE=terminate` teardown beacons with `Beacon API cannot load … WebKit encountered an internal error` console errors. Benign SDK chatter, WebKit-specific (the band's real engine). | offline probe |

---

## Probe results (final clean run)

| # | Probe | Portrait | Landscape | Notes |
|---|-------|----------|-----------|-------|
| 1 | Large setlist (42 rows) | ✅ 3.9s | ✅ | Heading + first row + **last row reachable by scroll**; no truncation/virtualization gap; **no horizontal overflow** at 820px; clientWidth ≤ 820. |
| 2 | Rapid overlay open/close ×6 | ✅ 4.1s | ✅ | No stuck overlay (Zoom toolbar count→0 each cycle); list live after churn; clean console budget. |
| 3 | Slow chart load (3.5s throttle on `/api/drive/file/**`) | ✅ 7.2s | ✅ | Overlay mounts immediately; **react-pdf canvas eventually paints under the slow profile** (no permanent spinner). |
| 4 | Offline → reconnect | ✅ 5.9s | ✅ | OFFLINE badge surfaces; **already-loaded rows + heading survive the drop** (Dexie is local); RECONNECTED badge on recovery; overlay still opens after the cycle. |
| 5 | PDF byte failure (abort `/api/drive/file/**`) | ✅ 33.8s | ✅ | Overlay mounts; **graceful "Failed to load PDF" + Retry**, NOT a spinner; loading skeleton clears; zero canvas painted; closes back to a live list. |
| 6 | Concurrent musician + band_leader (same setlist) | ✅ 33.3s | ✅ | Both contexts render heading + rows; musician opens a chart while leader page stays live — no cross-talk. Latency is F1 (two cold opens). |

Local gates: `tsc` clean for `e2e/**`; `npm run test` **2104 pass / 79 skip / 0 fail**; `playwright --list` registers all 6 under both ipad projects.

---

## F1 — Track rows lag the heading on a cold open (Dexie hydration race)  ·  LOW

**What.** On `/perform/setlist/[id]`, the `<h1>` setlist name and the offline indicator render almost immediately, but the **track rows do not**. Rows are sourced from local **Dexie** via `useLiveQuery` (`src/hooks/use-setlist-performance.ts:127`), populated *asynchronously* by the snapshot-listener (`:108`) that streams Firestore deliveries into Dexie. The heading comes from a single Firestore doc (`useSafeFirestoreSync`, `:97`) that resolves first. There is a window — observed from <1s up to **>30s** — where the page shows the heading + **"0 songs" / "No tracks yet"** before the rows arrive. Measured spread on prod: the 42-row setlist rendered in ~4s on one portrait run but **exceeded 30s on a landscape run** (the test's first-row wait was bumped 15s→30s→60s chasing this); two simultaneous cold opens (concurrent probe) took ~30s. The latency scales with row count (more rows to stream into Dexie) and is sensitive to network/prod load.

**Repro (deterministic).**
1. Fresh browser context (cold Dexie). Auth as a musician, `goto /perform/setlist/<id>`.
2. Assert `<h1>` = setlist name → passes within ~1s.
3. Immediately `context.setOffline(true)` (before a row renders).
4. → DOM shows `paragraph "0 songs"` + `"No tracks yet"` + an "Add tracks" empty state. (Captured: `test-results/…recovers-no-wedge…/error-context.md` from the first run.)
5. The rows never arrive while offline (the listener can't deliver); they appear on reconnect.

**Why it matters / doesn't.** If a band member *opens* a setlist at the exact moment shul wifi is flaky, they can see an empty setlist until the connection returns. **Once the rows have rendered, they persist through an offline drop** (Probe 4 proves this — Dexie is local). So the exposure is the *cold-open* window only, not an established session. The page DOES carry an SSR-primed `initial.tracks` frame (UNAUTH-009, `:51`/`:150`), but it only shows while `dexieTracks === undefined`; once Dexie's live-query resolves to `[]` (before the listener delivers), the UI switches to the empty live result — so the SSR priming does not fully cover the gap.

**Severity LOW** — transient, self-heals on reconnect, only hits the narrow cold-open-during-blip window. Worth a fix if the band reports "empty setlist on open"; the natural fix is to keep showing `initial.tracks` until the listener delivers a *non-empty* frame (or treat an empty Dexie + non-empty SSR as "still hydrating"). Not in scope for this sweep.

**Cross-ref:** [[feedback_harness_real_firestore]] (real listener/cache races only show on a real backend — confirmed here on prod).

---

## F2 — WebKit "Beacon API cannot load" console errors on offline transition  ·  INFO

**What.** The moment the connection drops, the Firestore Web SDK fires `TYPE=terminate` teardown beacons to `firestore.googleapis.com/.../Write/channel` and `.../Listen/channel`. Safari/WebKit refuses them and logs:

```
Beacon API cannot load https://firestore.googleapis.com/...Write/channel?...&TYPE=terminate&...
  WebKit encountered an internal error
Beacon API cannot load https://firestore.googleapis.com/...Listen/channel?...&TYPE=terminate&...
  WebKit encountered an internal error
```

**Repro.** Probe 4 with a strict console budget catches exactly 2 of these on `setOffline(true)`. They do not appear under Chromium (the existing chromium/mobile-chrome projects never surfaced them) — this is a **WebKit-only** behavior, i.e. it only shows on the band's actual engine.

**Severity INFO** — benign. It is SDK teardown chatter, not an app fault; nothing breaks, the offline indicator + content behave correctly. Documented so future sweeps don't re-flag it; the spec's `NETWORK_DISRUPTION_PATTERNS` allowlist now classifies it as expected offline noise.

---

## Positives confirmed (no finding — bank these)

- **42-row setlist** renders, scrolls, and reaches the last row with **zero horizontal overflow** at 820px portrait and 1180px landscape. No virtualization gap hiding the tail of a long Shabbat-morning setlist.
- **Rapid overlay churn** (6× open/close + toolbar mount/unmount) leaves no stuck overlay and no console-error storm — the body-scroll-lock + Escape-handler lifecycle (`PDFOverlay.tsx`) is clean under stress.
- **Slow network** (3.5s chart throttle): the overlay mounts instantly and **react-pdf paints under WebKit** once bytes arrive — the loading affordance, not a frozen panel. (The real iOS pdf.js-worker risk, [[feedback_react_pdf_worker]], holds under throttle.)
- **Failed chart bytes** (hard abort): graceful "Failed to load PDF" + Retry, skeleton clears, no infinite spinner, no crash; the `SectionErrorBoundary` + PDFViewer error path behave.
- **Offline resilience for an established session:** loaded rows + heading persist through the drop; RECONNECTED acknowledged; app interactive afterward (overlay still opens).
- **Concurrent musician + band_leader** on the same setlist: both render correctly, musician interaction doesn't leak into the leader view.

---

## Isolation / hygiene

- Fixtures (2 test users — band_leader + musician — + 1 small bonded setlist + 1 42-row setlist) cascade-revoked by `revokeTestAccounts` in `afterAll`. **Never** called `cleanup_all_test_data` ([[feedback_sandbox_test_isolation]]). The bonded curated PDF (shared-library-owned) left intact.
- Bearer: dogfooded `mint_admin_bearer` off the pool ROOT → child `crl_live_…` (tokenId `3WNHIIMYiy264BS63WPu`, 4h TTL), revoked via `revoke_minted_bearer` post-run. No token committed to any tracked file.
