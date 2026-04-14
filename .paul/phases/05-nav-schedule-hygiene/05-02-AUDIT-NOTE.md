# 05-02 Audit Note — SetlistDrawer + monitor-live/commands/pending

**Date:** 2026-04-14
**Context:** Phase 5 ROADMAP listed two conditional removals — "Remove SetlistDrawer if dead" and "Trace and remove monitor-live/commands/pending if dead". Both investigated; both confirmed live. Keeping.

---

## SetlistDrawer

**File:** `src/components/performance/SetlistDrawer.tsx`
**Rendered at:**
- `src/components/performance/PerformanceToolbar.tsx:224` — tablet/desktop toolbar ("Far Right: Setlist Drawer")
- `src/components/performance/PerformanceToolbar.tsx:242` — mobile toolbar

**Role:** In-perform-view setlist overview + song-jump affordance. Musicians use it to navigate between charts without leaving perform mode.

**Decision:** LIVE. No change.

**Confusion source:** Phase 4 handoff noted P4-06 added inline Move-Up/Move-Down buttons to setlist editor rows — unrelated to this drawer. The editor-side reorder work did not replace any perform-view functionality.

---

## monitor-live/commands/pending

**Writer:** `src/lib/firestore-monitor-client.ts:289` — `addDoc(collection(db, "monitor-live", "commands", "pending"), …)` inside `sendMonitorCommand`.

**Reader/deleter:** Bridge service (see architectural JSDoc at `firestore-monitor-client.ts:8–9`):

> State flow:  Bridge writes → monitor-live/state → iPad reads (onSnapshot)
> Command flow: iPad writes → monitor-live/commands/pending → Bridge reads & deletes

**Role:** Command channel for the iPad→Bridge monitor-control path. Every mix adjustment from the iPad app flows through here.

**Decision:** LIVE. No change.

**Confusion source:** ROADMAP language was written during scope discovery; grep surfaced the path in `bridge/src/firestore-transport.ts` and planning docs, which triggered the "is this dead?" question. The production code path is active and under test in `src/lib/__tests__/bridge-latency.util.ts`.

---

## Phase 5 ROADMAP status after this audit

- ✓ Add Schedule tab to mobile bottom bar — shipped (05-01)
- ✓ Strip blockout/availability UI from Schedule — already absent / JSDoc fixed (05-01)
- ✓ Delete dead `musician_availability` composite index — shipped (05-01)
- ✓ Delete `/settings/users` and `/settings/sound` orphan routes — shipped (05-02)
- — Remove SetlistDrawer if dead — **no-op: confirmed live**
- — Trace/remove monitor-live/commands/pending if dead — **no-op: confirmed live**
- Preserve RSVP, scheduling_assignments, MusicianPicker, publish-and-notify emails — preserved (untouched)
