# Phase 6: Finish Server-Side Gating (Edge Cases) - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase addresses the edge-case routes (`/manage` and `/monitor`) that currently rely on client-side React hydration (`useAuth()`) to determine access. This causes unauthorized users to download React components they can't use, experience UI flicker, and in the case of `/monitor`, initialize an unauthorized WebSocket connection before being kicked out. 

The goal is to apply the `getServerUser()` Server-Side Gating pattern (established in Phase 4) to these specific routes.

</domain>

<decisions>
## Implementation Decisions

### The `/monitor` Route
- **Decision:** Convert `src/app/(main)/monitor/page.tsx` into a Next.js Server Component.
- **Decision:** It will call `getServerUser()` and verify that the user has either `isAdmin`, `isSoundEngineer`, or a specific monitor bus assigned (we will need to verify how `hasAccess` is currently calculated on the server vs client).
- **Decision:** If they lack access, the Server Component will immediately `redirect('/')` or return a simple "Unauthorized" UI, completely preventing the client-side `useMonitorConnection` from mounting.
- **Decision:** The actual UI and WebSocket logic will be pushed down into a new `MonitorClient.tsx` Client Component.

### The `/manage` Route
- **Decision:** Convert `src/app/(main)/manage/page.tsx` into a Next.js Server Component.
- **Decision:** It will call `getServerUser()`. If the user is not at least a `isBandLeader`, it will immediately `redirect('/setlists')`.
- **Decision:** It will pass down `serverIsAdmin` to a new `ManageClient.tsx` component so the "Audit" tab renders instantly without flickering.

</decisions>

<code_context>
## Existing Code Insights

### `/manage`
- Currently entirely `"use client"`.
- Checks `!isBandLeader` and calls `router.replace('/setlists')`.
- Checks `isAdmin` to render the `TabsTrigger value="audit"`.

### `/monitor`
- Currently entirely `"use client"`.
- Uses `useMonitorAccess()` which relies on `user.uid` and checking the `user.monitorBus` claim.

</code_context>

---

*Phase: 06-server-side-gating-edge-cases*
*Context gathered: 2026-03-13*