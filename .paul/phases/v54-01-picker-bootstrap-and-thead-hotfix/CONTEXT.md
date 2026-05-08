# Phase Context: v54-01 — Picker Bootstrap + Thead Hotfix

**Milestone:** v5.4 (TBD — this phase is the inaugural one).
**Status:** Discussed 2026-05-08; ready for `/paul:plan`.
**Class:** Hotfix (regression from v50-05 cutover; blocks band onboarding — Daniel cannot add songs to setlists without falling back to Custom free-text).

## Problem (Daniel report, 2026-05-08)

> "When I create a new setlist and go to add a song, it doesn't work. It doesn't offer me any songs when I start typing in… I thought we changed lots of those things and that process? Then when I do add a song, it doesn't find it but adds the line, but formats it wrong."

Two distinct bugs surfaced in a single Daniel-loop UAT pass against v5.3 PENDING-UAT commits.

### Bug 1 — `+ Song` picker is empty (regression since v50-05)

`src/components/setlist/grid/AddRowPlaceholder.tsx:53-57` reads from Dexie's local `songs` table, hydrated by `primeSongsLibrary` (`src/lib/songs/prime.ts:31-39`) which one-shot `getDocs(collection('songs'))` on Firestore.

**Root cause:** Firestore `songs/*` was **never bootstrapped from `library_index`**. Production audit `.paul/phases/v50-07-migration-cutover/v50-07-01-DRY-RUN-REPORT.md:163` confirmed `songs/* = 0 docs` and `0 of 650 embedded tracks have a songId`. The deferred sub-phase v50-07-02b ("Bootstrap `songs/*` from unique track titles") was **dropped** in favor of Option C (lazy-hydrate tracks only). v53-02-01 added priming on top of an empty collection — `.paul/phases/v53-02-chart-binding-and-verification/v53-02-01-SUMMARY.md:212` explicitly flags: *"if it's still empty, picker opens with an empty Library section… that's a separate bug class."* This is that bug class, manifesting on `bc754b4` and `3a321c9`.

**Why the OLD editor worked:** pre-v50-05 the `+ Add Songs` modal (`src/components/setlist/modals/AddSongsModal.tsx`, still in tree, still used on `/library`) read `library_index` via `useLibrary()` → `/api/library/list?all=true`. Daniel's ~180-song library is fully populated there. The v50-05-02 deletion cut `SetlistEditorV2` and the modal mount, severing the editor → `library_index` link without restoring it elsewhere.

### Bug 2 — Header row visually overlaps first body row

Screenshot 2026-05-08 (Confirmation Shabbat / one Hinei track): column headers ("TYPE / TITLE / KEY / BPM / VOCAL LEAD / NOTES") render at roughly the same y as the first body row's cell content ("Song / Hinei / Pick key / BPM / Pick lead / Notes").

**Most likely cause:** v53-02-01's `overflow-x-auto` wrapper at `src/components/setlist/grid/SetlistGrid.tsx:1610` (added to support sticky-right ChartCell) made that div a CSS scroll container. Per spec, `position: sticky` on `<thead>` then pins relative to that wrapper's scrollport, NOT the viewport. As the page scrolls, body rows can visually slide under the still-pinned header.

**Contributing factors:**
- Topbar real height (~60 px = back button `h-11` + container `py-2`) ≠ `<thead>` `top-[3.25rem]` (52 px). `.paul/phases/v51-02-editor-readability/v51-02-01-DESIGN-CONTRACT.md:18` codified these MUST stay in lockstep ("break it and headers overlap content"). v52-03 grew SyncIndicator without updating offsets.
- Header bg `bg-background/95 backdrop-blur` — if `backdrop-filter` fails (browser quirk or ancestor with `transform`/`filter`), 95%-opaque header lets row text bleed visibly through.

## Goals (in priority order)

1. **Make the `+ Song` picker actually search Daniel's library.** When typing a substring of any song name in `library_index`, the picker shows hits within ~100ms of keypress. Acceptance: open new setlist, type "hin", see "Hinei B'Yad Hashem" (or whatever the real title is) as a Library suggestion.
2. **Fix the header/row overlap.** Column headers stay clearly above the first body row at all scroll positions on desktop and iPad. Sticky-right ChartCell from v53-02-01 must keep working.
3. **Don't regress sticky memory.** v50-04 `songs/{id}.defaults` + `recent[]` per-song memory (key, lead, bpm) keeps working for any song that already has a songId, and starts working for newly-bootstrapped songs as Daniel edits tracks bound to them.

## Approach (locked at discuss)

### Bug 1 — Picker bootstrap (deferred v50-07-02b, finally shipped)

**Direction:** One-shot admin script `scripts/bootstrap-songs.ts` modeled on `scripts/migrate-v50.ts` (same MigrationFirestore abstract interface, same `--dry-run` / `--apply` / `--rollback` flags, same marker-doc idempotency pattern at `system/v54SongsBootstrap`). Reads `library_index`, writes `songs/{id}` with `{ id, title, normalizedTitle, fileId }` for every active (non-archived) row. Run via `firebase deploy` workflow per memory rule (Firebase CLI = automatable, NOT a human-action checkpoint).

**Optional Stretch (in scope if cheap, otherwise deferred):** back-stitch `songId` onto existing setlist tracks where `track.fileId` matches the bridge map. ~351 / 650 tracks (54%) have `fileId` per v50-07-01 audit. Without this, sticky memory only works for songs Daniel binds going forward.

**Long-term shape (NOT this phase, captured for v5.4 phase 2):** Wire `library_index` → `songs/*` continuously so `/api/library/upload` and `/api/library/rename` keep `songs/*` in sync. This phase is the one-shot bootstrap; the listener/sync work is its own phase to keep blast radius small.

### Bug 2 — Thead repair (frontend — `/ui-ux-pro-max` BLOCKING per memory rule)

**Direction:** Drop the `overflow-x-auto` wrapper or replace it with a different sticky-right mechanism that doesn't establish a scroll container on `<thead>`'s ancestor chain. Two candidate paths to evaluate at /paul:plan time:
- (a) Move sticky-right to use `position: sticky` directly on the `<th>` / `<td>` with `right: 0` and let the page handle horizontal overflow naturally — works if the table is narrower than the viewport at all relevant breakpoints.
- (b) Re-anchor the table to `display: grid` so header and body cells are siblings of one scroll container, and a real CSS grid template handles column layout.

Re-align thead `top-[N]rem` with measured topbar height. Honor `v51-02-01-DESIGN-CONTRACT.md:18` lockstep — set both via a shared CSS custom property (`--editor-topbar-height`) so they can't drift again.

`/ui-ux-pro-max` consultation BEFORE plan-locks a candidate. Tablet-first verification (iPad scroll behavior) per project rule.

## Constraints

- **Spreadsheet bones stay** (v5.3 milestone-level constraint preserved into v5.4).
- **No Dexie schema bump** — write only into `songs/{id}` shape that already exists per v50-04.
- **No new snapshot listeners on `songs/*`** (cross-device freshness still deferred to a later v5.4 phase per Harness Fidelity Gate).
- **No engine path changes** (sync engine, lazy-hydration, perf-view, cells/, firestore.rules). Bootstrap script writes via firebase-admin direct, NOT through `applyEdit`.
- **Firestore rules for `songs/*` already allow create/update for `isBandLeader() || isAdmin()`** (`firestore.rules:128-131`) — no rules change needed; admin script bypasses rules anyway.
- **Daniel-loop UAT is the close gate** — both bugs verified on real iPad in production before phase closes.
- **Harness Fidelity Gate counter** — if Bug 2 changes any sync-engine-adjacent test seam, that's a waiver. Counter is at 1 of 3; landing at 2 is acceptable but 3 triggers re-prioritization.

## Open Questions for /paul:plan

1. **Bootstrap script id strategy:** use the `library_index` doc id (Drive `fileId`) directly as `songs/{id}`, or generate a fresh stable id and store `fileId` as a field? The former simplifies back-stitch (track.fileId === song.id); the latter matches v50-04's "songId distinct from fileId" intent. **Recommendation: use `library_index` id directly** — back-stitch becomes trivial, and v50-04's distinction was theoretical (the seam never shipped).
2. **Back-stitch in scope?** Cheap if (1) is decided as `fileId === songId`. Recommendation: include as an explicit AC, with a `--no-backstitch` flag for safety.
3. **Thead path (a) vs (b):** decide at `/ui-ux-pro-max` consultation, NOT here.
4. **Custom free-text behavior:** when Daniel types something not in the library and picks "Create new track called …", should that ALSO write a `songs/{id}` row so it shows up next time? Two reads:
   - (Yes — auto-promote): matches user mental model; risk is typo-pollution.
   - (No — keep free-text inline): matches existing v53-03-01 behavior; library stays curated.
   - **Recommendation:** keep current behavior (no auto-promote) for this phase; revisit if Daniel asks. Free-text is a real escape hatch and shouldn't have side-effects.
5. **Cross-device staleness:** out of scope — defer to v5.4 phase 2 per ROADMAP existing entry.

## References

- Old picker (still works on /library): `src/components/setlist/modals/AddSongsModal.tsx`, `src/hooks/use-library.ts:14-32`, `src/app/api/library/list/route.ts:39-55`.
- New picker: `src/components/setlist/grid/AddRowPlaceholder.tsx`, `src/components/setlist/grid/AddBar.tsx`.
- Priming: `src/lib/songs/prime.ts`, `src/components/setlist/grid/SetlistGridHydrator.tsx:250-255`.
- Sticky memory writeback: `src/lib/songs/defaults.ts:89-94` (only path that writes `songs/*` from the editor today).
- Migration precedent: `scripts/migrate-v50.ts` (shape + abstract Firestore interface + dry-run/rollback pattern).
- Production audit: `.paul/phases/v50-07-migration-cutover/v50-07-01-DRY-RUN-REPORT.md:24-30, 105-114, 151-153, 163, 189-207`.
- Foreseen failure mode: `.paul/phases/v53-02-chart-binding-and-verification/v53-02-01-SUMMARY.md:212`.
- Lockstep rule: `.paul/phases/v51-02-editor-readability/v51-02-01-DESIGN-CONTRACT.md:18`.
- Sticky-right ChartCell origin: commit `bc754b4` (v53-02-01).
- Polymorphic Add menu origin: commit `3a321c9` (v53-03-01).

## Synthesis confirmation

- Goals: (1) picker searches library (2) header doesn't overlap row (3) sticky memory keeps working — locked.
- Approach: bootstrap script + thead repair via `/ui-ux-pro-max`-vetted path — locked.
- Decisions deferred to /paul:plan: songId strategy, back-stitch in scope?, thead path (a vs b), free-text auto-promote (recommendation: no).

Ready for `/paul:plan`.
