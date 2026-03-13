# Requirements: Auth & Access Audit

## v1 Requirements

### Authentication (AUTH)
- [ ] **AUTH-01**: Implement `proxy.ts` (Next.js 16) with `next-firebase-auth-edge` for robust server-side session management.
- [ ] **AUTH-02**: Synchronize client-side `onIdTokenChanged` with server-side cookies via a `/api/login` (or `/api/sync`) endpoint to eliminate "stale session" bugs.
- [ ] **AUTH-03**: Implement automatic token refreshing and cookie rotation to prevent session expiration during live services.
- [ ] **AUTH-04**: Add `router.refresh()` calls on login/logout to clear the Next.js Client Router Cache.
- [ ] **AUTH-05**: Handle Google OAuth popup blockers and redirects gracefully (especially on iOS Safari).

### RBAC & Visibility (RBAC)
- [ ] **RBAC-01**: Implement Firebase Custom Claims for stateless, high-performance role verification (`admin`, `band_leader`, `musician`, `member`).
- [ ] **RBAC-02**: Implement a server-side Data Access Layer (DAL) that uses React `cache()` to centralize role checks.
- [ ] **RBAC-03**: **Strict Editor Access**: Only users with `admin` or `band_leader` roles can see or access "Edit" views and setlist modification features.
- [ ] **RBAC-04**: **Monitor Access Logic**: Only users with the `sound_engineer` toggle OR a specifically assigned `monitorBusId` can see monitor controls.
- [ ] **RBAC-05**: Hide all privileged UI elements (buttons, links, menus) at the Server Component level to prevent "layout flash" of unauthorized features.
- [ ] **RBAC-06**: Protect all Server Actions and API Routes with the same RBAC logic (Defense-in-Depth).

### Public Access (PUBLIC)
- [ ] **PUBLIC-01**: Enable unauthenticated access to setlists and charts marked as "Public" by their creator.
- [ ] **PUBLIC-02**: Implement token-based links for specific setlists that bypass the login requirement for "Member" level access.
- [ ] **PUBLIC-03**: Ensure "Public" views are optimized for guest devices (phones/tablets) and hide all "Login/Sign In" prompts unless explicitly requested.

### Monitoring & Assignments (MON)
- [ ] **MON-01**: **Sound Engineer Role**: Implement a specific flag/role for Sound Engineers to manage monitor assignments.
- [ ] **MON-02**: **Assignment Interface**: Create/Harden the UI for Sound Engineers to map `user_uid` to `monitor_bus_id`.
- [ ] **MON-03**: **Personalized Faders**: Ensure a musician only sees the faders/channels they are assigned to (or have starred).

## v2 Requirements (Deferred)
- [ ] **AUTH-OFFLINE**: Full offline PWA support for auth states (complex/low priority given venue wifi).
- [ ] **RBAC-AUDIT-LOG**: Detailed logging of all permission-sensitive actions.
- [ ] **LINK-REVOKE**: UI for revoking specific public links or tokens.

## Out of Scope
- [ ] Redesigning the core transposition logic or PDF viewer (focus is strictly on access/visibility).
- [ ] Integrating with 3rd party scheduling platforms (Planning Center, etc.).

## Traceability (Roadmap Mapping)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| AUTH-* | Phase 1 | Pending |
| RBAC-* | Phase 2 | Pending |
| PUBLIC-* | Phase 3 | Pending |
| MON-* | Phase 2/3 | Pending |

---
*Last updated: 2026-03-13 after initialization*
