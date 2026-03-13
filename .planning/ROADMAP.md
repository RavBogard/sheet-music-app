# Project Roadmap: Bulletproof Auth & Architecture

The goal of this project is to fix authentication instability, streamline public access, eliminate UI leaks, and remove legacy rendering engines.

## Phases

- [ ] **Phase 1: Consolidate Performance Engines** - Delete the footswitch logic and the legacy rendering engine. Unify the app onto the V2 setlist view.
- [ ] **Phase 2: Session Hardening & Hard Logout** - Fix the iOS Safari login loops and "stale session" bugs using `next-firebase-auth-edge`.
- [ ] **Phase 3: The Public Routing Boundary** - Ensure all public sharing links go directly to the newly unified, read-only performance view, bypassing the Next.js middleware traps.
- [ ] **Phase 4: Server-Side UI Gating** - Guarantee that buttons like "Edit" and "Monitor" are never sent to unauthorized users.
- [ ] **Phase 5: API Endpoint Standardization** - Refactor all raw Next.js API endpoints to use the secure `createApiHandler` wrapper.

## Phase Details

### Phase 1: Consolidate Performance Engines
**Goal**: Eliminate the technical debt of the legacy "footswitch" rendering engine.
**Depends on**: Nothing
**Requirements**: ARCH-01, ARCH-02, ARCH-03
**Success Criteria**:
  1. The `src/components/views/PerformerView.tsx` and `FlowItemView.tsx` files are deleted.
  2. The `src/app/perform/[id]` route is deleted.
  3. The app successfully compiles and runs without these legacy components.
**Plans**: TBD

### Phase 2: Session Hardening & Hard Logout
**Goal**: Establish a bulletproof authentication foundation that eliminates session desyncs and mobile login issues.
**Depends on**: Nothing
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria**:
  1. `next-firebase-auth-edge` manages the `__session` cookie reliably.
  2. Mobile login uses `signInWithPopup` exclusively.
  3. Logging out clears the server cookie and performs a hard `window.location.reload()`.
**Plans**: TBD

### Phase 3: The Public Routing Boundary
**Goal**: Guarantee frictionless access for unauthenticated users viewing public setlists.
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria**:
  1. The `/setlists/[id]` editor route strictly rejects unauthenticated users.
  2. "Share" buttons generate links to `/perform/setlist/[id]`.
  3. `proxy.ts` correctly routes unauthenticated users to the performance view without a login prompt.
**Plans**: TBD

### Phase 4: Server-Side UI Gating
**Goal**: Prevent UI flicker and permission leaks by gating UI on the server.
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria**:
  1. Unauthorized users do not receive HTML for "Edit", "Duplicate", or "Delete" buttons in the dashboard.
  2. Monitor controls are strictly gated server-side based on the user's role and bus assignment.
**Plans**: TBD

### Phase 5: API Endpoint Standardization
**Goal**: Secure all backend data requests.
**Depends on**: Phase 2
**Requirements**: API-01, API-02
**Success Criteria**:
  1. All critical `/api/*` endpoints use `createApiHandler`.
  2. Endpoints properly validate the server-side `__session` cookie before execution.
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Consolidate Performance Engines | 0/1 | Not started | - |
| 2. Session Hardening & Hard Logout | 0/1 | Not started | - |
| 3. The Public Routing Boundary | 0/1 | Not started | - |
| 4. Server-Side UI Gating | 0/1 | Not started | - |
| 5. API Endpoint Standardization | 0/1 | Not started | - |