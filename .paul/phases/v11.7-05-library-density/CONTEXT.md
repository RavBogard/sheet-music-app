# Phase v11.7-05 — F3 Library browse density/filters — CONTEXT

**Created:** 2026-06-22 (via /paul:discuss)
**Status:** Ready for /paul:plan
**Skill gate:** /ui-ux-pro-max BLOCKING (UI phase)

## Verify-first finding (drives the scope)

The in-app Library surface (`SongChartsLibrary.tsx`, `src/app/(main)/library/page.tsx`)
ALREADY has: search (name/key/topic, debounced), key + topic + **recency** filters
(`applyLibraryFilters` + `usageMap` + `LibraryFilters`), tabs (charts/supplemental/uploads/audio),
and stem-dedupe (`dedupeChartsByStem`, composer parenthetical preserved in the dedupe key).
So F3's "search ergonomics / recency filters" premise is **largely already built** — this
phase is about **row density + surfacing existing metadata as compact columns**, NOT new
filter machinery.

## Goals (Daniel, 2026-06-22)

1. **Denser, more informative library rows** across THREE surfaces (all selected):
   - **Chart-bind picker** — `ChartBindPopover` / `ChartBindDialog` (the surface Daniel DOES touch when binding charts to setlist rows).
   - **Band/consumer Library browse** — the signed-in band's `/library` view.
   - **In-app Library tab polish** — `SongChartsLibrary` (same `/library` component; the consumer browse and the "tab" are the same surface — confirm in plan).
2. **Surface composer + key + recency as compact TEXT columns/metadata** on the rows so a chart is identifiable at a glance.
3. **Faster find** — keep the dense Logic-Pro track-list feel; improve scannability.

## Hard constraint (Daniel — BINDING)

- **NO thumbnails. Text-only, max-density rows.** No chart first-page previews (not even hover/tap). Honors [[feedback_no_cover_art]] — composer/key/recency go in as compact text, never imagery. The ROADMAP's "thumbnails" word is OVERRIDDEN by this decision.

## Approach notes

- **/ui-ux-pro-max BLOCKING** before any UI task (per SPECIAL-FLOWS + [[feedback_ui_ux_skill]]).
- **Reuse existing infra:** `applyLibraryFilters`, `usageMap` (recency source), `searchQuery`/`setFilter`, `dedupeChartsByStem`. Do NOT rebuild filters.
- **Composer source — verify in plan:** the chart filename parenthetical (already preserved by `chartDedupeKey`) vs a `library_index` field. Plan must verify-first which is reliably populated before designing a composer column (recall the v11.5-05 F4 finding that BL charts are keyless — composer may be sparse too).
- **Recency source:** `usageMap` / `updatedAt` already feed the recency filter; reuse for a compact "last used / added" column.
- **CRC behavior:** this is a deliberate density change to a SHARED surface, applied equally to both tenants. "CRC byte-identical" can't literally hold for an intentional UI improvement — interpret as "no UNINTENDED CRC change / no regression," not "no visible change."
- **Likely 2 plans** (vertical slices): Plan 01 = `SongChartsLibrary` row density + composer/key/recency columns; Plan 02 = `ChartBindPopover`/`ChartBindDialog` density + same metadata. Confirm split at plan time.

## Open questions for planning

1. Is composer reliably available across the CRC pool (filename parenthetical vs library_index)? If sparse, show only when present (no empty column noise).
2. Are the consumer `/library` browse and the "in-app Library tab" the same `SongChartsLibrary` render (likely yes → one surface, not two)?
3. iPad density target — the band reads on 11" iPads; verify dense rows stay ≥44px touch targets where interactive (bind picker rows are tappable).

## Out of scope

- Thumbnails / any chart imagery (Daniel decision).
- New filter types beyond what exists (key/topic/recency already shipped).
- MCP authoring surface (Daniel authors via MCP; this phase is the browser library/picker UI).
- Photo-import (OFF roadmap).

---
*Handoff for /paul:plan. Persists across /clear.*
