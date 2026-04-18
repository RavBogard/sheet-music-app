# WAVE 2 — Last-Write-Wins on `setlists/{id}.tracks`

**Severity**: P0 (confirmed). Silent data loss with two concurrent editors.
**Confirmed**: Yes — every setlist mutation is a full-document replace of `tracks`, and the editor never subscribes to remote changes during an edit session.

---

## 1. Surface Area — every write that touches `tracks`

All writes below are **full-array replaces** (no `arrayUnion`, no `arrayRemove`, no transactions, no version check). Unless noted, each write clobbers whatever the server currently holds.

### Client SDK (`src/lib/setlist-firebase.ts`)
- `createSetlist` L57–76 — initial full write. Benign (new doc).
- `updateSetlist` L92–109 — **full-array replace** via `updateDoc({ tracks, ... })`. Used by auto-save and undo flow. **Primary offender.**
- `duplicateSetlist` L163–180 — full write into a NEW doc. Benign.
- `cloneForNextWeek` L183–215 — full write into a NEW doc. Benign.
- `saveAsTemplate` L218–238 — full write into a NEW doc. Benign.
- `swapTrack` L241–255 — reads `currentTracks` from the client's in-memory copy, spreads, overwrites index, then `updateDoc({ tracks: newTracks })`. **Read-modify-write with no transaction — classic race.**
- `deleteSetlist` L111–137 — deletes the whole doc; not a tracks race but noted.

### Editor hook (`src/hooks/use-setlist-logic.ts`)
- `performSave` L245–327 — debounced 1 s, calls `updateSetlist(id, { tracks: t, ... })` with the local `tracks` array. **No `subscribeToSetlist` call anywhere in this hook.** Only `allFiles` backfill and offline-status sync run against `tracks`; remote state is never reconciled. `initialTracks` is seeded once from the page loader and the local copy is authoritative for the entire session.

### Other mutation sites
- `src/hooks/use-add-to-setlist.ts` L104–128 — reads `setlist.tracks` from the subscribed snapshot, appends, writes the full array via `updateSetlist`. The **undo** path (L150–170) does subscribe-once, filter by id, full-write back — better but still not atomic, and it loses concurrent additions between subscribe and write.
- `src/components/setlist/SetlistHistoryPanel.tsx` L79 → `restoreTracks` in `use-setlist-logic` L602 — replaces local `tracks` wholesale, which then fires the debounced `performSave` → full-array write.
- `src/components/setlist/ChatPanel.tsx` L260+ and `src/app/api/chat/route.ts` L167 — AI edits flow through `handleApplyEdits` (hook L154–217) which mutates local `tracks`; saved via the same debounced `updateSetlist`. Same race.
- `src/app/api/setlists/import/execute/route.ts` L133 — server-side `tracks: resolvedTracks` full write on a newly-created setlist (benign) / existing (potentially clobbers).
- `src/app/api/setlist/publish/route.ts` L93, L100 — server-side `setlistRef.update({...})` on publish. Grep shows it writes snapshot-related fields, not `tracks` directly; low risk but worth confirming during fix work.
- `SetlistEditorV2.tsx` — purely a view over the hook's local state. Local state is authoritative; the component never merges remote snapshots. Confirms the bug surface is the hook, not the component.

---

## 2. Reproduction Scenario (confirmed by code path)

**Setup**
- Tab A and Tab B both load `/setlists/{id}` as the same band-leader user (or two users with edit permission). Both land in `SetlistEditorV2` → `useSetlistLogic` seeded with identical `initialTracks` (e.g. 5 tracks).

**Actions** (within ~2 seconds)
1. Tab A deletes track index 1 (`deleteTrack` → `setTracks` → debounce 1 s).
2. Tab B appends a new track at index 5 (`addSongsFromLibrary` → `setTracks` → debounce 1 s).

**What happens**
- At t≈1.0 s, Tab A fires `updateDoc({ tracks: [t0,t2,t3,t4] })`.
- At t≈1.2 s, Tab B fires `updateDoc({ tracks: [t0,t1,t2,t3,t4, NEW] })` — still holding the *original* 5-track array because the hook never subscribed, so Tab B never saw Tab A's delete.
- Firestore accepts both writes in order. Final doc = Tab B's array. **Tab A's deletion is silently reverted.**
- Reverse order: Tab A lands last → **Tab B's new track is silently dropped.**

No error surfaces. `lastSaved` updates in both tabs. Audit log shows both `tracks_updated` entries with contradictory `trackCount`. The losing tab continues to display its stale local state until a full page refresh.

`swapTrack` has the same race against any concurrent edit, compounded by reading `currentTracks` from a prop rather than from the server.

---

## 3. Fix Options

- **A. Subscribe-and-merge (minimal)** — add `subscribeToSetlist` inside `useSetlistLogic`; on remote change, if there are no pending local edits, replace local state; if there are, surface a "remote changes detected" banner and offer merge/discard. Catches the visibility problem but does not prevent the race between the debounce and the server write.
- **B. Per-field atomic ops** — switch `updateSetlist`, `swapTrack`, `use-add-to-setlist`, and history-restore to use indexed-field updates or `arrayUnion`/`arrayRemove` keyed on track `id`. Structurally correct but requires rethinking reorder (no array-move primitive) and the debounced whole-setlist save.
- **C. Transactions on every write** — `runTransaction` reads the doc, applies the diff, writes. Full correctness, ~1 extra RTT per save, manageable at this scale.
- **D. Optimistic concurrency (`rev` or `updatedAt` precondition)** — include the last-seen `rev` in every write; reject stale writes; prompt user to refresh/merge. Low latency, clear UX, cheap to implement.

**Recommendation: D + A combined.** Add a `rev: number` (or `updatedAt` timestamp) to the doc, bumped inside a transaction on every write. The editor subscribes to remote changes, keeps `rev` in state, and passes it as a precondition. On mismatch, we reject the write and show "Setlist was updated by another editor — refresh to merge." Option A alone lets the race happen; B is a correctness win but a multi-day refactor that risks destabilising reorder/chat/import right before onboarding; C adds latency everywhere for a problem that is rare in practice. **D + A** closes the data-loss hole with a narrow, testable change and gives us a real-time UI where two editors see each other's work — which is what a band actually wants.

**Rationale vs. onboarding deadline (~1 month)**: this is the single highest-impact correctness bug before real users touch the app. D+A is ~1–2 days of work; B is ~1 week and destabilises shipped features. We want "bulletproof and intuitive" (per MEMORY.md), not "heroic refactor under deadline."

---

## 4. Effort Estimate

- Transaction wrapper + `rev` field in `updateSetlist`, `swapTrack`, `use-add-to-setlist`, `SetlistHistoryPanel` restore path: **4–5 h**
- Hook subscribes to `setlists/{id}`; merge-or-banner UX; plumb `rev` into save ref: **3–4 h**
- Tests (two-tab race with fake timers; stale-rev rejection; swap conflict): **2–3 h**
- Server routes (`publish`, `import/execute`) audited and upgraded to transactions where they touch `tracks`: **1–2 h**
- **Total: 10–14 h** (~1.5 focused days).

---

## 5. Phasing Proposal

Fold into a new **decimal Phase 1.1 "Concurrent-edit safety"** inserted between the current Phase 1 research and Phase 2. Rationale:
- Phase 2 presumably builds on the editor — doing 1.1 first means Phase 2 never has to re-touch the save path.
- It is scoped (single feature area), testable in isolation, and deliverable in under two days.
- Keeps Phase 2's intent undiluted; avoids the anti-pattern of silently expanding an existing phase's surface.

Not a standalone milestone — too small. Not a Phase 2 sub-task — too load-bearing for correctness to be buried.