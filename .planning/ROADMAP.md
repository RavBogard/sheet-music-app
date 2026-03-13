# Project Roadmap: Auth & Access Audit

The goal of this project is to harden the authentication and RBAC systems of CentralReform.live, ensuring bulletproof session management and strict feature visibility based on user roles.

## Phases

- [ ] **Phase 1: Foundation & Session Hardening** - Establish a robust, synchronized authentication system and fix "stale session" bugs.
- [ ] **Phase 2: Strict RBAC & UI Filtering** - Implement granular role-based access control and hide privileged UI elements at the server level.
- [ ] **Phase 3: Public Access & Frictionless Links** - Enable secure, unauthenticated access to public music resources for community members.

## Phase Details

### Phase 1: Foundation & Session Hardening
**Goal**: Establish a bulletproof authentication foundation that eliminates session desyncs and mobile login issues.
**Depends on**: Nothing
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User can log in with Google and remains authenticated across browser refreshes and app restarts.
  2. Logging out immediately clears the Next.js Client Router Cache, preventing unauthorized access via the back button.
  3. Session tokens automatically refresh in the background, preventing session expiration during long services.
  4. Google OAuth works on iOS Safari without being blocked by default popup/redirect settings.
**Plans**: TBD

### Phase 2: Strict RBAC & UI Filtering
**Goal**: Implement granular access control and hide unauthorized UI elements at the Server Component level.
**Depends on**: Phase 1
**Requirements**: RBAC-01, RBAC-02, RBAC-03, RBAC-04, RBAC-05, RBAC-06, MON-01, MON-02, MON-03
**Success Criteria** (what must be TRUE):
  1. Users with "Musician" or "Member" roles cannot see or access "Edit" features in the setlist view.
  2. Monitor mixing controls are only visible to users with a `monitorBusId` or `sound_engineer` role.
  3. Sound Engineers can access a dedicated interface to map users to X32 monitor buses.
  4. Musicians only see their assigned or starred channels in the monitor fader view.
  5. All privileged Server Actions reject unauthorized requests with a clear 403/Forbidden error.
**Plans**: TBD

### Phase 3: Public Access & Frictionless Links
**Goal**: Enable secure, unauthenticated access to public music resources for guests and community members.
**Depends on**: Phase 2
**Requirements**: PUBLIC-01, PUBLIC-02, PUBLIC-03
**Success Criteria** (what must be TRUE):
  1. Unauthenticated users can view setlists and charts marked as "Public" without being prompted to log in.
  2. Token-based "Public Access Links" grant instant "Member-level" viewing access to specific setlists.
  3. Public views are mobile-optimized and hide administrative UI (like "Sign In") to reduce friction.
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Session Hardening | 0/1 | Not started | - |
| 2. Strict RBAC & UI Filtering | 0/1 | Not started | - |
| 3. Public Access & Frictionless Links | 0/1 | Not started | - |
