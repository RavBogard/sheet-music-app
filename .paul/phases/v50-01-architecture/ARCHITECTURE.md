# v5.0 Bulletproof Editor — Architecture & Design

**Status:** 🟡 Draft — pending sign-off
**Phase:** v50-01 — Architecture & design
**Author:** Claude (in collaboration with Rabbi Daniel)
**Date:** 2026-04-26

---

## Summary

This document locks the architectural decisions for the v5.0 setlist-editor rewrite. Subsequent phases (v50-02 dead-code amputation, v50-03 sync engine, v50-04 song catalog, v50-05 spreadsheet editor, v50-06 concurrent-edit safety, v50-07 migration & cutover) execute against the choices made here. **No application code lands in this phase.**

The high-level shape, ahead of the section-by-section rationale below:

| Concern | Choice |
|---|---|
| Local-first storage | **Dexie 4.x** + hand-rolled outbox table |
| Editor library | **TanStack Table v8 (headless)** + custom cell components |
| Cell-editor primitives | **Radix Popover** + **cmdk** (type-to-filter dropdown) |
| Drag-reorder | **@dnd-kit/core** 6.3.x with `SortableContext` |
| React glue | **TanStack Query** for mutation/optimistic-UI; data still flows from Dexie |
| Doc-in-IDB model | Normalized rows (one Dexie table per entity); LWW conflict resolution |
| Sync target | Firestore (unchanged); Admin SDK on server, Web SDK on client |
| Sticky-memory granularity | Per-song global (not per-leadMusician, not per-rabbi) |
| Migration approach | One-shot, in-place, idempotent script with dry-run mode |

---

## 1. Stack Decisions

### 1.1 Local-first library: **Dexie 4.x + hand-rolled outbox**

#### Comparison matrix

| Library | Bundle (gzip) | Sync model | iPad/Safari | Maintenance | License | Verdict |
|---|---|---|---|---|---|---|
| **Dexie.js 4.4.x** | ~31 KB | Pure BYO; idiomatic outbox via `hooks.creating/updating` inside transactions | Best-in-class; explicit Safari quirks doc + CI on Safari | v4.4.2 (Mar 2025); single maintainer; ~100k deployments | Apache-2.0 | ✅ **Chosen** |
| LiveStore 0.3.x | ~166 KB + 600 KB SQLite WASM | Owns sync; event-sourced (Git-shaped); hostile to Firestore-as-backend | Strong on Expo; weak web-iPad relative to peers | Pre-1.0 beta; documented breaking storage formats | Apache-2.0 | ❌ Rejected |
| RxDB 17.x | ~48 KB core + adapter (~70–90 KB realistic) | Owns replication protocol; BYO push/pull functions | Docs honestly recommend native SQLite for production iOS reliability | Healthy; Premium-funded | Apache-2.0 core; OPFS/Worker/encryption gated to Premium | ❌ Rejected |
| TanStack Query persister | ~4 KB + your IDB | Cache layer, not a database; default `maxAge: 24h` | Depends entirely on chosen IDB layer | Excellent | MIT | ❌ Rejected as primary store |

#### Rationale

- **BYO sync is non-negotiable.** Our backend is Firestore. We need an outbox we can inspect, replay, and dead-letter from a Tuesday-night console session — not an event-sourcing engine that owns the protocol. Dexie's `hooks.creating/updating/deleting` API lets the outbox row enqueue inside the same IDB transaction as the user's edit, which is exactly the integrity guarantee we want.
- **Smallest bundle by 2–5×.** v5.0 will run on cellular iPads in worship spaces with weak wifi; bundle bytes matter on cold loads.
- **Best-in-class iOS Safari story.** Dexie ships a [Safari quirks document](https://dexie.org/docs/IndexedDB-on-Safari) and runs CI against Safari every commit. Known WebKit issues (single-store transaction quirks, locking) have baked-in mitigations.
- **Zero licensing risk.** Apache-2.0 core, no telemetry, no per-request fees, no Premium upsell. Dexie Cloud exists as an opt-in commercial layer — we ignore it.
- **Mature.** ~100k production deployments, since 2014. Bus-factor-1 maintainer is the real risk; mitigated by Apache-2.0 license (we can fork) and the relatively small surface area (Dexie is ~30 KB — readable in a sitting if needed).

#### Rejected because

- **LiveStore** — Pre-1.0 beta with documented breaking storage-format changes. Owning sync as event-sourcing is hostile to Firestore-as-backend; we'd be fighting the framework. Revisit post-1.0 if we ever leave Firestore.
- **RxDB** — Capable but heavyweight for our actual needs (single-leader workflow, LWW conflicts). Premium upsell path (OPFS, encrypted-at-rest, IDB-direct adapter) creates a future tax. Reactive query layer + replication protocol are power we don't need.
- **TanStack Query persister** — Its own docs explicitly call it a *cache*, not a primary store. `maxAge` defaults to 24h with garbage collection on hydration. Disqualifying as a sole solution. (We *do* use TanStack Query separately as the React glue for mutations — that's a different concern.)

### 1.2 Editor library: **TanStack Table v8 (headless)** + hand-rolled cells

#### Comparison matrix

| Library | Bundle (gzip) | Cell-editor API | Drag/touch | Keyboard | Headless | License | LOC to ship | Verdict |
|---|---|---|---|---|---|---|---|---|
| **TanStack Table v8** + @dnd-kit + Radix + cmdk | ~30 KB | DIY in `cell` render; full control | DIY via @dnd-kit (with iPad gotchas documented) | DIY (~200 LOC) | Fully headless; Tailwind/shadcn native | MIT | ~1,200 | ✅ **Chosen** |
| AG Grid Community | 180–300 KB | First-class `ICellEditorReactComp` | Built-in managed drag; multi-row gated to Enterprise | Excellent free | `ag-*` DOM; shadcn aesthetic ~80% achievable | MIT (Enterprise $999/dev for rich-select, fill, multi-drag, copy/paste) | ~600 mostly config | ❌ Rejected |
| Pure hand-rolled (no row/column model) | ~22 KB | Pure React + Radix | Same as #1 | DIY | 100% custom DOM | MIT | ~1,450 + polish | ❌ Rejected |

#### Rationale

- **Headless gives us the shadcn/Tailwind aesthetic Rabbi Daniel needs without fighting a CSS-in-JS system.** AG Grid Community works but its `ag-*`-prefixed DOM and Theming API only get us ~80% of the way to the dark-indigo OKLCH visual the rest of the app uses. v50-05 will lean on shadcn primitives that compose without library-prefix conflicts.
- **TanStack Table v8 gives us row/column model, sorting, filtering, expansion hooks for free** — capabilities we'd want eventually (e.g., filter by Type=song, sort by section). Hand-rolling these later is a straightforward 50-LOC saving up front but a bigger refactor cost down the road. v8 is also the only option with React 19 / Next 16 compatibility today.
- **Cell editing is DIY anyway.** Our Key/Lead/Type dropdowns need type-to-filter (cmdk + Radix Popover). AG Grid Community doesn't ship a rich-select editor — that sits behind the $999/seat Enterprise tier. So with AG Grid we'd write the dropdown ourselves *plus* pay 180+ KB of bundle and ~80% Tailwind matching. Not worth it.
- **iPad drag-reorder works** with `@dnd-kit/core` 6.3.x using a dedicated drag-handle column, `activationConstraint: { delay: 150, tolerance: 5 }` on `TouchSensor`, and `touch-action: none` on the handle only. Documented gotchas (issues #791, #272) have known fixes.
- **Bundle math:** TanStack Table (~15 KB) + @dnd-kit/core+sortable+utilities (~11 KB) + Radix Popover (~6 KB) + cmdk (~5 KB) ≈ **~37 KB total** for the editor stack. AG Grid Community alone is 180–300 KB.

#### Rejected because

- **AG Grid Community** — Bundle 5–10× larger; aesthetic mismatch with the rest of the app; key features we want (rich-select cell editor, multi-row drag, fill handle, copy/paste) sit behind Enterprise paywall. Fastest to "working spreadsheet" but most expensive at the polish margin.
- **Pure hand-rolled (no library)** — Saves ~15 KB and ~50 LOC of column/row scaffolding. Net cost of the saving is forfeiting future leverage (sorting, filtering, virtualization integration when we cross 200 rows). Not worth the trade.

### 1.3 dnd-kit lineage note

We adopt `@dnd-kit/core` 6.3.x rather than the pre-1.0 `@dnd-kit/react`. The maintainer ([clarification discussion #1842](https://github.com/clauderic/dnd-kit/discussions/1842)) has explicitly directed new projects to either lineage. `core` is in maintenance mode but production-stable since 2024. We'll likely migrate to `@dnd-kit/react` 1.x in 2027 when it ships stable; that migration is contained to ~150 LOC of drag-reorder code (Phase v50-05).

### 1.4 Cell-editor primitives

- **Type-to-filter dropdowns (Key, Lead, Type):** [cmdk](https://cmdk.paco.me/) inside a [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover). cmdk handles fuzzy search + keyboard nav; Radix handles focus-trap, escape-to-close, and the popover positioning. Both are MIT, both are already shadcn-ecosystem-native.
- **Plain text/number cells:** native `<input>` with `onBlur` / `onKeyDown` for Tab/Enter/Esc handling.
- **Boolean / checkbox cells (none in v50-05 scope, but reserved):** Radix Checkbox.

### 1.5 Sources

- [Dexie.js GitHub](https://github.com/dexie/Dexie.js) | [Safari quirks doc](https://dexie.org/docs/IndexedDB-on-Safari)
- [LiveStore state-of-project](https://docs.livestore.dev/evaluation/state-of-the-project/) | [HN beta launch (June 2025)](https://news.ycombinator.com/item?id=44105412)
- [RxDB Premium](https://rxdb.info/premium/) | [RxDB mobile recommendations](https://rxdb.info/articles/mobile-database.html)
- [TanStack Table v9 RFC](https://github.com/TanStack/table/discussions/5834) | [editable-data example](https://tanstack.com/table/latest/docs/framework/react/examples/editable-data)
- [AG Grid Community vs Enterprise](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/) | [Touch docs](https://www.ag-grid.com/javascript-data-grid/touch/)
- [dnd-kit core/react clarification](https://github.com/clauderic/dnd-kit/discussions/1842) | [Sortable docs](https://docs.dndkit.com/presets/sortable)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Bundle comparison (Simple Table)](https://www.simple-table.com/blog/react-data-grid-bundle-size-comparison)

---

## 2. Doc-in-IDB Model

### 2.1 Decision: normalized rows + LWW per-document

- **Normalized rows** (one Dexie store per entity) over **single JSON blob** per setlist. Rationale: enables indexed queries (e.g., "songs with `normalizedTitle` matching X" for the type-to-filter library picker; "tracks where `setlistId == N` ordered by `order`"). A JSON blob would force every read to deserialize the whole setlist for any query, and would lose Dexie's transactional integrity guarantees.
- **Last-writer-wins** per document, not CRDT. Rationale: single-leader workflow (Rabbi Daniel + occasionally Randy). Concurrent-edit safety becomes "server rejects writes whose `expectedUpdatedAt` doesn't match current; UI surfaces banner; user picks." This is what the existing v4.5-01 instrumentation logs already show is sufficient. CRDT (Yjs/Automerge) would add ~50 KB and a cognitive tax for a problem we don't have.

### 2.2 IDB schema (Dexie store definitions)

```typescript
// src/lib/local/schema.ts (lands in Phase v50-03)
db.version(1).stores({
  setlists:  'id, updatedAt, ownerId, eventDate',
  tracks:    'id, setlistId, [setlistId+order], songId',
  songs:     'id, normalizedTitle',
  outbox:    '++localId, status, scheduledFor, [status+scheduledFor]',
  meta:      'key',
})
```

Field notes (full TypeScript types in v50-03):

- `id` is the Firestore document ID for setlists/songs/tracks. Rows created locally before sync get a client-generated UUID; the same UUID is used for the eventual Firestore doc (no patch-after-confirm dance).
- `tracks` carries a `[setlistId+order]` compound index for ordered fetch by setlist (the editor's hot path).
- `songs.normalizedTitle` is the lowercased + diacritic-stripped title; underpins the type-to-filter library picker. Kept in sync with `title` via a hook on write.
- `outbox` is local-only (++localId is auto-increment); never synced. Status is `pending | sending | failed`.
- `meta` is a misc k-v store: last successful sync timestamp, schema migration markers, draft-recovery flags.

### 2.3 Outbox row shape

```typescript
type OutboxRow = {
  localId?: number              // auto-incremented by Dexie
  status: 'pending' | 'sending' | 'failed'
  scheduledFor: number          // epoch ms; sync engine drains rows with scheduledFor <= now
  op: 'set' | 'update' | 'delete'
  collection: 'setlists' | 'tracks' | 'songs'
  docId: string                 // matches the local doc id
  payload: Record<string, unknown>   // partial update for 'update', full doc for 'set'
  expectedUpdatedAt?: number    // for LWW precondition on 'update'
  attempts: number              // for backoff
  lastError?: string            // for surfacing in the conflict UI
  createdAt: number
}
```

### 2.4 Synchronous-feel write API

Every editor mutation flows through one helper:

```typescript
// src/lib/local/write.ts (v50-03)
async function applyEdit(edit: EditDescriptor): Promise<void>
```

`applyEdit`:
1. Opens a Dexie transaction over the affected stores **plus `outbox`**.
2. Mutates the entity row.
3. Inserts a corresponding `outbox` row inside the same transaction.
4. Commits.

The user-perceived save is the transaction commit — sub-10ms. The sync to Firestore happens asynchronously in the sync engine. The UI reads from Dexie via `useLiveQuery`, so it sees the mutation immediately.

---

## 3. Sync Engine State Machine

### 3.1 States

| State | Meaning | User-visible label |
|---|---|---|
| `Idle` | No pending outbox rows; last sync successful | `Saved` (or `Saved 12s ago`) |
| `Dirty` | Outbox has rows in `pending` status; debounce timer running | `Editing…` |
| `Saving` | Outbox is draining; ≥1 row in `sending` status | `Saving…` |
| `Conflict` | Server rejected with version-mismatch on ≥1 row | `Conflict — review` (red, action button) |
| `Failed` | ≥1 outbox row exhausted retry budget | `Failed — retry` (red, action button) |
| `Offline` | Navigator says offline OR last N sync attempts failed with network error | `Offline — N queued` (amber) |

Multi-state edge case: if the outbox has both `failed` and `pending` rows, surface the failure (Failed state takes precedence over Dirty); user must resolve before further sync attempts.

### 3.2 Transitions

```
                  userEdits
                    │
                    ▼
   ┌─────────► [Dirty] ─── debounce 500ms ───► [Saving]
   │              ▲                                │
   │              │                                ├── all rows accepted ──► [Idle]
   │              │                                │
   │              │                                ├── server rejects ────► [Conflict]
   │              │                                │   (version mismatch)
   │              │                                │
   │              │                                ├── retry budget OK ────► [Saving] (after backoff)
   │              │                                │
   │              │                                └── retry exhausted ───► [Failed]
   │              │
   │   userResolves(merged)
   │              │
   └──────────────┘
```

Plus orthogonal: `networkOffline → Offline`; `networkOnline → re-enter previous state and drain`.

### 3.3 Retry policy

- Backoff schedule: `[500ms, 1s, 2s, 4s, 8s]` per row. Total ≈ 15.5s max latency before dead-letter.
- Max attempts: 5 per row.
- On auth error (401/403): one re-auth attempt via Firebase token refresh; if it fails, mark row `failed` immediately (no further retry — user action required).
- On version-mismatch (412/preconditioned): immediate transition to `Conflict`; no retry until user resolves.
- On network error: defer to `Offline`; resume when navigator reports online.
- Dead-letter rows stay in IDB indefinitely so the user can manually retry from the conflict UI; no auto-purge.

### 3.4 Cross-tab coordination

Two open tabs = two sync engines competing to drain the same outbox. Solution: a `BroadcastChannel('crc-sync')` channel publishes `lock-acquired` when one tab starts draining; other tabs back off. A simple lease (5s heartbeat) handles tab close. This replaces the existing `setlist:invalidate` channel; cleaner contract.

---

## 4. Song Catalog Schema & Sticky Memory

### 4.1 Decision: per-song global granularity

Per-(song, leadMusician) and per-(song, rabbi) granularities were considered and rejected:

- **Per-(song, leadMusician)**: leads change weekly; most (song, lead) pairs would have empty defaults; the leader still wants the key Rabbi typically calls. Wrong granularity.
- **Per-(song, rabbi)**: only matters in multi-rabbi congregations. CRC has Rabbi Daniel as primary. If different rabbi shows up, they'll override and the new value becomes the default. Acceptable to lose the previous rabbi's version.
- **Per-song global**: simplest. Matches the mental model the user articulated ("`key`, `lead`, `BPM` should move with the track everywhere it goes until it gets changed").

### 4.2 Schema

```typescript
type SongDoc = {
  // ...existing fields (id, title, fileId, etc.)
  defaults: {
    key?: string         // e.g., "Dm", "F#"
    lead?: string        // musician name (denormalized, matches existing pattern)
    bpm?: number
  }
  recent: Array<{
    key?: string
    lead?: string
    bpm?: number
    setlistId: string
    performedAt: Timestamp
  }>   // capped at 5 most recent, FIFO
}
```

`transposition` is intentionally NOT in `defaults` — it's per-musician (your trumpet vs. my piano), not per-song. Tracked separately in user prefs (existing `useMusicStore` pattern).

### 4.3 Propagation rules

| Trigger | Effect |
|---|---|
| **Track added to setlist** (via library picker, fuzzy match, or chat) | Pull `defaults.{key, lead, bpm}` ONCE into the new track row. No further re-pulls — track is independent after creation. |
| **Track field edited in editor** (key, lead, or bpm) | After Dexie commit, debounced (1s) write-back to `songs/{id}.defaults` AND append to `songs/{id}.recent` (FIFO cap 5). Both via the sync engine outbox. |
| **Track deleted from setlist** | No effect on song defaults. |
| **Track imported from gig packet / chat** | Same as "added" — pull defaults. |

### 4.4 Conflict on song defaults

If two open setlists both edit a song's key (different values), LWW: the second outbox commit to land on Firestore wins for `defaults.key`. Each setlist keeps its own per-track key regardless — the song's `defaults` is just the seed for the *next* time the song is added somewhere. This is acceptable: defaults are a productivity feature, not a hard constraint.

### 4.5 Firestore rules implications

Existing `songs/*` rules permit writes by users with band-leader role (mirrors `setlists/*`). The new `defaults` and `recent` fields inherit those permissions — no new rules needed. We'll add a `passthrough` Zod schema in v50-04 to permit additive fields without breaking existing readers.

### 4.6 Read-through pattern

The library picker and add-song flow read `songs/{id}.defaults` directly from Dexie (synced from Firestore). No Firestore round-trip on every cell render. This matters for the dropdown's perceived snappiness on the editor's hot path.

---

## 5. Migration Approach

### 5.1 Decision: one-shot, in-place, idempotent, with dry-run

The band is **not** currently in production on this app. The cutover window is the rewrite window — we don't need a parallel-collection or lazy-migration strategy designed for live users.

| Option | Verdict |
|---|---|
| (a) One-shot in-place mutation of `setlists/*` and `songs/*` | ✅ **Chosen** |
| (b) Parallel `setlistsV2/*` collection + atomic switchover | ❌ Adds storage cost + reconciliation cost for no benefit when downtime is allowed |
| (c) Dual-read / lazy migration on first edit | ❌ For live-user scenarios; not ours |

### 5.2 Migration script shape

```
sheet-music-app/scripts/migrate-v50.ts

Usage:
  npx tsx scripts/migrate-v50.ts --dry-run     # enumerate changes; no writes
  npx tsx scripts/migrate-v50.ts                # apply
  npx tsx scripts/migrate-v50.ts --rollback    # restore from snapshots
```

### 5.3 What it does (per-doc)

1. **Read `system/migrations/v50` doc** — confirm migration not already applied.
2. **Backfill song defaults from existing setlist data:**
   - Walk every `setlists/*` document, ordered by `eventDate || date` ascending.
   - For each track with a `songId` (or `fileId` resolvable to a song):
     - If track has `key`/`leadMusician`/`bpm` set, write to that song's `defaults.{key, lead, bpm}`. Most-recent-wins (later setlist overwrites earlier). Append to `songs/{id}.recent` (FIFO cap 5).
   - Tracks without a matching song doc are skipped (orphan readings/prayers don't seed catalog).
3. **No setlist mutations.** Existing `setlists/*` documents keep their shape verbatim — Phase v50-05 reads them as-is via the sync engine on first open.
4. **Write `system/migrations/v50` doc** with completion timestamp.

### 5.4 Idempotency

- Running the script twice converges to the same final state. A second run reads `system/migrations/v50` and exits early.
- For development re-runs, `--force` flag bypasses the marker.

### 5.5 Rollback

- Before any write, the script snapshots `defaults` and `recent` fields per affected `songs/*` doc into `migrations/v50/snapshot/{songId}` subcollection.
- `--rollback` walks snapshots, restores per-doc, and deletes the `system/migrations/v50` marker.
- Snapshots are deleted after a 30-day soak (manual cleanup script, separate concern).

### 5.6 Verification (script self-checks)

- **Pre-counts**: # of `songs/*` with non-empty `defaults` (should be 0 before).
- **Post-counts**: same query (should be > 0 after).
- **Setlist invariance**: hash of every `setlists/*` doc before and after must match (ensures no setlist mutation).
- **Sample assertion**: hand-pick 3 representative setlists; assert that the most-recent-occurring `key` for each of their tracks matches that song's `defaults.key` post-migration.
- **Amputated-data assertion**: confirm Firestore collections targeted in §7 (chat history, songGroups, liveState relics) are empty post-amputation; v50-07 migration script asserts and cleans any orphans that slipped through.

---

## 7. Amputation Scope (Phase v50-02)

Before any new code lands, two surfaces are deleted in their entirety. Dead surfaces don't survive a rewrite — they create maintenance gravity even when "we'll get to it later." Both surfaces are unused or actively counterproductive in the user's actual workflow; no replacement is built.

### 7.1 AI chat assistant (full deletion)

User has stated they don't know what it is or use it. Removing the surface entirely.

- **UI:** `src/components/setlist/ChatPanel.tsx` (~571 LOC), `src/lib/chat-store.ts`, any toolbar entry-points that open the chat panel
- **Server:** all `src/app/api/chat/*` route handlers (SSE streaming, completion, history, file search), `src/lib/chat-prompt.ts` (the v4.3 sanitization layer added for prompt-injection)
- **Tests:** all chat-tagged tests, including the 9 chat tests added in v4.3
- **Firestore:** any `chat/*` or `chatHistory/*` collections; security rules for those collections
- **Dependencies:** audit `package.json` — if any deps are exclusively for chat (e.g., a separate Genkit/SDK extension), remove. The Gemini OCR pipeline is *kept* (used by chord detection); only chat-specific deps go.
- **Verify post-amputation:** `grep -ri 'ChatPanel\|chat-store\|/api/chat\|chatHistory'` on `src/` returns zero hits; `next build` succeeds; full test suite green.

### 7.2 Live-swap UI surface (full deletion)

The replacement is "leader edits the setlist, the sync engine propagates the change to every device in real-time." Same model whether mid-week or mid-service. No special swap surface needed.

- **UI:** `src/components/performance/SwapPicker.tsx`, `SwapBottomSheet.tsx`, `SwapToast.tsx`, `SwapButton.tsx` (any that still exist post-v4.0 redesign), all swap-tagged tests
- **Routes:** `/live/[id]` receiver page deleted (it was the swap-broadcast endpoint)
- **Song groups system:** `config/songGroups` Firestore doc, `liturgicalSlot` field on Track, admin "Song Groups" tab UI, related types in `src/types/`. The hybrid grouping model from v3.0 P1 was infrastructure for swap suggestions — without swap, it's orphaned.
- **Permission system:** `canLiveSwap` field on user profile, custom-claim mirror, related auth-context plumbing. The `soundEngineer` permission stays (monitor-mix is unrelated).
- **Firestore rules:** the v3.0 `affectedKeys().hasOnly(['tracks', 'liveState', 'trackCount'])` carve-out for swap-only writes; the `isNotTooFrequent()` 2-second swap rate-limit; security rules referencing `canLiveSwap`. After amputation, only standard band-leader edit rules apply.
- **swapTrack() function:** in `src/lib/setlist-firebase.ts` — the transaction-protected swap helper. Once gone, that file shrinks meaningfully (anticipated removal as part of v50-03 sync engine work, but the function-callers go away in v50-02).
- **LeaderConsole:** check whether the v3.4-mounted `LeaderConsole` component has functions beyond live-swap entry. If so, split out the surviving pieces; otherwise delete.
- **Verify post-amputation:** `grep -ri 'SwapPicker\|SwapBottomSheet\|SwapToast\|liturgicalSlot\|canLiveSwap\|swapTrack\|/live/\['` on `src/` returns zero hits.

### 7.3 What is *not* amputated

- **Performance view** stays as-is (user said "good for now"). Same `/perform/setlist/[id]` route, same PDFOverlay, same transposition / monitor-mix / BPM / metronome toolbars. v5.0 doesn't redesign it.
- **Monitor-mix system** — separate concern, X32 audio integration, kept entirely.
- **AI chord detection (Gemini OCR)** — different feature, different surface, kept entirely.
- **Gig-packet print pipeline** — kept entirely.
- **Library** — kept entirely.

### 7.4 Order of operations within v50-02

1. Delete chat first (smaller, more contained, validates the amputation pattern)
2. Delete swap UI second
3. Delete song-groups + canLiveSwap third (depends on swap UI being gone — these are downstream)
4. Run full test suite + `next build` after each step; commit each cleanly so a problem can be bisected

The v50-02 plan (created when this phase signs off) will define exact files, exact deletion order, and verification commands.

---

## 6. Spreadsheet Editor UX

The new editor is **app-native but spreadsheet-shaped** — tabular rows, click-cell inline editing, type-to-filter dropdowns, tab/enter navigation, drag-to-reorder. All wireframes below are concrete enough that the v50-05 implementer should not need to re-decide interactions.

### 6.1 Design tokens (project-locked, applied here)

- **Theme:** dark-first OKLCH indigo (existing palette; no rework)
- **Type:** Righteous (display) / Poppins (UI body); 16px min on mobile; line-height 1.5
- **Touch targets:** ≥44 × 44px on every interactive element (iPad-first)
- **Focus ring:** 2px indigo-400 outline + 2px offset; visible on every focusable element including cells in selected state
- **Transitions:** 150–200ms for cell focus, dropdown open, sync-indicator state change; no scale-transform hovers (causes layout shift); use color/opacity only
- **Contrast:** WCAG AA minimum (4.5:1 body, 3:1 large/UI). Sync-state colors validated for both light and dark
- **Reduced motion:** all transitions wrapped with `@media (prefers-reduced-motion: reduce)` → instant
- **Icons:** Lucide (SVG), 20×20 cells / 24×24 toolbar — never emoji

### 6.2 Default desktop view

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ←  Friday Night Service  ·  Apr 30 2026          ✓ Saved · 12s ago    ⋮         │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ⋮⋮ │ Type    │ Title                       │ Key  │ BPM │ Lead     │ Notes  │ 📄│
├────┼─────────┼─────────────────────────────┼──────┼─────┼──────────┼────────┼──┤
│ ⋮⋮ │ song    │ Adon Olam                   │ Dm   │ 120 │ Rabbi D  │ Slow…  │📄│
│ ⋮⋮ │ song    │ Lecha Dodi                  │ G    │ 90  │ Randy    │        │📄│
│ ⋮⋮ │ ▼section│ — Closing —                 │      │     │          │        │  │
│ ⋮⋮ │ song    │ Aleinu                      │ F    │ 110 │ Rabbi D  │ Cue 1b │📄│
│ ⋮⋮ │ reading │ Mourner's Kaddish           │      │     │ Rabbi D  │        │  │
│ ⋮⋮ │ song    │ Yigdal                      │ Em   │ 100 │ Randy    │        │📄│
├────┼─────────┼─────────────────────────────┼──────┼─────┼──────────┼────────┼──┤
│ +  │ Add a song or section…                                                    │
└──────────────────────────────────────────────────────────────────────────────────┘

   ↑ Sticky header on vertical scroll. Header row uses muted bg + medium font weight.
   ⋮⋮ drag handle in column 1 (always visible, 44×44 touch zone).
   ▼ section row: chevron toggles collapse; em-dash framing inherited from existing app.
   📄 chart cell: filled when chart bound; outlined when missing (click → match modal).
   + add-row: focusable empty placeholder; clicking inserts a new row above and focuses Title.
```

**Cell anatomy** (per data cell): 44px min height; 8px horizontal padding; 1px hairline divider (`border-white/10` dark, `border-slate-200` light); selected state = 2px indigo-400 ring + faint indigo-500/10 fill; edit state = solid indigo-500 ring + cell content becomes a contained `<input>`. No row hover effect on the row itself (only cell-level focus); avoids twitch on touch.

### 6.3 Cell-edit interactions

| Trigger | Effect |
|---|---|
| Single click | Cell selected (focus ring); not in edit mode |
| Double click | Cell enters edit mode; cursor at end of value |
| Enter (on selected cell) | Cell enters edit mode; cursor at end |
| Type any printable char (on selected cell) | Cell enters edit mode; replaces value with typed char |
| Tab | Commit current edit; advance focus to next cell (right; wraps to next row's first cell) |
| Shift+Tab | Commit; previous cell |
| Enter (in edit mode) | Commit; advance focus down (next row, same column) |
| Shift+Enter | Commit; advance focus up |
| Esc | Discard edit; restore prior value; remain in selected (not edit) state |
| Click on different cell while editing | Commit prior edit, focus new cell |
| Click outside grid while editing | Commit; clear selection |

**Dropdown cells (Key / Lead / Type):**
- Cell shows current value with a tiny chevron-down icon on the right (only visible on selection or hover)
- Click or Enter or any printable char → opens combobox below the cell (Radix Popover + cmdk)
- Arrow keys navigate options; Enter selects; Esc closes without selecting; Tab commits and advances
- Type-to-filter: typing narrows options (cmdk fuzzy match)
- **Key dropdown** options: 12 chromatic majors + 12 minors (24 entries) sorted: Dm, D, F, G, A, Bb, C, E, Em, Am, Gm... (recent-used first if data permits)
- **Lead dropdown** options: musicians from the current setlist (top group), then library musicians, then a free-text "Add new lead…" tail option
- **Type dropdown** options: song / reading / prayer / transition / section header / note (icon prefix per type)

### 6.4 Row reorder (drag-and-drop)

**Desktop:**
- Drag handle is the leftmost column (⋮⋮ icon, 44×44px hit area)
- `cursor: grab` on hover, `cursor: grabbing` while dragging
- Drag preview: row clone at 80% opacity follows cursor
- Drop indicator: 2px solid indigo-400 line at insertion point between rows
- Live-rearrange (rows shift to make space) on drag-over, not on drop (preview the result)
- Drop commits the reorder; sync-indicator transitions to `Saving…`

**Touch (iPad/phone):**
- Long-press on the drag handle (`activationConstraint: { delay: 150ms, tolerance: 5px }`) initiates drag
- `touch-action: none` on the handle only — page scrolling stays alive on the rest of the row
- Same drag preview + drop indicator
- Auto-scroll when dragging near top/bottom 60px of viewport
- Visual + haptic confirmation on drop (where supported)

**Keyboard (accessibility):**
- Drag handle is focusable (`tabIndex=0`, `role="button"`, `aria-label="Drag to reorder track"`)
- Space or Enter on handle: enters keyboard-drag mode (announced via `aria-live`)
- Arrow Up / Down: moves row by one position
- Space / Enter: commits; Esc: cancels

### 6.5 Add-row / delete-row

**Add:**
- Empty placeholder row at bottom: `+ Add a song or section…` (full-width, 44px tall)
- Click → row converts to a real row at the bottom; Title cell auto-focuses in edit mode
- Type-to-filter Title dropdown shows: matching songs from the library (top, with chart 📄 indicator), recent imports, then free-text "Create new track called …"
- Tab / Enter commits Title and advances to Key (or any column the team picks as default)
- Continuous-add: pressing Enter on the *last* row's last cell creates a new row below and focuses Title (Sheets parity)

**Delete:**
- Desktop: row context menu (right-click on the drag handle column) → "Delete row" with confirmation only if the row has content
- Desktop: select row (click drag handle or `Cmd/Ctrl+click` cell) + Backspace → delete with confirmation
- Touch: swipe-left on the drag handle column reveals a destructive `Delete` action (>80px swipe required to commit; haptic snap)
- Confirmation modal only on rows with `title` set; empty rows delete instantly
- Undo: `Cmd/Ctrl+Z` restores deleted row in place (zustand `temporal` middleware; 50-step history)

### 6.6 Multi-select / batch edit

- Shift+Click row drag handle: extend selection to range
- Cmd/Ctrl+Click row drag handle: toggle individual rows
- When 2+ rows selected, a contextual action bar slides down from below the top bar:
  ```
  ┌──────────────────────────────────────────────────────────────┐
  │ 3 rows selected   [Change Type ▾]  [Set Lead ▾]  [Delete]   │
  └──────────────────────────────────────────────────────────────┘
  ```
- Esc clears selection

### 6.7 Touch / iPad variant

- Cell padding: 12px (vs. 8px desktop) so each cell hit area is comfortably > 44px
- No hover states (only focus); replaces the desktop hover-chevron on dropdowns with always-visible chevron on touch breakpoints
- Dropdowns open as **bottom sheets** on viewport widths <768px:
  ```
  ┌────────────────────────────────────────────┐
  │ ╴╴╴                                        │  ← drag-to-dismiss handle
  │ Pick key                                    │
  │ ┌──────────────────────────────────────┐   │
  │ │ 🔍 Type to filter...                  │   │
  │ └──────────────────────────────────────┘   │
  │  Dm  · last used                           │
  │  D                                          │
  │  Em                                         │
  │  F                                          │
  │  G                                          │
  │  ...                                        │
  └────────────────────────────────────────────┘
  ```
- Edit-mode cell shows a "Done" button in the bottom-right (commits and advances; replaces Tab gesture which is awkward on touch)

### 6.8 Sync indicator (top bar)

```
   ✓ Saved                        green dot,    "Saved" or "Saved 12s ago"
   ◌ Editing…                     muted dot,    transient (during debounce)
   ◑ Saving…                      indigo dot,   spinner
   ! Conflict — review            red dot,      action button → opens reconciliation modal
   ⊘ Failed — retry               red dot,      action button → retries outbox
   ⊙ Offline — 3 queued           amber dot,    static (no action; auto-resumes)
```

- All states use both **color** and **icon shape** (not color alone — accessibility rule).
- Hover/click on the indicator shows a tooltip with the request ID (from v4.4 AsyncLocalStorage instrumentation) for support ticket continuity.
- Live-region (`aria-live="polite"`) announces transitions (e.g., "Saved" or "Conflict, please review") for screen readers.
- Position: top bar, right of the setlist title, before the overflow menu. Stays visible during scroll.

### 6.9 "Remote changed" reconciliation banner

When the sync engine detects a server-rejected write (version mismatch from another tab/device), surface a **blocking modal** (not a banner — banners are too easily missed; the existing v4.x bug was caused by silent merges):

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Remote changes detected                                              ✕    │
├────────────────────────────────────────────────────────────────────────────┤
│  Another device edited this setlist while you were working.                 │
│  Review the differences below:                                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Track 3 — Aleinu                                                     │   │
│  │   Key                                                                 │   │
│  │     Your version:  F                                                  │   │
│  │     Their version: G                                                  │   │
│  │   ◯ Keep mine   ●  Take theirs                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ + Track 5 — Yigdal  (added by them)                                  │   │
│  │   ◯ Keep their addition   ●  Discard                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ────────────────────────────────────────────────────────────────────       │
│  [ Resolve all and save ]    [ Discard my edits ]    [ Cancel ]            │
└────────────────────────────────────────────────────────────────────────────┘
```

- Modal traps focus; Esc dismisses to the editor (does NOT auto-resolve — user must explicitly choose).
- Per-field radio choice means the user can keep some of their edits and accept others — granular, not all-or-nothing.
- Bottom: three actions
  - **Resolve all and save** — applies the chosen merge, drains outbox
  - **Discard my edits** — abandons all local changes; pulls server state (destructive; requires second-tap confirmation)
  - **Cancel** — closes modal; user keeps editing locally; outbox stays in `Conflict` state and the indicator continues to flag it
- ALL conflicts shown in one modal (not one-per-conflict — that creates fatigue)

### 6.10 Empty state (new setlist with zero rows)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ←  New Setlist                                                ✓ Saved      │
├────────────────────────────────────────────────────────────────────────────┤
│ ⋮⋮ │ Type    │ Title                  │ Key  │ BPM │ Lead    │ Notes │ 📄 │
├────┴─────────┴─────────────────────────┴──────┴─────┴─────────┴───────┴────┤
│                                                                              │
│                          Start with last week's                              │
│                       ┌─────────────────────────┐                           │
│                       │ ↻  Make next week's     │   primary CTA              │
│                       └─────────────────────────┘                           │
│                                                                              │
│                          Or build from scratch                               │
│                       ┌──────────────┐ ┌────────────────┐                  │
│                       │ + Add a song │ │ Use a template │                  │
│                       └──────────────┘ └────────────────┘                  │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

- "Make next week's" is the dominant CTA — it is the 90% workflow per user discussion (clone last week + tweak 2-3 songs)
- Clicking it: copies the most recent setlist's tracks into this new setlist, preserves keys/leads/notes, sets a sensible name like "Friday Night Service · {next-friday}"
- Sub-CTAs: "Add a song" (focuses the empty placeholder row above) and "Use a template" (existing template-picker modal)

### 6.11 Mobile-only flow (one-handed phone)

Phone (<640px) collapses to a stacked card layout — full grid would force horizontal scroll:

```
┌──────────────────────────────────────────────┐
│ ← Friday Night        ✓ Saved · 12s ago   ⋮  │
├──────────────────────────────────────────────┤
│ ⋮⋮  Adon Olam                                │
│     Dm · 120 BPM · Rabbi D                   │
│     Slow on v3                                │
├──────────────────────────────────────────────┤
│ ⋮⋮  Lecha Dodi                               │
│     G · 90 BPM · Randy                       │
├──────────────────────────────────────────────┤
│ ⋮⋮  ▼ Closing                                │
├──────────────────────────────────────────────┤
│ ⋮⋮  Aleinu                                   │
│     F · 110 BPM · Rabbi D                    │
│     Cue 1b                                    │
├──────────────────────────────────────────────┤
│ +   Add a song or section…                   │
└──────────────────────────────────────────────┘
```

- Tap card → opens a full-screen edit pane with Title, Key, BPM, Lead, Notes as form fields (still spreadsheet-y in shape, not a one-field-at-a-time wizard)
- Long-press drag handle reorders (same touch model as iPad)
- All other behaviors (dropdowns, drag, sync indicator) inherit from the iPad variant

### 6.12 Concessions called out

Things explicitly *not* matching desktop spreadsheet feel, by design:

- **No column resize on touch** — known iPad pain point; columns fluid by default
- **No fill-down handle** (Sheets-style drag-corner-to-fill) — out of v5.0 scope; deferred
- **No multi-cell range copy/paste** — out of scope; deferred. (Per-row copy/paste is in.)
- **No formulas** — never in scope (this is a setlist, not a spreadsheet)

### 6.13 Accessibility checklist (binding for v50-05)

- [ ] All cells reachable by Tab/Arrow keys (roving-tabindex implementation)
- [ ] All dropdowns operable by keyboard alone (cmdk + Radix gives this for free)
- [ ] Drag-reorder has keyboard equivalent (Space + Arrow + Enter)
- [ ] All icon-only buttons have `aria-label` (drag handle, chart icon, overflow menu, sync indicator)
- [ ] Sync state announced via `aria-live="polite"` region
- [ ] Reconciliation modal traps focus; Esc returns focus to editor
- [ ] Color contrast verified at AA minimum on every state (selected, edit, error, sync indicator)
- [ ] `prefers-reduced-motion` shorts all transitions to 0ms
- [ ] Focus rings visible on every focusable element

---

## Sign-Off

This document is **complete** and represents the locked architecture for v5.0.

**Decisions in this doc bind:**
- v50-02 implementer: amputation scope (§7) — what gets deleted and the order of operations
- v50-03 implementer: stack choices (Dexie, outbox shape) + sync state machine (§1, §2, §3)
- v50-04 implementer: song catalog schema + propagation rules (§4)
- v50-05 implementer: editor library + cell-editor primitives + every wireframe in §6
- v50-07 implementer: migration script shape + verification + amputated-data assertions (§5)

**Resume signal:** Type `approved` to lock decisions and unblock v50-02. Type `revise [section]: [what to change]` to request specific edits before sign-off.

---

*Drafted 2026-04-26 during phase v50-01-architecture.*

