# Plan 06: Finish Server-Side Gating (Edge Cases)

**Phase:** 6 - Server-Side Gating (Edge Cases)
**Status:** Ready to execute

## Goal
Secure the `/manage` and `/monitor` routes at the server level using `getServerUser()`. This eliminates client-side UI flickering, unauthorized data fetching, and rogue WebSocket initializations.

## Requirements
- ✓ SEC-04: Apply `getServerUser` to `/monitor/page.tsx`. Prevent unauthorized WebSocket initialization.
- ✓ SEC-05: Apply `getServerUser` to `/manage/page.tsx`. Prevent client-side tab flashing for Admin vs. Band Leader views.

## Proposed Changes

### 1. `src/app/(main)/manage` (Server-Side Gating)
- **Task**: Separate the page into a Server Component and a Client Component.
- **Action**: Rename `src/app/(main)/manage/page.tsx` to `src/app/(main)/manage/ManageClient.tsx`.
- **Action**: Update `ManageClient.tsx` to accept a `serverIsAdmin` boolean prop. Remove the `isBandLeader` client-side redirect logic (it will be handled by the server).
- **Action**: Create a new `src/app/(main)/manage/page.tsx` (Server Component).
- **Action**: The Server Component calls `await getServerUser()`. If `!user || !user.isBandLeader`, it calls `redirect('/setlists')`. Otherwise, it renders `<ManageClient serverIsAdmin={user.isAdmin} />`.

### 2. `src/app/(main)/monitor` (Server-Side Gating)
- **Task**: Separate the monitor page into a Server Component and a Client Component.
- **Action**: Rename `src/app/(main)/monitor/page.tsx` to `src/app/(main)/monitor/MonitorClient.tsx`.
- **Action**: Create a new `src/app/(main)/monitor/page.tsx` (Server Component).
- **Action**: The Server Component calls `await getServerUser()`. If the user is missing, or does not have `isAdmin`, `isSoundEngineer`, or `isMember` (perhaps we also need to check Firestore for a specific bus assignment? We will check how `useMonitorAccess` works first. If `hasAccess` requires a Firestore fetch, we might do it on the server). Let's do a basic `getServerUser()` check and if they aren't at least a member/logged in, reject. Or better yet, we can check the `monitorBus` if it's on the user object. We will ensure the server rejects obvious non-engineers/non-musicians before sending the WebSocket code.

## Verification Criteria
- [ ] An Admin visiting `/manage` sees the "Audit" tab immediately (no flicker).
- [ ] A Musician visiting `/manage` is immediately redirected to `/setlists` (server-side, no JS loaded).
- [ ] A Guest visiting `/monitor` is redirected to `/login` or `/` immediately.
- [ ] The app compiles cleanly (`tsc --noEmit`).

---
*Plan: 06-PLAN*
*Phase: 06-server-side-gating-edge-cases*