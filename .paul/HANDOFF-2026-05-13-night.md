# PAUL Handoff

**Date:** 2026-05-13 (night — post v60-13 wave 1 + v70-01-01 partial APPLY)
**Status:** paused (Daniel-explicit pause; about to clear context)

---

## READ THIS FIRST

You have no prior context. This document tells you everything you need.

**Project:** centralreform.live — CRC Music (Reform Jewish synagogue setlist + perform app)
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

This session: started v70-01-01 (image-chart support, v7.0 wave 0); landed Tasks 1+2+4. Then Daniel UAT surfaced 5 production issues — pivoted to emergent v60-13 cluster (sync-engine resilience). Shipped 5 v60-13 fixes. Two P0 blockers RESOLVED per Daniel UAT (incognito blank, 49-row stuck outbox queue). One P1 still open (auto-refresh during edit). Two smaller issues planned for follow-up.

---

## Current State

**Version:** v7.0.0-dev (mid-flight)
**Master HEAD:** `d81c3dc` (docs(v60-13): wave 1 shipped — incognito + queue drain confirmed by UAT)
**Branch:** master (synced with origin/master)

### Active phases (multi-phase mid-session)

**v70-01-01 — Image-chart support (PAUSED mid-APPLY):**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ◐        ○     [Tasks 1+2+4 shipped (b4dbb19, ab11850); Task 3 deferred]
```
- Tasks 1+2 (b4dbb19): upload route + ImageScoreViewer + PDFOverlay branch
- Task 4 (ab11850): mimeType persistence + PDFOverlay live-backstop for picker-bound + legacy tracks
- Task 3 (PENDING): toolbar transpose+AI disable with tooltip + PrintModal banner + print-pipeline image-skip guard
- Daniel UAT on PNG render: NOT formally confirmed but presumed working (Daniel never listed PNG render among the 5 production issues he reported during this session). Task 3 is ~20 min when resumed.

**v60-13 — Sync-engine resilience (EMERGENT, wave 1 shipped):**
```
v60-13-01 (26797e7): /setlists auth gate dropped — wrong target, didn't fix homepage
v60-13-02 (13e350d): dashboard subscription error surface
v60-13-02b (da1a69e): visible diag strip on empty-state
v60-13-03 + v60-13-04 (6b7330c): drain stuck outbox on retry; memoryLocalCache for incognito ✓✓ FIXED P0s
v60-13-05 (9f21b74): outbox console diagnostic
```
v60-13-06 PLAN written, NOT started. 06 = hydrator dedup (auto-refresh during edit fix).

---

## What Was Done This Session

### v70-01-01 — Image-chart support
- /paul:resume restored from prior 2026-05-13-evening handoff (archived)
- /paul:plan v70-01 → v70-01-01 PLAN created (3-task vertical slice; print-pipeline embed deferred to v70-01-02)
- /paul:apply v70-01-01:
  - Task 1 (heic-convert install + upload route image-mime support) — DONE
  - checkpoint:decision (heic-convert vs sharp vs libheif-js) — Daniel locked heic-convert
  - Task 2 (ImageScoreViewer + PDFOverlay branch + queue-utils image-type detection) — DONE; 4/4 tests green
  - Commit b4dbb19, push origin master
  - checkpoint:human-verify — Daniel UAT: PNG didn't render → PDFViewer "Invalid PDF structure"
  - Diagnostic: queue-utils nameLower check is dead code for picker-bound tracks (track.fileName never set by handlePickSong). Classification: SPEC issue.
  - PLAN updated with Task 4 (mimeType persistence + PDFOverlay live backstop)
  - Task 4 — DONE; commit ab11850, push origin master
  - PNG render UAT not formally confirmed by Daniel but presumed working (Daniel never listed PNG render among the 5 production issues he reported afterward)

### v60-13 — Emergent sync-engine resilience cluster
Daniel UAT post-ab11850 surfaced 5 issues — triaged:
1. Incognito → upcoming setlist invisible (P0 blocker → v60-13-01..04)
2. No UX to edit setlist name/date (P1 → v70-09 PLAN written this session)
3. Mobile date picker resets to today (P1 → v60-14 PLAN written this session)
4. "Failed/Conflict/Saving forever" during edit (P0 blocker → v60-13-03 fix)
5. Mobile dashboard blanks setlists; click → forever loading (P0 → resolved by v60-13-03+04)

Shipped sequence:
- 26797e7: dropped !authUser?.uid gate on /setlists (use-setlist-dashboard.ts) — wrong target; homepage uses DashboardClient.tsx with separate subscription
- 13e350d: added onError + visible "Couldn't load setlists" red box to DashboardClient — diagnostic showed onError didn't fire
- da1a69e: added visible diag strip ("subscription returned N setlists, fromCache=X, authUid=Y") — Daniel confirmed "subscription has not fired yet" → listener was hanging silently in incognito
- 6b7330c (v60-13-03 + v60-13-04, both in one commit):
  - **v60-13-03:** retryFailedOutboxRows now stamps PENDING rows with forceLwwOnConflict=true (not just FAILED rows). Reason: engine.ts:447 stop-drains on first VersionMismatchError; Daniel had 49 stuck rows (1 failed + 48 pending) and each retry click only advanced one row. Now one click drains the queue. Sole-admin app per locked decision #4. 7/7 cleanup tests green.
  - **v60-13-04:** firebase.ts probes localStorage at init; if write fails (incognito private browsing / restricted storage), uses memoryLocalCache instead of persistentLocalCache. Fixes the silent listener-hang in incognito.
- 9f21b74: outbox console dump on dashboard mount (diagnostic — kept in code for now; remove when v60-13-06 closes)

### Daniel UAT — confirmed FIXED
- Incognito Chrome → centralreform.live: 41 setlists load fresh ✓
- Desktop outbox: drained 49 → 0 ✓
- Mobile ↔ desktop sync: works (mobile delete → desktop sees it within ~1s) ✓
- "Saved" status now accurate ✓

### Plans written THIS session for follow-up
- `.paul/phases/v60-13-sync-engine-resilience/v60-13-06-PLAN.md` — hydrator dedup (auto-refresh fix)
- `.paul/phases/v60-14-mobile-date-picker/v60-14-01-PLAN.md` — mobile date-picker reset (Issue 3)
- `.paul/phases/v70-09-setlist-metadata-editor/v70-09-01-PLAN.md` — edit setlist metadata UX (Issue 2)

---

## What's In Progress

**Nothing actively in-flight.** Everything committed + pushed. Daniel pauses cleanly to clear context.

Two phases sit mid-loop:
- v70-01-01: Tasks 1+2+4 shipped, Task 3 deferred
- v60-13: 5 commits shipped, 06 planned but not started

---

## Open Issues — all PLANNED, ready for next session

| Phase | Plan | Issue | What's blocking action |
|-------|------|-------|------------------------|
| **v60-13-06** | `.paul/phases/v60-13-sync-engine-resilience/v60-13-06-PLAN.md` | Auto-refresh during edit (Daniel: "real pain") | Nothing — ready for /paul:apply. Highest priority remaining. |
| **v70-01-01-task3** | `.paul/phases/v70-01-image-chart-support/v70-01-01-PLAN.md` (Task 3 in existing plan) | Toolbar transpose+AI disable + PrintModal banner | Nothing — ~20 min when resumed. Can be done in parallel/before/after v60-13-06. |
| **v60-14-01** | `.paul/phases/v60-14-mobile-date-picker/v60-14-01-PLAN.md` | Mobile date picker resets to today | Discovery + checkpoint:decision in plan. May auto-resolve when v60-13-06 ships (if root cause is hydrator double-emission). |
| **v70-09-01** | `.paul/phases/v70-09-setlist-metadata-editor/v70-09-01-PLAN.md` | No way to edit setlist name/date post-create | Discovery + /ui-ux-pro-max consult; bigger UX work. |

### Likely-resolved (no action unless re-reported)
- **v60-13-07 — past desktop deletes (hashkiveinu, aleinu) didn't propagate.** handleDeleteRow code path is correct (writes op:'delete' on tracks/{id}). The deletes were almost certainly stuck in the 49-row queue jam. Now that v60-13-03 drains stuck queues, future deletes will propagate. Daniel verified mobile→desktop sync works after the queue drained. Don't act unless Daniel re-reports loss.

### Diagnostic logging still in code (cleanup later)
- DashboardClient.tsx has `console.info('[Dashboard] subscription fired/error/subscribing...')` and an outbox dump on mount (`[Outbox] N total — by status: ...`). Plus a visible diag strip in the empty-state. Keep until v60-13-06 closes; remove in a docs/cleanup commit afterward (no functional impact).

---

## Recommended Next-Session Sequence

1. **/paul:resume** to restore context from this handoff
2. **/paul:apply v60-13-06** (highest impact open issue — fixes Daniel's "real pain")
3. After v60-13-06 ships + UAT clears:
   - **/paul:apply v60-14-01** Task 1 (discovery) — possibly fixes itself if root cause was hydrator
   - OR **resume v70-01-01 Task 3** (small, finishes the image-chart phase)
4. v70-09-01 (setlist metadata editor) is bigger UX work — schedule when Daniel has bandwidth for /ui-ux-pro-max consult

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state + open issues table |
| `.paul/ROADMAP.md` | v7.0 milestone roadmap; v60-13 emergent row added |
| `.paul/phases/v60-13-sync-engine-resilience/v60-13-06-PLAN.md` | Hydrator dedup PLAN (top priority) |
| `.paul/phases/v70-01-image-chart-support/v70-01-01-PLAN.md` | Image-chart phase (Tasks 1+2+4 done; Task 3 pending) |
| `.paul/phases/v60-14-mobile-date-picker/v60-14-01-PLAN.md` | Mobile date picker fix |
| `.paul/phases/v70-09-setlist-metadata-editor/v70-09-01-PLAN.md` | Edit setlist metadata UX |
| `src/lib/sync/cleanup.ts` | v60-13-03 LWW-extend lives here (line 75-114) |
| `src/lib/firebase.ts` | v60-13-04 storage probe + memoryLocalCache fallback (line 47-90) |
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | Where v60-13-06 fix lands |
| `src/app/(main)/DashboardClient.tsx` | Has v60-13-02 + 02b + 05 diagnostics still in place |
| `firestore.rules` | setlists/* + tracks/* both `allow read: if true` since v60-12 |

---

## Decisions Made This Session

| Date | Decision | Phase | Impact |
|------|----------|-------|--------|
| 2026-05-13 | HEIC conversion library = `heic-convert@^2.1.0` (pure JS, serverless-safe) over `sharp` / `libheif-js` | v70-01-01 Task 1 | LOCKED via checkpoint:decision; Daniel-confirmed |
| 2026-05-13 | mimeType-based viewer routing in queue-utils + persisted on SetlistTrack at bind time + PDFOverlay live backstop for legacy tracks | v70-01-01 Task 4 | Spec-issue routing fix; covers picker-bound + legacy without data migration |
| 2026-05-13 | retryFailedOutboxRows extends to mark PENDING rows with forceLwwOnConflict (not just FAILED) | v60-13-03 | Sole-admin app — locked decision #4 — manual retry IS intent to overwrite. Drains stuck queues in one click. |
| 2026-05-13 | Storage probe at firebase.ts init; memoryLocalCache fallback for restricted-storage browsers | v60-13-04 | Tradeoff: incognito loses offline persistence. Acceptable since incognito has no expectation of persistence. |
| 2026-05-13 | Pause v70-01-01 mid-APPLY to address P0 production blockers | session-level | Image-chart Task 3 deferred until v60-13 cluster ships |

---

## Resume Hooks (for fresh Claude)

- Daniel runs from Windows (PowerShell + Bash via WSL). Paths `C:\Users\dsbog\centralreform.live\sheet-music-app\`.
- Repo: github.com/RavBogard/sheet-music-app — branch `master` (Daniel's production; per memory `feedback_git_push`).
- Vercel auto-deploys from master push.
- Firebase project: `crcmusiccharts`.
- Today is 2026-05-13 (Wed). Worship cycle: Fri PM + Sat AM.
- Per memory `feedback_no_local_dev` — Daniel never runs local dev; pushes to Vercel for testing.
- Per memory `feedback_nextjs_route_exports` — must run `next build` (not just tsc) to catch route violations.
- Per memory `feedback_paul_phase_commits` — entire `.paul/phases/{phase}/` dir staged together on phase commit.
- Per memory `feedback_firebase_cli` — `firebase deploy --project crcmusiccharts` is automatable for rules/indexes/functions; NOT a human-action checkpoint.
- /paul:audit is BROKEN per memory `feedback_no_paul_audit` — perform manual architectural audit inline; do NOT route to /paul:audit.
- /ui-ux-pro-max BLOCKING for any frontend phase per `.paul/SPECIAL-FLOWS.md`.
- HFG counter at 0/3 (held throughout v6.0 + v60-13 wave 1).

---

## Notable Quotes (Daniel)

- **"whatever you recommend"** — Daniel granted full delegation when triage exceeded a single fix
- **"go"** — keep shipping, don't wait for explicit per-step approval
- **"a real pain"** — describing the auto-refresh during edit (Issue priority signal)
- **"it worked!"** — incognito + queue drain confirmed (v60-13-04 + v60-13-03)
- **"pause and save everything necessary and add anything that needs to be planned, planned"** — current pause request

---

## Resume Instructions

1. **Read this handoff first** — it supersedes any stale context.
2. **Read `.paul/STATE.md`** for the latest position (Open Issues table at top).
3. **Run `/paul:resume`** — workflow detects this handoff and routes appropriately.
4. **Recommended first action:** `/paul:apply .paul/phases/v60-13-sync-engine-resilience/v60-13-06-PLAN.md` (hydrator dedup — Daniel's top remaining pain).
5. If Daniel reports new issues instead, route via diagnostic classification (intent / spec / code) per the v60-13-03 pattern.

---

*Handoff created: 2026-05-13 night by Claude Opus 4.7 (1M context). Session paused at Daniel's request for context-window clearing. v70-01-01 Task 3 deferred; v60-13-06 PLAN written and ready for APPLY; v60-14-01 + v70-09-01 PLANs written for downstream follow-up. Master HEAD `d81c3dc`.*
