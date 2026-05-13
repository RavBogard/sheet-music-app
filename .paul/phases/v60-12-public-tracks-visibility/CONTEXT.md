# Phase Context

**Phase:** v60-12 — Public Tracks Visibility
**Generated:** 2026-05-13
**Status:** Ready for planning
**Origin:** Daniel UAT 2026-05-13 (during v7.0 milestone discussion): *"when I have a setlist and I go to centralreform.live in an incognito browser, it shows the upcoming setlist, and i can click 'perform' (good!), but then when I do that, it says 'no tracks yet'"*

## Goals

- **Goal 1 — Public users can see tracks on the public perform view.** Today, /perform/setlist/[id] loads fine for unauthenticated users (setlists are publicly readable) but shows "No tracks yet" because the tracks data is blocked. Daniel and visitors should see the actual setlist contents.
- **Goal 2 — Close the public-perform-view contract gap.** Three layers currently encode inconsistent specs: Firestore rules (tracks require `isMember()`), the perf-view hook (skips snapshot listener for unauthenticated users, comment says page "renders an error" — page actually renders "No tracks yet"), and the page itself (shows empty state instead of an error). This phase aligns all three on "public read works."
- **Goal 3 — Preserve v6.0 close discipline.** Same single-plan emergent-phase shape as v60-11 (UAT Issue 1 fix). Pre-APPLY audit + emulator coverage on the rules change before deploying production rules.

## Approach

**Locked decisions (from 2026-05-13 diagnosis):**

- **Firestore rules change** = `match /tracks/{trackId} { allow read: if true; ... }`. Writes remain member/leader/admin-gated (no change). This is Option A (simple public-read) per the diagnosis, chosen over Option B (parent-doc check on setlist visibility flag) because:
  - The setlist itself is publicly readable today (`allow read: if true` at firestore.rules:86)
  - Tracks data (title, key, bpm, lead, type) is the natural extension of what's already public on the setlist
  - No new `public: true` flag needs to be added/backfilled on existing setlist docs
  - One fewer Firestore read per track-read (Option B would `get()` the parent setlist on every track read)
- **Songs/{id} rule stays member-only.** Public perform view does NOT subscribe to songs/* (snapshot-listener only covers `setlists/{id}` + `tracks where setlistId == X` per src/lib/sync/snapshot-listener.ts). subscribeSongsLibrary lives in SetlistGridHydrator (editor side) which public users don't hit. No change needed.
- **Hook change** = remove `if (!user) return` guard at use-setlist-performance.ts:93-94. Snapshot listener mounts for public users too. Update the stale comment (currently says page "renders an error for public users" which is false).
- **Rules testing infrastructure** = add `@firebase/rules-unit-testing` dev dependency + new test file `src/__tests__/firestore-rules.tracks.emulator.test.ts` proving:
  - Unauthenticated read on `tracks/{id}` succeeds
  - Unauthenticated write on `tracks/{id}` is rejected
  - Authenticated band-leader write succeeds
  - Tracks-from-existing-setlist behave consistently (no setlistId-coupling regression)
- **Deploy** = `firebase deploy --only firestore:rules --project crcmusiccharts` after merge (automatable per feedback_firebase_cli memory; NOT a human-action checkpoint).

## Constraints

- **High blast radius** — Firestore rules are production-critical. A bad deploy can lock out the entire band. Emulator coverage is mandatory; rules deploy happens AFTER vitest GREEN.
- **HFG counter** must stay at 0/3. Rules testing IS engine-adjacent emulator coverage; ships within the phase.
- **No songs/* rule change.** Out of scope; not needed for the bug fix.
- **No setlist visibility model.** Don't add a `public: true` flag to setlists in this phase (would require backfill + dashboard logic update; defer to v7.x if ever needed).
- **No engine touches.** Writes via existing `applyEdit` fanout (v6.0 spine).
- **Backwards-compatible.** Existing signed-in users continue working unchanged; only the public-read path is opened.
- **Friday/Shabbat cadence** — today is Wed 2026-05-13. Deploy window open through Thu AM.
- **/ui-ux-pro-max gate** = N/A (data-layer + auth-rules; no UI surface changes; page already renders the empty/full states correctly).
- **v6.0 close-gate impact** — v60-12 added to v6.0 as Wave 6 (after v60-11 Wave 5). Increases milestone close gate count to 12 phases. Acceptable per "do it right" directive.

## Open Questions

- **Q1 — Should songs/{id} also become publicly readable for consistency?** Diagnosis says NO (public perform view doesn't subscribe to songs/*; PDFOverlay serves charts via Firebase Storage URL which is auth-flexible). Confirmed at /paul:plan time by reading the perform view's exact data dependencies.
- **Q2 — Auth-context refresh after deploy?** v5h-01 had auth-claim staleness issues post-rules-deploy. This deploy only RELAXES a read constraint (no auth-claim impact), so no client refresh needed. Verify in pre-APPLY audit.
- **Q3 — PDFOverlay path for public users.** When a public user clicks a song in the setlist, does the PDF render? The chart Storage URL helper might require auth. Quick smoke at /paul:apply verification time before declaring AC-4 PASS.
- **Q4 — `@firebase/rules-unit-testing` version pin.** Latest stable as of 2026-05; check compat with existing firebase v12.9.0 / firebase-tools v15.7.0.

## Additional Context

- **Bug surface:** `centralreform.live` homepage shows upcoming setlist (works); clicking "Perform" lands on `/perform/setlist/[id]` (works — setlist doc is public); page calls `useSetlistPerformance` which reads from Dexie; Dexie is empty for unauthenticated users (the hook skips populating it); v60-08 removed the embedded-tracks fallback → result is `tracks: []` → page renders "No tracks yet" empty state.
- **Stale comment confession:** `use-setlist-performance.ts:90-92` says *"The page itself renders an error for public users."* This is false — there's no such error rendering. Someone changed the page to render the empty state without updating the hook, or the page was always going to render the empty state and the comment was wishful thinking. Either way, the comment is the smoking gun — it documents an old contract that no longer holds.
- **Reuse:** v60-11 single-plan emergent-phase template (PLAN + audit + APPLY + UNIFY + commit + push + deploy). Same shape, same disciplines, same close-gate framing.
- **Production verification post-deploy:** Daniel opens centralreform.live in fresh incognito → upcoming setlist visible on homepage → clicks "Perform" → setlist renders with tracks → clicking a song shows the PDF (AC-4 carry-forward unless smoke verifies in-session).
- **Pre-APPLY audit checklist to run before APPLY:** (1) Verify songs/{id} truly isn't needed for public perform view; (2) check PDFOverlay's chart-fetch path for auth requirements; (3) confirm the rules change doesn't conflict with the v60-09 archive flow (archived songs stay archived; no rule change there); (4) verify `@firebase/rules-unit-testing` works with the v15 emulator setup from v60-03; (5) check whether subscribing snapshot-listener for public users races with the setlist's own listener.

---

*This file is temporary. It informs planning but is not required.*
*Created by /paul:discuss, consumed by /paul:plan.*
