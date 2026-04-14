# FINDINGS — v4.2 Phase 1 Recursive Research

**Date:** 2026-04-13
**Deliverable:** ranked findings + routing into Roadmap
**Inputs:** 6 × WAVE-1-*.md, WAVE-1-SYNTHESIS.md, 3 × WAVE-2-*.md

Two waves of parallel research across bugs, missing UI, error handling, pain points, inconsistencies, and security. Wave 2 drilled into the three biggest uncertainties.

---

## P0 — Blocks band onboarding (insert as decimal phases ahead of Phase 2)

### P0-1 — Last-write-wins on setlists destroys concurrent edits
- **Category:** bug
- **Files:** `src/lib/setlist-firebase.ts:92, :241`; `src/hooks/use-setlist-logic.ts:245–327, :602`; `src/hooks/use-add-to-setlist.ts:104–170`; `src/components/setlist/ChatPanel.tsx:154`; `src/app/api/setlists/import/execute/route.ts:133`
- **What's wrong:** every write to `setlists/{id}.tracks` is a full-array replace, with no transaction, no `arrayUnion`/`arrayRemove`, no version check. The editor hook `use-setlist-logic` never subscribes to the setlist doc for incoming changes. Two concurrent editors (same user across devices, or two band leaders) whose writes both land inside the 1-second autosave debounce silently overwrite each other.
- **Why it matters:** directly blocks band onboarding. Rabbi Daniel and Randy editing on separate devices — one loses data silently. Publishing to a band is the moment when concurrent edits become likely.
- **Wave 2 confirmed** reproducible; recommended **Option D + A** (rev/updatedAt precondition inside `runTransaction` + `subscribeToSetlist` inside the editor hook with a "setlist changed — merge?" banner).
- **Effort:** 10–14 hours.
- **ROUTING:** **New phase 1.1 — Concurrent-edit safety.** Must land before Phase 2 touches the save path.

### P0-2 — Offline feature is dead and lying
- **Category:** bug / trust
- **Files:** `src/hooks/use-offline.ts:99–116`; `src/components/setlist/SetlistCards.tsx` (offline-ready pill); `src/components/home/*` (HeroCard offline ratio); `src/lib/offline-manager.ts` (`getOfflineStats`); `src/components/performance/OfflineIndicator.tsx` / `PerformanceOfflineIndicator.tsx`
- **What's wrong:** v2.5 Phase 6.1 removed the service worker and uninstalled `@ducanh2912/next-pwa`. `SwCleanup.tsx` actively unregisters any stragglers. `downloadFile`/`downloadSetlist` now `fetch()` and discard the response — nothing writes to Cache Storage, so `isFileCached()` is structurally unable to return true in production. The whole UI still displays "offline ready" pills, green checkmarks, ratios, and banners that are all false. `use-offline.ts:99–116` counts failed fetches as successes — the original Wave 1 bug is only the tip of this.
- **Why it matters:** musicians at a low-Wi-Fi sanctuary will arrive with no charts, a green "offline ready" pill, and no warning. Direct band-onboarding blocker.
- **Wave 2 confirmed** + recommended **Option C** — kill the Cache-API pretense, add an IndexedDB blob store, `SmartScoreViewer` prefers the IDB blob, pills read IDB ground truth, keep a "Pre-load setlist" action so the weekly workflow survives.
- **Effort:** ~7 hours.
- **ROUTING:** **New phase 1.2 — Offline truthiness.** Must land before first band service. Phase 3 scope unchanged (the transposition / note-contrast / swap-ack items are independent).

---

## P1 — Painful but workable (fold into existing Phases 2–5)

### Routed to Phase 2 (Weekly Workflow Polish)

- **P1-a** `beforeunload` / `pagehide` invokes async `updateDoc` whose promise is dropped — last-second edits can be lost on tab close. `src/hooks/use-setlist-logic.ts` (around the unload handler). **Adds to:** Phase 2 autosave-trust scope.
- **P1-b** "Gig Packet" / "Print" / "Share Setlist" / "Export" labeled four different ways across `PrintModal`, `SetlistTopBar`, `OverflowMenu`, perform page. Unify copy. **Adds to:** Phase 2.
- **P1-c** CreationWizard doesn't auto-advance on template tap and has no Enter-key binding. **Extends:** Phase 2 wizard simplification (already in scope for template-step removal; fold in the auto-advance + Enter).
- **P1-d** No global `Cmd/Ctrl+Z` for undo/redo despite the capability existing. **Adds to:** Phase 2.

### Routed to Phase 3 (Stage UX)

- **P1-e** `notifySetlistUpdated` calls a client-side `users` query that Firestore rules block; failure silently swallowed, so the in-app "setlist updated" notification never fires for musicians. `src/lib/notification-store.ts`. **Aligns with** the Phase 3 musician-side "Setlist updated" toast — must be fixed as part of that work, server-side or via rule relaxation.
- **P1-f** No ErrorBoundary around `PDFOverlay` / `PDFViewer` — a bad PDF crashes the whole stage view. **Adds to:** Phase 3.
- **P1-g** Two `/perform` routes (`[fileId]` vs `setlist/[id]`) wrap `PDFOverlay` inconsistently — `[fileId]` double-wraps with `fixed inset-0 z-50`. **Adds to:** Phase 3.
- **P1-h** SwapPicker has no Enter / Esc / arrow-key bindings and pre-fills the search with the song-to-replace (forces select-all+delete). iOS autoFocus drops without the `setTimeout(100)` hack. **Extends:** Phase 3 (previously only the sheet height was in scope; add keyboard + autofocus).
- **P1-i** PDFOverlay has no Escape-key binding. **Adds to:** Phase 3.
- **P1-j** Offline indicator mobile — already in Phase 3. Wave 2 adds: once P0-2 is fixed, the mobile indicator should reflect the *real* IDB ground truth, not the old lying signal. **No scope change, just dependency note.**

### Routed to Phase 4 (Editor Cleanup)

- **P1-k** `useSafeFirestoreSync` depends on raw `ref` identity; unmemoized callers cause listener churn and loading flicker. Touches several hooks. **Adds to:** Phase 4.
- **P1-l** `useUpcomingPrep` stuck loading forever when the result set is empty. **Adds to:** Phase 4.
- **P1-m** Hand-rolled `TransferSetlistDialog` (no Esc, no backdrop click, no Enter-to-submit, doesn't clear email on cancel) and `SetlistHistoryPanel` uses `window.confirm()` for a destructive restore. **Extends:** Phase 4 modal consolidation scope.
- **P1-n** Hardcoded `INSTRUMENTS` in `DashboardClient.tsx:30` diverges from the authoritative registry in `lib/musician-profile.ts`. **Adds to:** Phase 4.
- **P1-o** `REQUIRED` band-instruments list duplicated verbatim in `musician-suggestions.ts:40` and `api/scheduling/suggest-band/route.ts:103`. **Adds to:** Phase 4 (one shared const).
- **P1-p** Three separate `formatEventDate` implementations (`firestore-helpers.ts`, inline `ScheduleCard.tsx`, `remind/route.ts`). **Adds to:** Phase 4 (one shared helper).
- **P1-q** Four different shapes of "can edit setlist" predicate across server page, hook, perform page. **Adds to:** Phase 4 (one `canEditSetlist()` helper).
- **P1-r** Z-index soup — nearly everything is `z-50`; only `SmartTransposer` uses `var(--z-*)` tokens. **Adds to:** Phase 4 (introduce tokens and migrate the dialogs we're already touching).
- **P1-s** Silent `.catch(() => {})` on ~20 write paths in various files (`use-offline.ts` delete/duplicate flows, `session refresh`, `push registration`, etc.). Wave 1 errors agent has the full list. **Extends:** Phase 4 "silent-failure error toasts" scope from 3 paths to ~10.
- **P1-t** No timeout/abort on `apiFetch` or PDF fetches. **Adds to:** Phase 4.

### Routed to Phase 5 (Nav + Schedule Hygiene)

- **P1-u** Orphan routes `/settings/users` and `/settings/sound` — exist on disk, linked from nothing, duplicate UI that now lives in `ManageClient.tsx`. **Adds to:** Phase 5 deletion sweep.
- **P1-v** `SetlistDrawer` vs `SetlistView` potential dead / overlapping component. **Adds to:** Phase 5 (dead-code sweep).
- **P1-w** `monitor-live/commands/pending` collection path — usage unclear. Needs a quick trace; likely dead. **Adds to:** Phase 5.

### Security items (separate mini-phase recommended)

- **P1-x** `storage.rules` not committed. Wave 2 confirmed deployed rules are sane (`allow read: if request.auth != null` on `library/**`, `write: if false`), but drift is console-only. **Fix:** commit `storage.rules` mirroring the Firestore `isMember()` gate, add to `firebase.json`, CI dry-run. ~2h.
- **P1-y** `/api/bridge/setup-code` GET returns the raw `FIREBASE_PRIVATE_KEY` to anyone presenting a valid 6-char code. Mitigated by TTL + one-time use, but 6 chars ≈ 30 bits and the general-tier rate limiter permits distributed attempts. **Fix:** raise entropy to 10+ chars, tighten rate limit for the setup-code endpoint. ~1h.
- **P1-z** `/api/nudge-admin` and `/api/scheduling/calendar-feed/[token]` have no rate limit. **Fix:** add `checkRateLimit`. ~1h.

**ROUTING proposal:** these three P1s are small but orthogonal to the UX work. Either (a) a **new phase 1.3 — Security hardening** (~4h) landing alongside 1.1/1.2, or (b) fold into Phase 5 as a security subsection. My recommendation: **(a) new phase 1.3** — they're independent of UX flow and can be done in parallel with 1.1/1.2 development.

---

## P2 — Polish / deferred

From Wave 1 (not worth enumerating each — see source files):

- ~15 icon-only buttons using `title` but no `aria-label`.
- `AudioFilePicker` / `SongNavigation` empty states missing action buttons.
- `NamePrompt` `grid-cols-2` with only Date picker inside → permanently half-empty.
- Deprecated-but-rendered props in `SetlistToolbar`, `NamePrompt`, `use-setlist-dashboard`.
- Misc stale refs (`lastClaimsUpdate` across user changes; never-removed `beforeunload`/`visibilitychange` on monitor singleton; wake-lock double-acquire on iOS visibility).
- Hex colors in `email.ts`, `email-scheduling.ts`, `login/page.tsx` bypass OKLCH tokens.
- AddSongsModal search not debounced.
- Long-press vs iOS text selection collision.
- `useLibrary` query key including `force` (parallel caches).

**ROUTING:** defer all P2s. Revisit after v4.2.

---

## Roadmap delta

### New decimal phases to insert (ahead of Phase 2)

| # | Name | Scope | Effort | Blocks |
|---|---|---|---|---|
| **1.1** | Concurrent-edit safety | Transaction + `rev` precondition + editor subscribes + "setlist changed — merge?" banner. Covers every full-array `tracks` write. | 10–14h | Band onboarding |
| **1.2** | Offline truthiness | Kill Cache-API pretense. IndexedDB blob store. `SmartScoreViewer` reads IDB. Pills/banners read IDB ground truth. "Pre-load setlist" keeps working. | ~7h | First band service |
| **1.3** | Security hardening | Commit `storage.rules` + `firebase.json`. Raise bridge setup-code entropy + rate limit. Rate-limit `/api/nudge-admin` + `calendar-feed`. | ~4h | Not blocking but should precede public-ish endpoints |

### Existing phases — scope expansions

- **Phase 2 (Weekly Workflow Polish):** + drop `beforeunload` promise fix, + unify "Gig Packet" copy, + auto-advance wizard on template tap + Enter-key, + global Cmd/Ctrl+Z undo/redo.
- **Phase 3 (Stage UX):** + fix `notifySetlistUpdated` rules-blocked query (server-side or relax rules), + ErrorBoundary around PDF viewer, + unify two `/perform` route wrappers, + SwapPicker keyboard bindings + pre-fill fix + iOS autofocus, + PDFOverlay Esc binding. Mobile-offline-indicator item inherits IDB ground truth from 1.2.
- **Phase 4 (Editor Cleanup):** + memoize `useSafeFirestoreSync` refs, + fix `useUpcomingPrep` empty-state loading, + TransferSetlistDialog + SetlistHistoryPanel modal modernization, + unify hardcoded INSTRUMENTS + REQUIRED list + formatEventDate + `canEditSetlist()` helper + z-index tokens + silent catch cleanup + fetch timeout/abort.
- **Phase 5 (Nav + Schedule Hygiene):** + delete `/settings/users`, `/settings/sound`, `SetlistDrawer` if dead, `monitor-live/commands/pending` if dead.

### New milestone length

Before research: 5 phases. After: **8 phases** (1, 1.1, 1.2, 1.3, 2, 3, 4, 5). Pre-Phase-2 P0/P1 work adds ~21–25 hours.

---

## Summary

- 53+ findings across 6 research angles + 3 targeted drill-downs.
- **2 P0s** confirmed: concurrent-edit silent-destroy, and fully-dead offline feature presenting as working.
- Both become new decimal phases (1.1, 1.2) before Phase 2 execution.
- 1 new small security phase (1.3) recommended alongside.
- ~20 P1s fold cleanly into existing Phases 2–5 scopes.
- P2s deferred.

Ready for human-verify checkpoint (Task 5). On approval, will update `.paul/ROADMAP.md` and `.paul/STATE.md` with the three new phases and the scope expansions.
