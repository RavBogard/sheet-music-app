# Phase 1: Consolidate Performance Engines - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase strictly focuses on removing technical debt by deleting the legacy "footswitch" performance engine. It involves deleting unused components (`PerformerView.tsx`, `FlowItemView.tsx`), their dedicated route (`/perform/[id]`), and any global keyboard event listeners associated with them. The goal is to leave `/perform/setlist/[id]` as the single, unified performance view.

</domain>

<decisions>
## Implementation Decisions

### Scope of Deletion
- **Decision:** Delete `src/components/views/PerformerView.tsx` completely.
- **Decision:** Delete `src/components/performance/FlowItemView.tsx` completely.
- **Decision:** Delete the `src/app/perform/[id]` route folder completely.

### Event Listener Cleanup
- **Decision:** Scan the remaining codebase (specifically `SetlistDrawerLegacy` or `PDFOverlay` if applicable) for any lingering `keydown` event listeners that were bound to `ArrowRight`, `PageDown`, etc., for the footswitch logic, and remove them if they are no longer needed.

### Redirects (Optional but Recommended)
- **Claude's Discretion:** If we delete `/perform/[id]`, should we add a redirect in `next.config.ts` or `src/proxy.ts` to push any old bookmarked links to the new `/perform/setlist/[id]` route, or simply let them 404? (Recommendation: Let them 404 since this is a protected internal app, but Claude can implement a regex redirect if it's safer).

</decisions>

<code_context>
## Existing Code Insights

### Targets for Deletion
- `src/components/views/PerformerView.tsx`
- `src/components/performance/FlowItemView.tsx`
- `src/app/perform/[id]/page.tsx`
- `src/app/perform/[id]/layout.tsx` (if it exists)

### Dependencies to Check
- Ensure no other components are importing `PerformerView` or `FlowItemView`.
- Check if `useMusicStore` (Zustand) has state slices specifically dedicated to the legacy view (e.g., `currentVisiblePage`, `syncedBroadcasterId`) that can also be cleaned up.

</code_context>

<specifics>
## Specific Ideas
- The user specifically requested to "get rid of the footswitch option" as "no one will ever use that."

</specifics>

<deferred>
## Deferred Ideas
- Routing public "Share" links to the new view is handled in Phase 3.
- Securing the API is handled in Phase 5.

</deferred>

---

*Phase: 01-consolidate-performance-engines*
*Context gathered: 2026-03-13*