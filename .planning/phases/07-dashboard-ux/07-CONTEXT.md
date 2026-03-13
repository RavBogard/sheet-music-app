# Phase 7: Dashboard UX Consolidation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses the UX friction on the Dashboard (`DashboardClient.tsx`) where unauthenticated (guest) users and pending users do not see the hero card for the upcoming service (`<NextServiceCard>`). The goal is to elevate the "Next Public Service" to the top of the dashboard for *all* user personas, ensuring immediate and frictionless access to live setlists. 

All UI changes must strictly adhere to the `ui-ux-pro-max` guidelines.

</domain>

<decisions>
## Implementation Decisions

### Layout Restructuring
- **Decision:** Break the `<NextServiceCard>` (and its skeleton loader) out of the `{user && isMember}` conditional wrapper in `DashboardClient.tsx`.
- **Decision:** The top section of the dashboard will universally display the Next Service (or skeleton if loading).
- **Decision:** Below the hero card, the UI will branch based on persona:
  - **Guests (!user):** Show QR Sign-In and Google Login.
  - **Pending (role === 'pending'):** Show the `<PendingAccountIllustration>` and instrument setup.
  - **Members (isMember):** Show the rest of the member dashboard (recent setlists, etc.).

### UI/UX Pro Max Compliance
- **Performance (Loading States):** The skeleton loader for the `<NextServiceCard>` must be retained to prevent content jumping (Priority 3: `content-jumping`).
- **Touch & Interaction:** Ensure the `<NextServiceCard>` has `cursor-pointer` and stable hover states (Priority 2: `hover-vs-tap`).
- **Accessibility & Contrast:** Verify that the "Live" and "Next" indicators on the card maintain sufficient contrast in both Light and Dark modes (Priority 1 & 7).

### Routing
- **Decision:** When any user (guest or authenticated) clicks the `<NextServiceCard>`, they should be routed to `/perform/setlist/[id]`. This route is already whitelisted in `proxy.ts` (Phase 3), so guests will flow directly into the setlist without a login wall.

</decisions>

<code_context>
## Existing Code Insights

### Targets for Modification
- `src/app/(main)/DashboardClient.tsx`: Needs layout restructuring.
- `src/components/home/NextServiceCard.tsx`: May need minor styling tweaks to ensure `ui-ux-pro-max` compliance (cursors, hover states).

### Dependencies
- The `tonightSetlist` and `mostRecentPastSetlist` logic relies on `setlistsReady`. For guests, we need to ensure the public setlists are fetched and ready so the card can render. Currently, `DashboardClient.tsx` fetches public setlists immediately via `useEffect`.

</code_context>

<specifics>
## Specific Ideas
- "pending users and unauthenticated users need to have immediate and easy access to public setlists... a big obvious immediate hero card"

</specifics>

<deferred>
## Deferred Ideas
- Pre-fetching PDF workers (Phase 8) will happen after this layout fix.

</deferred>

---

*Phase: 07-dashboard-ux*
*Context gathered: 2026-03-13*