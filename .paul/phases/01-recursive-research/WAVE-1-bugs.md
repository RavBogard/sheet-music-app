# Wave 1 — Bugs & Race Conditions

## Summary
The codebase shows mature listener hygiene (central `useSafeFirestoreSync`, ref-counted monitor singleton, debounced teardown) but has several concurrency foot-guns that will bite when a real band uses two devices simultaneously. The most consequential class of issue is **last-write-wins on the `setlists/{id}` document**: autosave from `use-setlist-logic` and `swapTrack`/`updateSetlist` in `setlist-firebase.ts` both do full-doc `updateDoc` on the entire `tracks` array with no transaction, `updatedAt` compare, or array-level `arrayUnion`. If Rabbi Daniel edits on a laptop while Randy reorders on an iPad, whoever's debounce fires second silently clobbers the other's changes. Secondary issues cluster around unstable hook dependencies (firestore `doc`/`query` identities driving resubscribes), unremoved window listeners on `window`/`document`, fire-and-forget `notifySetlistUpdated` from client that requires a users-collection list query likely blocked by rules, and one genuine stuck-spinner state on the upcoming-prep hook.

## Findings

### FIND-001 Write race on setlists tracks (no transaction / no version guard) (Severity: P0)
- **Category**: bug / race condition
- **File**: `src/lib/setlist-firebase.ts:92-109` (`updateSetlist`), `src/lib/setlist-firebase.ts:241-255` (`swapTrack`), `src/hooks/use-setlist-logic.ts:245-327` (`performSave`)
- **What's wrong**: Every mutation sends the entire `tracks` array via `updateDoc` with no `runTransaction`, no `updatedAt` precondition check, and no per-track id reconciliation against the live snapshot. Two concurrent editors each read local state, debounce 1s, and each write the full array — the later write wipes the earlier.
- **Why it matters**: Silent data loss on the primary band workflow (two people finalizing a setlist). No error, no toast, no undo.
- **Suspected fix**: Transaction with `updatedAt` guard, or move to per-track subcollection with `arrayUnion`/`arrayRemove` semantics, or merge incoming snapshot state into local before save.

### FIND-002 Autosave doesn't reconcile with incoming onSnapshot updates (Severity: P0)
- **Category**: race condition
- **File**: `src/hooks/use-setlist-logic.ts:61` (local `tracks` state) vs `src/hooks/use-setlist-performance.ts:40` / editor snapshot sources
- **What's wrong**: The editor keeps `tracks` as pure local state seeded from `initialTracks`. There is no subscription that merges incoming setlist doc changes into the editor's local state, so Editor A and Editor B drift until one saves and overwrites. The performance view subscribes, but the editor view does not.
- **Why it matters**: Combined with FIND-001, a second open tab of the same setlist will carry stale tracks forever and will destroy newer work on its next keystroke-triggered debounce.
- **Suspected fix**: Subscribe to the doc in the editor too, with a dirty-flag / three-way merge, or show a "reload" banner when server `updatedAt` advances past the last-saved local.

### FIND-003 beforeunload/pagehide calls async save; Promise is dropped (Severity: P1)
- **Category**: bug
- **File**: `src/hooks/use-setlist-logic.ts:359-386`
- **What's wrong**: `flushSave()` invokes `performSaveRef.current()` which is async; the browser will terminate the page before the `updateDoc` Promise resolves. No `navigator.sendBeacon`/keepalive fetch fallback.
- **Why it matters**: Last-second edits (changing the date, the rabbi, or a track) are lost if the user closes the tab before the 1s debounce elapses.
- **Suspected fix**: Keep a keepalive `fetch` to an API route that performs the save, or move to sendBeacon; at minimum document that this is best-effort.

### FIND-004 `useSafeFirestoreSync` has unstable `ref` dep causing resubscribe churn (Severity: P1)
- **Category**: bug
- **File**: `src/hooks/use-safe-firestore-sync.ts:135`
- **What's wrong**: The effect depends on `ref`. `doc()` and `query()` return fresh object identities each render unless memoized by the caller. Any caller that forgets `useMemo` (or whose memo deps are unstable) will tear down and recreate the `onSnapshot` listener every render — temporary `loading: true` flashes and wasted reads. Callers are inconsistent: `use-setlist-performance.ts:36-39` memoizes, `use-upcoming-prep.ts:67-82` memoizes, but `useSafeFirestoreSync` itself doesn't defend against identity changes by path-comparing.
- **Why it matters**: UI flicker, extra Firestore reads, and in the worst case flash-of-empty-state on every parent re-render.
- **Suspected fix**: Compare by `ref.path` (Firestore refs expose `.path`) or by `ref._query`/`ref._key` to dedupe; callers still must memoize but the hook should be resilient.

### FIND-005 `useUpcomingPrep` stuck loading when result is empty (Severity: P1)
- **Category**: bug
- **File**: `src/hooks/use-upcoming-prep.ts:201`
- **What's wrong**: `isLoading: user !== null && isMember && setlists.length === 0`. After the subscription returns an empty array (no upcoming services), `setlists.length === 0` stays true forever and the dashboard hero zone will render its loading skeleton indefinitely.
- **Why it matters**: Dashboards appear to hang for members with no upcoming services.
- **Suspected fix**: Track a `hasResolved` flag from the underlying sync's `loading` state instead.

### FIND-006 `notifySetlistUpdated` calls `getActiveMemberUids` from the client; likely blocked by rules (Severity: P1)
- **Category**: bug (silent failure)
- **File**: `src/lib/notification-store.ts:206-220`, called from `src/hooks/use-setlist-logic.ts:309`
- **What's wrong**: `getActiveMemberUids` queries `users` with `where('role','in',[...])`. Client-side rules almost certainly forbid listing the users collection, so this `getDocs` throws and the outer try/catch in `notifySetlistUpdated` swallows it. No toast, no retry.
- **Why it matters**: Musicians never receive in-app notifications when tracks are added/removed despite the "5-minute throttle" implying it's firing.
- **Suspected fix**: Move the broadcast to a server route (there's already `/api/push/send`) and call it fire-and-forget from the client — and surface server errors to a logger.

### FIND-007 `lastClaimsUpdate` ref not reset on user change (Severity: P2)
- **Category**: bug
- **File**: `src/lib/auth-context.tsx:80, 138-141`
- **What's wrong**: When `onAuthStateChanged` fires for a new user (after sign-out/sign-in as a different account), `lastClaimsUpdate.current` still holds the previous user's `claimsUpdatedAt`. If the new user's value differs (almost always), a spurious forced-token refresh fires on the first profile callback.
- **Why it matters**: Harmless extra network call, but could cascade if token refresh fails mid-sign-in.
- **Suspected fix**: Reset `lastClaimsUpdate.current = null` at the top of the auth callback.

### FIND-008 Monitor teardown listeners never removed (Severity: P2)
- **Category**: memory/listener leak
- **File**: `src/hooks/use-monitor-connection.ts:163-176`
- **What's wrong**: `window.addEventListener('beforeunload', …)` and `document.addEventListener('visibilitychange', …)` are added once (guarded by `unloadListenerAdded`) but never removed, and their handler closures hold `auth` / `activeClient` references. In a Next.js client-side navigation that unmounts all monitor consumers, the listeners persist and will call `ensureConnected` if visibility flips. Also the `authUnsub` is created once but never revoked when every consumer unmounts.
- **Why it matters**: Subtle leak in long-lived tabs; may reconnect after the user intended to fully disengage.
- **Suspected fix**: Track the listeners in module variables and remove on final teardown.

### FIND-009 Wake lock double-acquire on visibility change (Severity: P2)
- **Category**: bug
- **File**: `src/hooks/use-wake-lock.ts:65-74, 55-62`
- **What's wrong**: When the tab becomes visible, `acquireLock` runs unconditionally if `shouldLockRef.current` is true — even if `wakeLock` state still holds a live sentinel (the `release` event lags the visibility event on iOS). The unmount cleanup also depends on `wakeLock` state; when `wakeLock` changes, the cleanup releases the *previous* sentinel, but iOS may have already auto-released it, producing an error logged as "Failed to release Wake Lock".
- **Why it matters**: Console noise; rarely two outstanding sentinels until one auto-releases.
- **Suspected fix**: Guard `acquireLock` with `if (wakeLock && !wakeLock.released) return`.

### FIND-010 Monitor command throttle: `existing.data` updated but timer not reset (Severity: P2)
- **Category**: bug
- **File**: `src/lib/firestore-monitor-client.ts:256-279`
- **What's wrong**: On a burst of fader changes, only the *first* send is immediate; intermediate values mutate `existing.data` in place, and the closure variable `data` captured in the timer callback is the first burst value — the `latest.data !== data` comparison works because the reference changed. However, after the timer fires and deletes the entry, the very next command is sent immediately (good), but any commands that arrived *while the timer was pending* and equalled the originally captured `data` object will not trigger a follow-up. In practice this can't happen because `sendCommand` constructs a fresh `data` object per call, so the `!==` check always passes — fine. But `setSendLevel` always builds `{type, busIndex, channelIndex, value}` fresh, so the check is effectively `always true`, making the throttle reduce to "first value immediate + last value after 50ms". Fine for faders, but the comment claims "only the latest value is sent" which is misleading for drag gestures longer than 50ms where middle values are dropped.
- **Why it matters**: Might feel choppy on long fader drags; not a correctness bug, just divergent from docs.
- **Suspected fix**: Rewrite the throttle as a proper trailing throttle that always flushes the latest on timer end.

### FIND-011 `use-library` query key includes `force` — cache never reused across "force refresh" toggles (Severity: P2)
- **Category**: bug
- **File**: `src/hooks/use-library.ts:45`
- **What's wrong**: `queryKey: ['library','v2',collection,force,!!user]` — when any consumer calls with `force=true`, it creates a parallel cache entry. Consumers with `force=false` still see stale data for 24h (`staleTime`) even after a force-fetch populated fresh data.
- **Why it matters**: Library won't appear to update for viewers after an admin upload + force refresh.
- **Suspected fix**: Drop `force` from the query key and use `queryClient.invalidateQueries` or `refetch({cancelRefetch:true})` on forced loads.

### FIND-012 Monitor client `connect()` error retry leaks snapshot state across reconnects (Severity: P2)
- **Category**: bug
- **File**: `src/lib/firestore-monitor-client.ts:150-157`
- **What's wrong**: Error retry path calls `this.connect()` recursively, which sets `_firstSnapshot = true` but does *not* clear `_snapshotDebounceTimer` or `_pendingSnapshot`. A pending debounce from before the error will fire with stale data into the newly connected store.
- **Why it matters**: Brief flash of stale fader positions after a transient reconnect.
- **Suspected fix**: Reset debounce timer + pending snapshot before re-subscribing in the retry branch.

### FIND-013 `use-setlist-logic` autosave effect deps omit `performSaveRef` and include frequently-changing arrays (Severity: P2)
- **Category**: bug (performance)
- **File**: `src/hooks/use-setlist-logic.ts:337-355`
- **What's wrong**: The debounce timer resets on every keystroke (correct), but `tracks`/`musicians` are new array identities on every local update, so even rapid typing into `name` coalesces correctly while each structural edit restarts the timer — acceptable. However, the cleanup clears the timer on *every* dependency change, meaning if the user types name (restart timer) then changes a track (restart timer) every 900ms they can keep pushing back the save indefinitely with no ceiling. A "max-wait" safety net is missing.
- **Why it matters**: Edge case: a long editing session with constant small edits may never persist until the user pauses for >1s.
- **Suspected fix**: Add a `maxWait` guard (e.g. force flush every 10s regardless).

## Uncertainties (for Wave 2)
- **Firestore rules vs client reads on `users` collection** — confirm `notifySetlistUpdated` really 500s. Need rules file read + integration test.
- **Composite indexes on `setlists` queries** — `eventDate` range + orderBy, plus any `where('role','in',…)` on users. Index definition file not inspected.
- **Chat store listener lifecycle** — `src/lib/chat-store.ts` and `TaskCards.tsx` have onSnapshot calls; didn't drill in.
- **`use-smart-transposer.ts`** (583 lines, 4 useEffects) — complex hook, deserves a dedicated read for stale-closure bugs around PDF rendering and transposition state.
- **`sync-engine.ts` + `offline-manager.ts`** — offline-first path; worth confirming IndexedDB writes are idempotent and don't race with online snapshot hydration.
- **`FirestoreMonitorClient` write path** — `addDoc` to `monitor-live/commands/pending` as a *subcollection under a document field*: the path `collection(db, "monitor-live", "commands", "pending")` treats `commands` as a doc id and `pending` as a subcollection name. Verify this matches the bridge's reader and rules.
- **Setlist editor multi-tab cursor/selection collision** — beyond track array, inputs for `name`, `rabbi`, `serviceNotes` have the same unreconciled-local-state problem; needs UX judgement.
- **Push notification token rotation** — `pushRegistered` ref is per-mount, but token refresh on the service worker isn't audited here.
