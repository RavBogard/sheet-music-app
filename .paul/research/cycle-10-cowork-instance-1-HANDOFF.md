# Cycle-10 Cowork Instance-1 HANDOFF — Real-usability iPad sweep

**Run date:** 2026-05-28T01:29Z (single-thread cowork-Claude session, ~75 min wall-clock)
**Viewport:** **window resize to 820×1180 returned success but Chrome on Windows clamped to 1920×945** (OS minimum-window-width). Layout grading was at 1920px window with 672px (max-w-2xl) content column — close to iPad portrait at the content level, NOT a true 820×1180 simulation. **The harness's `ipad-webkit` + `ipad-webkit-landscape` Playwright projects remain the authoritative iPad-viewport vehicle** (not run from this Cowork seat — see "Run scope" below).
**Auth:** public-surface (no auth) probed in source; live pass executed on Daniel's auth'd session (Firebase Auth `daniel@centralreform.org`, persisted in IndexedDB `centralreform`/`crc-local` DBs — no cookies). **Authed-branch §4 named target verified LIVE; logged-out branch source-verified only — live degraded by seat-bound auth.**
**Master SHA at run:** `93e76c39e0` — `docs(cowork): reframe cycle-10 sweep to usability/iPad-first (Daniel directive)`. The §4 anchor `6e043a4ce5` (perform-public-auth-and-cap) confirmed in master history (`git merge-base --is-ancestor → YES`); no surface delta between anchor and run SHA (the only commit after was this cycle-10 reframe doc).
**Working-tree HEAD:** `3e1d9b4fd2` on `fix/b1-error-envelope-sweep` — all source verification done via `git show origin/master:<path>` to keep the checkout untouched.
**Harness REPORT:** **NOT GENERATED — `npm run stress --projects=ipad-webkit,ipad-webkit-landscape ...` not executable from this Cowork seat** (no shell/process invocation surface for the harness). Part 1 is **deferred to a shell-mounted session**. Daniel runs `npm run stress -- --projects=ipad-webkit,ipad-webkit-landscape --categories=A,B,C,D,E,H,J,K,L,S --run-id=c10i1-ipad` at his convenience; the resulting `cycle-4/harness/out/REPORT-stress-c10i1-ipad.md` belongs in the artifacts dir alongside this HANDOFF.
**Cleanup state:** read-only, no fixtures created. No `c10i1-*` accounts, no charts, no setlists.

## Usability verdict: **N-FRICTION** (2 HIGH, 1 MED, 2 LOW, 3 INFO; 0 BLOCKER) — clean enough to ship Saturday's service on the current iPad surface, with two HIGH issues that should be triaged + HELD for post-service per §7.1 (one is a render-touching fix to the toolbar; one is a Firestore songCount backfill).

| Area | Verdict | Evidence |
|------|---------|----------|
| Public /perform landing (authed branch, named target) | **PASS** | Listing-only, 5 rows total (1 upcoming + 4 past), upcoming-first; Saturday's B'nei Mitzvah sits at the top of UPCOMING ✓; cap=5 enforced; no Sign-In card for authed daniel@centralreform.org ✓; KeepAwakeToggle 83×44 (HIG met) ✓; section gap upcoming→past 64px clearly distinct; adjacent card gap 12px (above HIG 8pt min). Screenshot evidence: described inline below — `save_to_disk` flag is not persisted by Claude in Chrome in this seat, so screenshots are described from inline frames rather than file-attached. |
| Public /perform landing (logged-out branch, named target) | **PASS (source-verified) / N-A (live)** | Cannot live-test from seat bound to Daniel's auth (signing out is destructive — §7.2). Source verified at `origin/master:src/components/performance/PublicSetlistListing.tsx`: `QRSignIn` imported; `<section aria-label="Sign in to CRC Music">` rendered inside `{!user && !authLoading && ...}` (the CLS guard); Google button `h-11 rounded-xl` = 44px HIG ✓. Live grading deferred to harness's `onboarding-qr-ipad` spec or a Chrome incognito pass. |
| Perform mode (chart viewer toolbar) | **FRICTION (HIGH)** | Bottom-toolbar mid-service controls are 40px tall (HIG floor 44px): Zoom out 40×40, Zoom in 40×40, Monitor mix 107×40, TRANSPOSE 119×40. **C10I1-001.** |
| Perform mode (wake-lock discoverability) | **FRICTION (MED)** | KeepAwakeToggle (header-level, y≈89) is z-stacked behind the chart overlay once a chart opens. Deep-linked chart entry (QR scan / push / direct URL) lands the user in a view where wake-lock cannot be toggled — exit→toggle→reopen workaround required. **C10I1-003.** |
| Chart bind picker | **N-A** | Not exercised — would require editing a public setlist; out of scope per §7.2. |
| MusicXML render + transpose | **N-A** | None of the charts tapped during the live pass routed through SmartScoreViewer's `musicxml` path (Modah Ani rendered as chordpro/text). Strategic-format render grading remains the harness's job. |
| Gig-packet print | **PASS (affordance)** | "Gig Packet" button visible in the SetlistPerformClient header at 99×44 (HIG met). Live print not exercised — would generate a server PDF and is unnecessary for the usability verdict. |
| Offline behavior | **INFO (HIGH-adjacent)** | Saturday's "B'nei Mitzvah of Gavin Stein — May 30" setlist header shows "**Save 15/16**" — one chart out of 16 is NOT cached for offline use. If the band's iPad loses wifi during that one song, the chart will fail to load mid-service. **C10I1-005.** Worth surfacing to Daniel before Saturday even though it's an operational-state finding, not a code defect. |
| Sign-in (QR + Google) | **PASS (source) / N-A (live)** | See landing/logged-out row above. |
| a11y (axe) | **N-A** | Harness Cat-J; not from Cowork. |
| Cat-G touch-target ergonomics (extra audit) | **FRICTION (HIGH + LOW)** | Top-nav row (CRC Music / Setlists / Schedule / Library / Monitor) at h=32 — LOW (not load-bearing mid-service). Mid-service toolbar — see C10I1-001 (HIGH). |
| Cat-N monitor UI-shape | **N-A** | Auth-gated to band members with monitor access; the in-toolbar "Monitor" popover trigger is at 40px tall (folded into C10I1-001). |
| perform-public-auth-and-cap [LANDED 6e043a4ce5] | **LANDED+verified (authed branch live; logged-out branch source-only)** | Cap=5 enforced; upcoming-first; no Sign-In card for authed user. Verified ✓. Source confirmation of `!authLoading` CLS guard, `MAX_PUBLIC_SERVICES = 5`, `splitPublicSetlists` + `slice(0,5)` + past-fills-remainder, page.tsx still avoids `cookies()`/`headers()` (edge cache intact). The "flash-yank" CLS check is live only on a real cold logged-out load — deferred to harness. |

## Summary

- Harness: **NOT RUN** from this seat (Part 1 deferred to a shell session). Source verification + live qualitative pass executed only.
- Findings: **5** (BLOCKER: 0 / HIGH: 2 / MED: 1 / LOW: 1 / INFO: 1) — plus 2 PARENT-doc path drifts noted as INFO (C10I1-006, C10I1-007).
- Screenshots captured: 3 inline (landing /perform authed; Shavuot Yizkor detail view; Modah Ani chart in Perform mode). **NOT saved to disk — `save_to_disk` returns "no effect" in this seat**, so each finding's "Actual" section describes the screenshot content verbatim from the inline frame rather than referencing a `.png` path. Daniel can re-capture via the harness or by running the same navigation in a session that persists screenshots.

## Findings

### C10I1-001 — Perform-mode toolbar controls are 40px tall (HIG floor is 44px)

- **Surface:** `/perform/setlist/<id>` chart-viewer bottom toolbar — rendered by `PerformanceToolbar.tsx`'s `zoomControls(compact)` block (`compact ? "h-12" : "h-11"` outer container, but the actual Button children are `compact ? "h-11 w-11" : "h-10 w-10"`) and the Monitor / Transpose popover triggers.
- **Severity:** **HIGH** (per §6: "tap-target miss/mis-tap" → HIGH).
- **Viewport:** measured at 1920×945 window, content rendered at full width; the absolute size in CSS is `h-10` = 40px regardless of viewport — the issue persists at 820×1180.
- **Repro:**
  1. Sign in as a band member with monitor access (or use Daniel's auth).
  2. Navigate `/perform/setlist/UnjLqKTtS4lNKQfMY6hB` (Shavuot Yizkor).
  3. Tap into "Modah Ani" → Perform mode opens with the chart viewer + bottom toolbar.
  4. Measure the toolbar buttons via JS: `Array.from(document.querySelectorAll('button')).filter(b => /Zoom|TRANSPOSE|Monitor/i.test(b.textContent + (b.getAttribute('aria-label')||''))).map(b => ({t: b.textContent.trim(), r: b.getBoundingClientRect()}))`.
- **Expected (usable):** All mid-service tap targets ≥44×44 (Apple HIG floor) so a thumb mis-tap on the wrong control during a song doesn't happen. Especially Transpose — a mis-tap that opens the transposer dropdown mid-song is a notable confusion vector even if no key change actually occurs.
- **Actual:** Live measurements at y=892:
    - "Zoom out" button: **40×40**
    - "Zoom in" button: **40×40**
    - "Monitor mix" popover trigger: **107×40** (width fine, height below floor)
    - "TRANSPOSE" popover trigger: **119×40** (width fine, height below floor)
  Visually the toolbar reads as a compact pill row; thumb-misses on the Zoom/Transpose pair are particularly likely because the Zoom group is small + tight.
- **Hypothesis:** `PerformanceToolbar.tsx`'s `zoomControls(compact)` declares the outer container at `h-12` (compact=true) or `h-11` (compact=false), but the icon-Button children are hard-coded `h-11 w-11` / `h-10 w-10`. The `h-10 w-10` branch is what's rendering. The fix is to bump `h-10 w-10` → `h-11 w-11` and audit the Monitor/Transpose triggers similarly.
- **Ship-class:** **HOLD-POST-SERVICE** — touches Perform render. Easy CSS fix but I'd want one harness run after the change to confirm no layout regression at iPad portrait.

### C10I1-002 — Public landing songCount is stale for high-priority services (Saturday's B'nei Mitzvah shows "0 songs")

- **Surface:** `/perform` landing card render in `PublicSetlistListing.tsx`: `const songCount = setlist.songCount ?? 0`.
- **Severity:** **HIGH** (per §6: "confusing affordance / unclear state that slows or stops" — visitor reads Saturday's flagship service as empty).
- **Viewport:** any (data issue, viewport-agnostic).
- **Repro:**
  1. Open `https://www.centralreform.live/perform`.
  2. Observe Saturday's "B'nei Mitzvah of Gavin Stein — May 30" card: **`0 songs`**.
  3. Tap into the same setlist (`/perform/setlist/cd2010f4-8bb0-4f54-ba2d-8a79d83729a6`).
  4. Detail-view header reads **`16 songs · 20 items`**.
  5. Same pattern on Shavuot Yizkor ("0 songs" on landing → "17 songs · 28 items" in detail).
  6. The Kabbalat Shabbat row correctly reads "6 songs" on landing — so this is a backfill gap, not a render bug.
- **Expected (usable):** Landing-card `songCount` reflects the actual queue/track count, especially for the upcoming service the band will reference Saturday.
- **Actual:** Two of the five landing rows display "0 songs" despite having 16 and 17 songs respectively. A visitor or fresh band member tapping `/perform` thinks Saturday's service has no setlist content.
- **Hypothesis:** The `setlist.songCount` Firestore field is set at write-time but never updated when tracks are added afterward. The MCP toolset already exposes `recompute_setlist_track_count` — running it across the public listing (or on every track add) closes the gap. Could also be a `useMemo`-able derived count from `setlist.tracks.length` if the tracks array is hydrated on the listing query, but the public listing currently doesn't load tracks (perf), so a one-shot backfill + a track-add hook is the cleaner fix.
- **Ship-class:** **SAFE-NOW-DATA** (backfill via `recompute_setlist_track_count` for the 5 public-listing rows is non-destructive; harmless if rerun). The code-side hook to keep songCount in-sync is HOLD-POST-SERVICE.

### C10I1-003 — Wake-lock unreachable from inside a chart overlay

- **Surface:** `KeepAwakeToggle.tsx` is mounted only in `SetlistPerformClient` (and `PublicSetlistListing`) headers; `PDFOverlay.tsx` (the chart overlay) uses the `PerformanceToolbar` which has no wake-lock control.
- **Severity:** **MED** (per §6: "confusing affordance / discoverability gap"; the 2026-05-23 Yizkor service regression class — Daniel knows this surface well).
- **Viewport:** any.
- **Repro:**
  1. Cold-load `/perform/setlist/UnjLqKTtS4lNKQfMY6hB` (don't tap Keep on at the setlist header).
  2. Tap directly into a song → chart opens.
  3. Search the chart-mode UI for any wake-lock affordance: **none in the bottom toolbar**, the SetlistPerformClient header (with the Keep on toggle at y≈89) is z-stacked behind the overlay and not tappable.
- **Expected (usable):** Either (a) the wake-lock is auto-acquired on first chart open (the chart-tap counts as user-activation), or (b) the in-chart toolbar exposes a wake-lock control so a deep-linked entry (QR scan, push notification, link share) can still arm the lock mid-service.
- **Actual:** Deep-linked chart entry has no wake-lock UI; band member must exit chart → tap Keep on → re-tap song. This is a small interruption — but exactly the surface that bit Daniel during Yizkor (`use-wake-lock.ts` docstring).
- **Hypothesis:** Add the KeepAwakeToggle (compact mode) to PerformanceToolbar's right group, or auto-acquire on first chart-open user-activation. The current design intentionally header-only; revisiting that choice deserves a discussion.
- **Ship-class:** **HOLD-POST-SERVICE** — touches Perform render.

### C10I1-004 — Top-nav anchors at 32px tall

- **Surface:** authed app top nav (CRC Music brand link + Setlists / Schedule / Library / Monitor section links).
- **Severity:** **LOW** (not load-bearing mid-service; pre-service navigation only).
- **Repro:** measure any anchor in the top nav with `getBoundingClientRect()` → h=32.
- **Expected (usable):** ≥44px for thumb-friendly iPad use, even outside Perform mode.
- **Actual:** All five nav anchors are 32px tall (text-row height).
- **Hypothesis:** `<nav>` row uses Tailwind text-row line-height; raising to `py-3` or wrapping in `h-11` would meet HIG.
- **Ship-class:** **SAFE-NOW** if Daniel wants it — purely CSS/spacing; near-zero risk. Otherwise HOLD-POST-SERVICE bundled with C10I1-001's toolbar fix.

### C10I1-005 — "Save 15/16" — one chart on Saturday's setlist not cached for offline

- **Surface:** SetlistPerformClient header offline-cache indicator (`Save 15/16` button at the same `flex` row as Keep on / Gig Packet / Edit) on `/perform/setlist/cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` (B'nei Mitzvah of Gavin Stein — May 30).
- **Severity:** **INFO (HIGH-adjacent)** — not a code finding, but a service-readiness finding Daniel should know about before Saturday.
- **Viewport:** any.
- **Repro:** open Saturday's setlist as Daniel; observe header reads "Save 15/16" (not "All charts saved").
- **Expected (usable):** All 16 charts pre-cached so a wifi drop mid-service doesn't surface the offline-gap class of bug.
- **Actual:** 15 of 16 are saved; one is not. The harness's offline-decisive spec (`r1-offline-decisive`, Cat-H) would name the specific chart.
- **Hypothesis:** Either the band hasn't tapped the saved-cache action since a recent chart-add, or one of the bonded files is missing/un-extractable. Tap the "Save 15/16" button on the live iPad before Saturday to advance the cache.
- **Ship-class:** **SAFE-NOW (operational)** — Daniel/band action only, no code change.

### C10I1-006 — PARENT path drifts (INFO)

- **Surface:** `cycle-10-cowork-PARENT.md` and `cycle-10-cowork-instance-1-PROMPT.md`.
- **Severity:** **INFO** — documentation hygiene.
- **Detail:** Two file-path references in the PARENT don't match the actual master tree:
    - `resolveViewerKind.ts` referenced as `src/lib/music/resolveViewerKind.ts` → actually at `src/components/performance/resolveViewerKind.ts`.
    - `public-setlist-order.ts` referenced as `src/lib/perform/public-setlist-order.ts` → actually at `src/components/performance/public-setlist-order.ts`.
  Both files exist; only the docstring paths are wrong. The PROMPT's `[verify-before-write checklist]` would have caught this if it had run `git ls-tree | grep` rather than implicit path assumptions.
- **Ship-class:** **SAFE-NOW** — doc-only fix.

### C10I1-007 — Cowork seat limitations (INFO — for the supervisor)

- **Surface:** this cycle's choice of vehicle.
- **Severity:** **INFO** — process feedback.
- **Detail:**
    1. `resize_window(820, 1180)` returns success but Chrome on Windows clamps the actual window to 1920×945 (OS min-content-width). The strict iPad-portrait layout grading requires the harness's Playwright ipad-webkit projects — not a cowork-Claude seat.
    2. `save_to_disk:true` on the screenshot tool returns "no effect" — screenshots are inline-only this seat. Findings reference them descriptively rather than by file path. Daniel can re-capture via the harness's `--screenshot-on-failure` mode for any finding he wants pixel-evidence on.
    3. Cowork seat is bound to whichever Chrome profile is connected — if that profile is signed in to Firebase, the logged-out branch of any cap-and-card surface cannot be live-tested without `auth.signOut()` (destructive — §7.2). Future cowork PROMPTs that include a logged-out-branch verification target should specify a Chrome incognito profile as the connection target.
    4. `npm run stress` is not invocable from this seat — Part 1 deterministic load is a shell-mounted job. The PROMPT should anticipate this and split the deterministic + judgment layers more cleanly: judgement-only cowork session → shell-only harness session, with the supervisor stitching the two REPORTs.
- **Ship-class:** **SAFE-NOW (doc)** — fold into the next cycle's PROMPT/PARENT template.

## Repros / screenshots

Screenshots inline-only (not file-persisted in this seat — see C10I1-007#2). Each finding's "Actual" section describes the inline frame verbatim. If Daniel wants pixel evidence:
- The harness's `screenshot-on-failure` mode for any specific category — and for C10I1-001/003 specifically the existing `ipad-stuck-spinner-probe` and `perform-ipad-deep` specs will capture the same toolbar with screenshots.
- For C10I1-002 (songCount), a one-shot `mcp__38e08ce6...__get_setlist` call against each public-listing setlist would dump `{songCount, tracks.length}` for direct comparison.

## Manual cleanup needed

None — read-only run, no fixtures created, no `c10i1-*` accounts, no charts/setlists touched.

---

## HANDOFF-COMPLETE message body — for `.coord/inbox/supervisor.md`

```
from cycle-10-cowork-instance-1
HANDOFF-COMPLETE
verdict: N-FRICTION (0 BLOCKER / 2 HIGH / 1 MED / 1 LOW / 1 INFO + 2 process-INFO)
load-bearing findings:
  C10I1-001 HIGH HOLD-POST-SERVICE — Perform-mode toolbar h-10 (40px) misses HIG 44 (Zoom/Monitor/Transpose)
  C10I1-002 HIGH SAFE-NOW-DATA      — landing songCount stale ("0 songs" on Saturday's B'nei Mitzvah); recompute_setlist_track_count fixes the 5 public-listing rows
  C10I1-003 MED  HOLD-POST-SERVICE  — wake-lock unreachable from inside chart overlay (deep-link entry can't arm Keep-on)
  C10I1-004 LOW                      — top-nav anchors 32px tall
  C10I1-005 INFO operational         — Saturday's setlist shows "Save 15/16"; one chart not cached for offline
fixes-wave bar (PARENT §9): 2 HIGH usability findings hits the "≥3 HIGH" threshold short by one — supervisor decides whether to open the wave or batch with future findings.
Part 1 deterministic load DEFERRED — Cowork seat cannot run `npm run stress`; please dispatch the iPad stress matrix in a shell-mounted session at convenience.
cleanup: read-only, no fixtures.
```
