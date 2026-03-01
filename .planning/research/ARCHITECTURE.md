# Architecture Research

**Domain:** Worship music performance app (outline & stability milestone)
**Researched:** 2026-03-01
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Presentation Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ SetlistEditor │  │ PerformView  │  │ PrintModal   │          │
│  │ (TrackSheet)  │  │ (outline)    │  │ (PDF trigger)│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                  │
├─────────┴─────────────────┴──────────────────┴──────────────────┤
│                     State & Hooks Layer                         │
│  ┌───────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │useMusicStore  │  │useSetlistLogic │  │queue-utils     │     │
│  │(Zustand)      │  │(edit+save)     │  │(toQueueItem)   │     │
│  └───────┬───────┘  └────────┬───────┘  └────────┬───────┘     │
│          │                   │                    │             │
├──────────┴───────────────────┴────────────────────┴─────────────┤
│                     Type & Validation Layer                     │
│  ┌────────────────┐  ┌────────────────┐                        │
│  │ types/models.ts│  │ types/schemas  │                        │
│  │ (SetlistTrack) │  │ (Zod + convert)│                        │
│  └────────┬───────┘  └────────┬───────┘                        │
│           │                   │                                 │
├───────────┴───────────────────┴─────────────────────────────────┤
│                     Data Access Layer                           │
│  ┌────────────────────┐  ┌──────────────────┐                  │
│  │ setlist-firebase.ts │  │ firebase-admin.ts│                  │
│  │ (client Firestore)  │  │ (server Admin)   │                  │
│  └────────────────────┘  └──────────────────┘                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                     Server / Job Layer                          │
│  ┌────────────────┐  ┌───────────────────┐                     │
│  │ API routes     │  │ Inngest jobs      │                     │
│  │ /api/setlist/* │  │ (PDF generation)  │                     │
│  └───────┬────────┘  └────────┬──────────┘                     │
│          │                    │                                 │
│  ┌───────┴────────────────────┴──────────┐                     │
│  │       print-pipeline.ts               │                     │
│  │  (cover page + per-track PDF merge)   │                     │
│  └───────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `SetlistTrack` (type) | Single source of truth for track data model | Everything — types/models.ts is the canonical definition |
| `setlistTrackSchema` (Zod) | Validates Firestore data at read boundary | setlistConverter, used by setlist-firebase.ts |
| `TrackSheet` | Track field editing UI (title, key, lead, notes, etc.) | useSetlistLogic via onUpdate callback |
| `useSetlistLogic` | Setlist edit operations (add, update, reorder, delete) | setlist-firebase.ts for persistence |
| `SetlistPerformPage` | Live performance list view, groups by section | useMusicStore (queue), queue-utils (toQueueItem) |
| `queue-utils` | Converts SetlistTrack[] to QueueItem[] for playback | useMusicStore (playbackQueue) |
| `QueueItem` (store type) | Flattened track data for performance mode rendering | useMusicStore, PerformerView |
| `PrintTrack` (pipeline type) | Track data shaped for PDF generation | print-pipeline.ts, API route |
| `print-pipeline.ts` | Cover page outline + per-track PDF merge + transposition | Inngest job, Firebase Storage, firebase-admin |
| `buildCoverPage()` | Renders the outline table on the PDF cover page | print-pipeline.ts (internal function) |
| `FlowRow` | Editor display for non-song items (reading, prayer, etc.) | SetlistEditorV2 |

### Key Boundary Observation

The `tune` field does not exist anywhere today. Adding it touches every layer:

1. **Type definition** — `SetlistTrack` in `types/models.ts`
2. **Validation schema** — `setlistTrackSchema` in `types/schemas.ts`
3. **Editor UI** — `TrackSheet` component (new input field)
4. **Performance view** — `SetlistPerformPage` (display the tune name)
5. **Queue bridge** — `QueueItem` in `store.ts` + `toQueueItem()` in `queue-utils.ts`
6. **Print pipeline** — `PrintTrack` type + `buildCoverPage()` column layout
7. **API routes** — `PrintRequest` passed through `/api/setlist/print/`

## Data Flow

### 1. Tune Field: Edit to Display to Print

```
[TrackSheet UI]
    │ user types "Klepper" into tune input
    │ onBlur → commitChanges()
    ↓
[useSetlistLogic.updateTrack()]
    │ merges { tune: "Klepper" } into track
    ↓
[setlist-firebase.ts → updateDoc()]
    │ writes to Firestore setlists/{id}
    ↓
[Firestore onSnapshot]
    │ real-time sync fires
    ↓
[SetlistPerformPage] ←── reads tracks from Firestore doc
    │ maps tracks via toQueueItem()
    │ renders tune name in track row
    ↓
[PrintModal → /api/setlist/print]
    │ sends PrintRequest with tune field per track
    ↓
[print-pipeline.ts → buildCoverPage()]
    │ renders "Tune" column in outline table
    ↓
[PDF output with tune column]
```

### 2. Outline-First Performance View

The current `SetlistPerformPage` already groups tracks by section headers and shows key + lead badges. The architectural change is about **emphasis**, not structure:

```
[Current flow]
Track tap → setQueue() → router.push(/perform/{fileId}) → chart view

[Proposed flow — outline-first]
Track row shows: TUNE NAME prominently, key badge, lead badge
Track tap → expanded detail (tune, notes, reference link)
  └── "Open Chart" button → only then navigate to /perform/{fileId}
```

This is a **UI-layer-only** change within `SetlistPerformPage`. No new data flows, no new API calls. The queue mechanism stays the same; we just add an intermediate expand/collapse state before navigating to the chart.

### 3. Print Pipeline: Adding Tune Column

```
[buildCoverPage()] currently renders:
  # | Song | Lead | Key | [Trans Key] | Notes

[After tune field]:
  # | Song | Tune | Lead | Key | [Trans Key] | Notes

Column positions (colTune inserted) need recalculation.
PrintTrack interface gains: tune?: string
```

The `buildCoverPage()` function in `print-pipeline.ts` is a single 130-line function that draws directly with pdf-lib. Adding a column requires adjusting the `col*` position constants and adding a `drawText` call for the tune value. The existing pattern for handling column layout is explicit pixel positions, so adding a column means shifting the downstream columns left or right.

### 4. Type Safety Fix Scope

```
38 `as any` across 22 files (verified via grep)
 7 `.catch(() => {})` across 4 files (verified via grep)
```

The `as any` instances cluster in:
- Admin components (LiveServiceSection: 6 instances)
- Task management pages (4 instances)
- Scheduling API routes (multiple instances)
- Firestore sync hooks (type narrowing gaps)

These are independent of the tune/outline features and can be addressed in parallel without blocking feature work.

## Architectural Patterns

### Pattern 1: Canonical Type → Zod Schema → Converter

**What:** Every Firestore document type has three layers: a TypeScript interface in `types/models.ts`, a Zod schema in `types/schemas.ts`, and a Firestore converter built from `createZodConverter()`.

**When to use:** Always when adding or modifying a Firestore field. The tune field must appear in all three.

**Why this matters for build order:** If you add `tune` to the interface but forget the schema, existing Firestore documents without the field will still parse correctly (Zod uses `.catch()` on every optional field). But the converter won't surface the field unless it's in the schema.

```typescript
// types/models.ts
export interface SetlistTrack {
    // ... existing fields ...
    tune?: string  // e.g. "Klepper", "Friedman", "Moshav"
}

// types/schemas.ts — inside setlistTrackSchema
tune: z.string().nullish().catch(undefined).transform(v => v || undefined),

// No converter change needed — setlistConverter uses setlistSchema
// which includes setlistTrackSchema via z.array(setlistTrackSchema)
```

### Pattern 2: Parallel Type Hierarchies (SetlistTrack / QueueItem / PrintTrack)

**What:** Track data exists in three shapes depending on context. `SetlistTrack` is the Firestore shape. `QueueItem` is the performance playback shape. `PrintTrack` is the PDF generation shape. Each drops some fields and maps others.

**When to use:** Any new field on `SetlistTrack` that should appear in performance or print must be explicitly mapped in `toQueueItem()` and/or in the print route's request builder.

**Trade-offs:** This explicit mapping is intentional — it prevents Firestore schema leaking into the performance hot path. But it means three places to update for every new field.

```
SetlistTrack.tune → QueueItem.tune  (via toQueueItem in queue-utils.ts)
SetlistTrack.tune → PrintTrack.tune (via print request builder in PrintModal)
```

### Pattern 3: Cover Page as Inline PDF Drawing

**What:** The print outline (cover page) is rendered by `buildCoverPage()` using raw pdf-lib `drawText()` calls with absolute pixel positions. There is no template or layout engine.

**When to use:** For any change to the printed outline format (adding tune column, changing layout).

**Trade-offs:** Direct drawing gives total control but is fragile. Every column addition requires recalculating all downstream `col*` constants. Long tune names need truncation logic (already established pattern: `maxTitleLen`, substring + "...").

## Recommended Build Order

### Phase 1: Data Model (tune field) — Foundation

**Build first because:** Every other feature depends on the tune field existing in the type system. Zero UI risk, zero user disruption, backward compatible.

1. Add `tune?: string` to `SetlistTrack` in `types/models.ts`
2. Add `tune` field to `setlistTrackSchema` in `types/schemas.ts`
3. Add `tune?: string` to `QueueItem` in `lib/store.ts`
4. Map `tune` in `toQueueItem()` in `lib/queue-utils.ts`
5. Add `tune?: string` to `PrintTrack` in `lib/print-pipeline.ts`

**Estimated scope:** 5 files, ~10 lines of changes. No migration needed — Zod schemas use `.catch(undefined)` for optional fields, so existing documents without `tune` parse cleanly.

### Phase 2: Editor UI (tune input) — Data entry

**Build second because:** Musicians need to enter tune data before it can be displayed anywhere.

1. Add tune input to `TrackSheet` component (song type only, between title and key)
2. Include `tune` in `commitChanges()` data payload
3. Display tune in `FlowRow` / `SongRow` subtitle area in editor view

**Estimated scope:** 1-2 files, ~30 lines. Follows exact same pattern as existing `leadMusician` field.

### Phase 3: Performance View (outline-first display) — Core UX change

**Build third because:** This is the primary user-facing feature. Requires tune data to exist and be populated.

1. Redesign `SetlistPerformPage` track rows to show tune prominently
2. Add expand/collapse per-track to show detail without navigating
3. Chart navigation becomes secondary (via explicit "Open Chart" tap)
4. Keep existing queue/navigation mechanism unchanged

**Estimated scope:** 1 file (`SetlistPerformPage`), ~100 lines refactored. Architecture boundary: changes stay within the single page component.

### Phase 4: Print Pipeline (tune column) — Output refinement

**Build fourth because:** Depends on tune field existing in the data model. Can be done in parallel with Phase 3.

1. Add tune column to `buildCoverPage()` in `print-pipeline.ts`
2. Recalculate `col*` position constants to accommodate new column
3. Add tune truncation logic (consistent with existing title/lead truncation)
4. Update content hash to include tune field (cache invalidation)

**Estimated scope:** 1 file (`print-pipeline.ts`), ~40 lines. Self-contained within the pipeline.

### Phase 5: Type Safety + Error Handling — Technical debt

**Build last (or interleave) because:** Independent of feature work. Each fix is isolated.

1. Replace `as any` assertions with proper types (~38 instances across 22 files)
2. Replace silent `.catch(() => {})` with proper error handling (~7 instances)
3. Add Firebase Admin credential validation
4. Fix N+1 chord extraction (already partially addressed by print-pipeline caching)

**Estimated scope:** 22+ files. Each fix is independent — can be interleaved one file at a time between feature phases.

## Migration Strategy for Tune Field

**No migration needed.** The architecture already handles missing optional fields gracefully:

1. **Zod schema** uses `.nullish().catch(undefined)` — existing documents without `tune` will parse as `undefined` (not error)
2. **Firestore converter** (`createZodConverter`) applies schema validation at read time — old documents are safe
3. **UI components** already check for optional fields with `{track.tune && ...}` pattern (same as `leadMusician`, `performer`, etc.)
4. **Print pipeline** handles missing fields with fallback: `track.tune || ""` — same pattern as existing `track.leadMusician || ""`
5. **QueueItem mapping** in `toQueueItem()` simply passes through: `tune: track.tune` — undefined propagates cleanly

**Forward compatibility:** New documents saved with `tune` will include it in Firestore. Old documents remain untouched. Next time they're edited, the tune field will be written if the user fills it in.

**Content hash impact:** The `computeContentHash()` function in print-pipeline.ts does not include `tune` today. Once added to `PrintTrack`, the hash function should include it to ensure cached PDFs regenerate when tunes change.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding Tune to Every Component Independently

**What people do:** Copy the tune field into each component's local state independently, building parallel update logic.
**Why it's wrong:** Creates drift between components. TrackSheet, FlowRow, SongRow, PerformPage would each have their own tune state.
**Do this instead:** Add tune to the canonical `SetlistTrack` type. All components read from the same Firestore document. The existing real-time sync (onSnapshot) propagates changes automatically.

### Anti-Pattern 2: Changing Performance Navigation Architecture

**What people do:** Rebuild the performance queue system to support outline-first mode.
**Why it's wrong:** The queue system (`useMusicStore.playbackQueue`) works correctly. The outline-first change is a UI presentation concern, not a navigation architecture change.
**Do this instead:** Add expand/collapse state within `SetlistPerformPage`. When a track is tapped, show detail inline. Add a secondary "Open Chart" button for actual navigation. The queue mechanism stays unchanged.

### Anti-Pattern 3: Broad TypeScript Fixes Before Feature Work

**What people do:** Try to fix all 38 `as any` instances before starting feature development.
**Why it's wrong:** Type fixes in scheduling routes, admin components, and task pages are completely unrelated to the outline features. Doing them first delays the time-sensitive Bat Mitzvah features.
**Do this instead:** Fix type issues in files you're already touching for features (e.g., `SetlistPerformPage`). Address remaining type debt after features ship.

## Integration Points

### External Services

| Service | Integration Pattern | Impact of Changes |
|---------|---------------------|-------------------|
| Firestore | Real-time onSnapshot listeners | Tune field auto-syncs to all connected clients |
| Firebase Storage | PDF result cache (keyed by content hash) | Content hash must include tune to invalidate cached PDFs |
| Inngest | Background PDF generation job | PrintRequest type change flows through automatically |
| Google Drive | File fetch for PDF pages | No impact — tune is metadata, not file content |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| types/models.ts to types/schemas.ts | Schema mirrors interface | Must stay in sync — add tune to both |
| SetlistTrack to QueueItem | Mapped by toQueueItem() | Explicit field mapping required |
| SetlistTrack to PrintTrack | Mapped by PrintModal request builder | Explicit field mapping required |
| TrackSheet to useSetlistLogic | onUpdate(id, Partial<SetlistTrack>) | Tune included in partial update automatically |
| SetlistPerformPage to useMusicStore | setQueue(queue, index, returnPath) | QueueItem must carry tune for display |

## Sources

- Direct codebase analysis (HIGH confidence — all findings verified against source files)
- `src/types/models.ts` — canonical type definitions
- `src/types/schemas.ts` — Zod validation layer
- `src/lib/print-pipeline.ts` — PDF generation with cover page
- `src/app/perform/setlist/[id]/page.tsx` — live performance view
- `src/components/setlist/v2/TrackSheet.tsx` — track editing UI
- `src/lib/queue-utils.ts` — SetlistTrack to QueueItem conversion
- `src/lib/store.ts` — Zustand state with QueueItem type

---
*Architecture research for: CentralReform.Live outline & stability milestone*
*Researched: 2026-03-01*
