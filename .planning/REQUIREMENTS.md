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

### v1.1 Gating Requirements

#### Auth & Routing Fixes
- [ ] **AUTH-04**: Perform a deep dive analysis of role-based routing, UI gating, and authentication state flow.
- [ ] **AUTH-05**: Musicians cannot see administrative actions like 'Clone Setlist' or 'Duplicate'.
- [ ] **AUTH-06**: Ensure zero UI/Auth flashes when loading protected pages.
- [ ] **AUTH-07**: Investigate and fix 403 Forbidden error when Admins upload files to `/api/library/upload`.

#### Schedule & Data Fetching
- [ ] **DATA-01**: Display a straightforward list of upcoming public setlists associated with dates on the schedule page (regardless of musician assignment).
- [ ] **DATA-02**: Ensure unauthenticated users immediately see the hero card on the dashboard.

### v1.2 Library Expansion Requirements

#### PDF Processing Pipeline
- [ ] **DATA-03**: Create a local Node script to batch process a directory of PDFs, removing the first page (title page) from each file.
- [ ] **DATA-04**: Extract `Title` and `Author` from the source PDF filenames using Regex, converting titles from ALL CAPS to Title Case.
- [ ] **DATA-05**: Upload processed PDFs to Firebase Storage via the script.
- [ ] **DATA-06**: Create corresponding Firestore `songs` documents for each uploaded PDF, populated with the extracted metadata and a `collection` identifier.

#### UI Segregation & Segregation
- [ ] **UI-04**: Add visual indicators (badges, color tints) to search results in `SongChartsLibrary.tsx` to differentiate between Core and Supplemental collections.
- [ ] **UI-05**: Add a "Collection" filter to the library search toolbar.
- [ ] **UI-06**: Update the `UploadDialog.tsx` to require selecting a destination collection when manually uploading new charts.
- [ ] **ARCH-04**: Update the `Song` type definition and Firestore schema to include the `collection` field.

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
- AUTH-04 -> Phase 12
- AUTH-05 -> Phase 13
- AUTH-06 -> Phase 13
- AUTH-07 -> Phase 12
- DATA-01 -> Phase 14
- DATA-02 -> Phase 14
- DATA-03 -> TBD
- DATA-04 -> TBD
- DATA-05 -> TBD
- DATA-06 -> TBD
- UI-04 -> TBD
- UI-05 -> TBD
- UI-06 -> TBD
- ARCH-04 -> TBD