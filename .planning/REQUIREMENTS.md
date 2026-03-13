## v1 Requirements

### Architecture & Tech Debt
- [ ] **ARCH-01**: Remove `src/components/views/PerformerView.tsx` and `FlowItemView.tsx`.
- [ ] **ARCH-02**: Delete the `/perform/[id]` route.
- [ ] **ARCH-03**: Remove global keyboard/footswitch event listeners tied to the legacy view.

### Authentication & Sessions
- [ ] **AUTH-01**: Integrate `next-firebase-auth-edge` to handle server-side cookie minting and token refresh automatically.
- [ ] **AUTH-02**: Replace all instances of `signInWithRedirect` with `signInWithPopup`.
- [ ] **AUTH-03**: Ensure the "Logout" action calls `/api/logout` (to clear cookie) and executes `window.location.reload()` to purge Next.js Router Cache.

### Routing & Public Boundary
- [ ] **SEC-01**: Remove `?public=true` bypass logic from `/setlists/[id]/page.tsx` (the editor).
- [ ] **SEC-02**: Update the "Share" functionality to link strictly to the `/perform/setlist/[id]` route.
- [ ] **SEC-03**: Verify `src/proxy.ts` correctly permits unauthenticated access to the performance route but blocks the editor.

### UI Permissions (Gating)
- [ ] **UI-01**: Update `DashboardClient.tsx` (or parent layout) to receive server-verified roles.
- [ ] **UI-02**: Update `SetlistDashboard.tsx` to conditionally render "Edit", "Duplicate", and "Delete" buttons server-side.
- [ ] **UI-03**: Ensure Monitor controls are only rendered on the server if the user is a Sound Engineer or has an assigned bus.

### API Security
- [ ] **API-01**: Audit all `export async function GET/POST` routes in `src/app/api`.
- [ ] **API-02**: Refactor insecure endpoints (e.g., `/api/drive/file`, `/api/chat`) to use `createApiHandler`.

---

## Traceability
- ARCH-01 -> Phase 1
- ARCH-02 -> Phase 1
- ARCH-03 -> Phase 1
- AUTH-01 -> Phase 2
- AUTH-02 -> Phase 2
- AUTH-03 -> Phase 2
- SEC-01 -> Phase 3
- SEC-02 -> Phase 3
- SEC-03 -> Phase 3
- UI-01 -> Phase 4
- UI-02 -> Phase 4
- UI-03 -> Phase 4
- API-01 -> Phase 5
- API-02 -> Phase 5