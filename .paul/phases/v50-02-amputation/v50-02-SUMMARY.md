---
phase: v50-02-amputation
plan: 01
subsystem: cleanup
tags: [deletion, amputation, dead-code, chat, live-swap, song-groups, can-live-swap]

requires:
  - phase: v50-01-architecture
    provides: ARCHITECTURE.md §7 amputation scope (deletion inventory + ordering)

provides:
  - Removal of AI chat assistant (UI + store + sanitization + API routes + tests)
  - Removal of live-swap UI surface (SwapPicker, SwapChangeToast, /live receiver, proxy carve-out)
  - Removal of swapTrack() function + liturgicalSlot type field
  - Smaller, more navigable codebase (~2,363 LOC net deletion)
  - Read-only SetlistRow / SetlistView in performance view (was: tap-to-swap)

affects:
  - v50-03 (sync engine) — operates on a smaller src/ surface; setlist-firebase.ts no longer carries swapTrack
  - v50-05 (editor cutover) — fewer modal/editor entry points to refactor (no chat-trigger button)
  - v50-07 (migration & cutover) — backlog: scrub `config/songGroups` doc, `canLiveSwap` user claims, `liturgicalSlot` on library_index docs

tech-stack:
  added: []
  patterns:
    - "Amputation pattern: inventory-via-grep → delete-files → remove-imports → verify-via-grep+tests+build → atomic commit"
    - "Three-task structure (UI / surface / data-permission-rules) for surgical removal of a feature spanning multiple layers"

key-files:
  created:
    - .paul/phases/v50-02-amputation/v50-02-PLAN.md
    - .paul/phases/v50-02-amputation/v50-02-SUMMARY.md
  modified:
    - "(deleted) src/components/setlist/ChatPanel.tsx"
    - "(deleted) src/lib/chat-store.ts"
    - "(deleted) src/lib/chat-prompt.ts"
    - "(deleted) src/app/api/chat/route.ts"
    - "(deleted) src/components/performance/SwapPicker.tsx"
    - "(deleted) src/components/performance/SwapChangeToast.tsx"
    - "(deleted) src/app/live/ (entire dir — already gone, removed proxy carve-out)"
    - "src/types/models.ts (removed liturgicalSlot from DriveFile.metadata)"
    - "src/lib/setlist-firebase.ts (removed swapTrack() function)"
    - "src/hooks/use-setlist-logic.ts (~80 LOC: registerOnApplyEdits/setContextData/handleApplyEdits gone)"
    - "src/app/perform/setlist/[id]/page.tsx (Swap mounts, swapTarget state, handleSwapSelect, lastOwnSwapRef gone)"
    - "src/components/performance/SetlistRow.tsx (onSwapTap prop + ArrowLeftRight import + swap-button JSX gone)"
    - "src/components/performance/SetlistView.tsx (onSwapTap prop forward gone)"
    - "+10 other files (toolbar buttons, test files, comments — see commit bodies)"

key-decisions:
  - "openai dep left in package.json — flagged but not removed (out of strict chat-surface scope)"
  - "template-parser.ts left in tree — orphan after chat removal but cleanup is out of scope"
  - "LeaderConsole disposition: already absent from prior v4.0 teardown; nothing to delete"
  - "live-session-firebase phantom mock in pdf-overlay.test.tsx left untouched — vi.mock of non-existent module is a silent no-op, not in strict swap-tag scope"
  - "Firestore rules NOT deployed — `firebase deploy --only firestore:rules` is a separate operational step the user runs"
  - "Production data NOT touched — config/songGroups doc + canLiveSwap claims + liturgicalSlot on library_index will be scrubbed by v50-07 migration"

patterns-established:
  - "Atomic-deletion-per-task workflow: each task ends in its own commit, each commit individually green (tests + tsc + build), so bisect can land mid-phase"
  - "Inventory-first: every deletion task starts with an exhaustive grep before any file is touched — surfaces 'already-gone' surprises early"
  - "Verification commands as part of the commit message body (not just acceptance criteria) — historical record of what was true at commit time"

duration: ~50min (single agent-driven session, three sequential dan-executor invocations)
started: 2026-04-26
completed: 2026-04-26
---

# Phase v50-02 Plan 01: Dead-code amputation — Summary

**Deleted the AI chat assistant, the live-swap UI surface, and the song-groups + canLiveSwap permission system in three atomic commits, removing ~2,363 net LOC and shrinking the editor's surface area before the local-first rebuild begins. 1281/1281 tests passing; tsc clean; next build success.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 min (3 dan-executor invocations + reconciliation) |
| Started | 2026-04-26 |
| Completed | 2026-04-26 |
| Tasks | 3 of 3 complete |
| Commits | 3 atomic |
| Files changed | 32 |
| LOC net | −2,363 (target was ~3,000; difference is prior-teardown overlap) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: AI chat assistant fully removed | ✅ Pass | `grep -rni 'ChatPanel\|chat-store\|chat-prompt\|/api/chat' src/` → 0 hits; tests + build + tsc all green; commit `4737214` |
| AC-2: Live-swap UI surface fully removed | ✅ Pass | `grep -rni 'SwapPicker\|SwapBottomSheet\|SwapToast\|SwapButton' src/` → 0 hits; `src/app/live/` does not exist; commit `9059d91` |
| AC-3: Song groups + canLiveSwap permission system fully removed | ✅ Pass | `grep -rni 'liturgicalSlot\|canLiveSwap\|songGroups\|swapTrack\|swapLiveTrack\|isNotTooFrequent' src/ firestore.rules` → 0 hits; commit `baf8109` |
| AC-4: Three atomic commits land on master, each individually bisectable | ✅ Pass | Three commits, each individually verified green; `git diff HEAD~3 HEAD --stat` confirms ~2,363 LOC net deletion |

## Accomplishments

- **Codebase 2,363 LOC lighter** before any new code lands. The setlist editor + perform-view surface that v50-03..v50-07 will operate on is materially smaller and easier to navigate.
- **Atomic-deletion pattern established** — inventory-via-grep, delete-files-and-edit-imports, verify-via-tests-and-build-and-grep, then commit. Each task self-contained, bisectable, repeatable.
- **Surfaced and resolved ghost references** — the `/live` route prefix in `src/proxy.ts` was a dead carve-out left from the v4.0 teardown; cleaned up incidentally. `live-session-firebase` phantom mock surfaced and intentionally deferred (not in scope).
- **Confirmed swap UI was mostly already absent** — LeaderConsole, SwapBottomSheet, SwapToast, SwapButton, `/live/[id]/`, song-groups module, `canLiveSwap` field, `liveState` field, `isNotTooFrequent()` rule all already gone from prior v4.0 P1 teardown. The plan's inventory was based on PROJECT.md historical record; reality was already half-cleaned. This is informative for v50-07 migration script — less to undo than expected.

## Task Commits

Each task committed atomically; each commit individually green (tests + tsc + build):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Delete AI chat assistant | `4737214` | feat | ChatPanel.tsx + chat-store + chat-prompt + /api/chat/route.ts + chat tests + 14 modified import sites; net −1786 LOC; 1292/1292 tests passing |
| Task 2: Delete live-swap UI surface + /live receiver | `9059d91` | feat | SwapPicker + SwapChangeToast + perform/setlist[id] swap mounts + SetlistRow/View `onSwapTap` + proxy.ts /live carve-out; net −515 LOC; 1282/1282 tests passing |
| Task 3: Delete swapTrack() + liturgicalSlot | `baf8109` | feat | swapTrack() function + its tests + liturgicalSlot field on DriveFile.metadata; net −62 LOC; 1281/1281 tests passing |

Cumulative: `git diff HEAD~3 HEAD --stat | tail -1` → 32 files changed, +28 / −2391 (net −2363 LOC).

Plan + summary (`.paul/phases/v50-02-amputation/v50-02-PLAN.md` + this file) commit at phase close (next).

## Files Created/Modified

### Deleted (10 files)
| File | Reason |
|------|--------|
| `src/components/setlist/ChatPanel.tsx` (~571 LOC) | AI chat UI |
| `src/lib/chat-store.ts` | Zustand chat state |
| `src/lib/chat-prompt.ts` | v4.3 prompt-injection sanitization (chat-only) |
| `src/app/api/chat/route.ts` (entire dir) | SSE chat endpoint |
| `src/lib/chat-store.test.ts` | Chat unit tests |
| `src/lib/__tests__/chat-prompt-injection.test.ts` | Chat security tests |
| `src/components/performance/SwapPicker.tsx` | Live-swap modal |
| `src/components/performance/SwapChangeToast.tsx` | Swap notification toast |
| `src/components/performance/__tests__/SwapChangeToast.test.tsx` | Swap toast tests |
| (plus describe blocks deleted from shared test files: `modal-state.test.tsx`, `touch-targets.test.tsx`, `setlist-firebase.test.ts`, `setlist-editor-v2.test.tsx`, `use-setlist-logic.test.ts`, `async-safety.test.tsx`) |

### Modified (significant)
| File | Change | Purpose |
|------|--------|---------|
| `src/types/models.ts` | Removed `liturgicalSlot?: string` from `DriveFile.metadata` | Drop type field for retired feature |
| `src/lib/setlist-firebase.ts` | Removed `swapTrack()` method (~37 LOC) | Function had zero callers after Task 2 |
| `src/hooks/use-setlist-logic.ts` | Removed `registerOnApplyEdits` / `setContextData` / `handleApplyEdits` (~80 LOC) | Chat hook integration points |
| `src/app/perform/setlist/[id]/page.tsx` | Removed swap state + handlers + JSX (~40 LOC) | UI no longer mounts swap surface |
| `src/components/performance/SetlistRow.tsx` | Removed `onSwapTap` prop + swap-button JSX | Now strictly read-only display |
| `src/components/performance/SetlistView.tsx` | Removed `onSwapTap` prop forward | Mirrors SetlistRow |
| `src/proxy.ts` | Removed `/live` from `publicPrefixes` | Dead public-route carve-out |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Removed chat auto-open + onOpenAI wiring | Editor no longer launches chat |
| `src/components/setlist/v2/SetlistMatrixView.tsx` | Removed `handleCellClick` Suggest button | Matrix is now read-only viewer |
| `src/components/setlist/v2/DesktopHeader.tsx`, `OverflowMenu.tsx` | Removed AI Assistant button + props | Toolbar entry points gone |
| `src/components/dashboard/CommandRow.tsx` | Removed Ask AI action + props | Dead-code cleanup (was already commented out) |
| `firestore.rules` | No changes — no swap-specific rules existed | Confirmed via grep |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Leave `openai` dep in package.json | Out of strict chat-surface scope; package.json deps require their own audit cycle. Bundle effect of unused dep is zero (tree-shaking). | Future cleanup task: remove unused deps holistically |
| Leave `template-parser.ts` in tree | Sole consumer (`/api/chat`) was deleted, but module is harmless and separate-concern cleanup. | Future cleanup task: orphan-module sweep |
| Leave `live-session-firebase` phantom `vi.mock` in `pdf-overlay.test.tsx` | `vi.mock` of a non-existent module is a silent no-op, not a swap-tagged reference. Untouched per scope. | None functional |
| Don't deploy Firestore rules | `firebase deploy --only firestore:rules` is operational, separate from code changes; user runs at their discretion. | User's call when to deploy |
| Don't touch production Firestore data | `config/songGroups`, `canLiveSwap` claims, `liturgicalSlot` on library_index docs — data scrubbing belongs in v50-07 migration script. | v50-07 backlog updated |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Stale `.next/` cache type validator referencing deleted `api/chat/route.js`; cleared `.next/` and tsc ran clean |
| Scope additions | 1 | `/live` carve-out in `src/proxy.ts` removed during Task 2 (not in original inventory but obviously correct) |
| Deferred | 3 | `openai` dep removal; `template-parser.ts` deletion; phantom `live-session-firebase` mock cleanup — all out of strict scope |

**Total impact:** Plan executed as written. The "surprise" was opposite of risky: most of the inventory was already gone from prior teardowns, so Task 3 collapsed from a multi-system rip to a 3-file cleanup. Net deletion target was ~3,000 LOC; actual was ~2,363 — the difference is the v4.0 P1 teardown having already done its share of the work.

### Auto-fixed Issues

**1. [build] Stale Next.js type validator**
- **Found during:** Task 1 (chat deletion), tsc run
- **Issue:** `.next/` build cache contained a generated type referencing `api/chat/route.js` after the source file was deleted; tsc surfaced the orphan type
- **Fix:** Cleared `.next/` and re-ran tsc clean
- **Files:** none (cache-only)
- **Verification:** `npx tsc --noEmit` clean post-clear
- **Commit:** part of `4737214`

### Scope additions

**1. `/live` prefix removed from `src/proxy.ts`**
- **Found during:** Task 2 (live-swap UI deletion), grep over `src/`
- **Why added:** `src/proxy.ts:29` had `/live` in `publicPrefixes` — a dead carve-out from when the receiver page existed. Removing it costs nothing and prevents the stale public-route entry from rotting further.

### Deferred Items

- **`openai` npm dependency** — present in `package.json`, no `src/` callers, likely chat-historical residue. Not removed in this phase (out of strict scope: file-level deletions, not dependency cleanup). Deletion is safe and bundle-positive but should run as its own task with verification.
- **`src/lib/template-parser.ts`** — orphan after chat deletion (sole consumer was `/api/chat/route.ts`). Module is harmless; deletion is future work.
- **`live-session-firebase` phantom `vi.mock` in `pdf-overlay.test.tsx:83`** — `vi.mock` of a non-existent module is a silent no-op; not a swap-tagged reference; left untouched.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Stale Next.js build cache type validator | Cleared `.next/` directory |
| LeaderConsole, SwapBottomSheet, SwapToast, SwapButton, `/live/[id]/` all already absent | Plan inventory was based on historical record; actual codebase was further along. No problem — Task 3 reduced from 7 surfaces to 3 files. |

## Next Phase Readiness

**Ready:**
- v50-03 (Local-first sync engine) can plan against the smaller src/ surface
- `setlist-firebase.ts` is cleaner — `swapTrack()` gone, just `subscribeToSetlist`/`updateSetlist`/`deleteSetlist`/standard CRUD remains
- Editor surface (`use-setlist-logic.ts`, `SetlistEditorV2.tsx`) shed ~80–120 LOC of chat integration noise; v50-05 cutover has less to refactor
- All v5.0 milestone phases past v50-02 are unblocked

**Concerns:**
- `openai` dep in package.json — if accidentally imported in future code, would compile silently. Run `npm uninstall openai` as a low-priority cleanup.
- `template-parser.ts` orphan — same risk profile, low priority.
- v50-07 migration backlog grew: must scrub `config/songGroups` doc, `canLiveSwap` user claims, `liturgicalSlot` on library_index docs.

**Blockers:**
- None.

---
*Phase: v50-02-amputation, Plan: 01*
*Completed: 2026-04-26*
