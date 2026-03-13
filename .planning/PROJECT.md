# Auth & Access Audit (CentralReform.live)

## What This Is

A specialized audit and hardening phase for the Central Reform Congregation worship music platform. The goal is to ensure that authentication flows, role-based access control (RBAC), and feature visibility are "bulletproof," preventing permission bleed and providing a seamless experience for both authenticated musicians and unauthenticated community members.

## Core Value

Musicians see exactly what they need for their specific role (and nothing else), while unauthenticated users get instant, frictionless access to public setlists and charts.

## Requirements

### Validated

- ✓ Setlist management (editor/performance) — v2.6
- ✓ Sheet music library (Google Drive/Firebase Storage) — v2.6
- ✓ Monitor mixing (X32 bridge) — v2.6
- ✓ Transposition engine (Gemini AI + music-math) — v2.6
- ✓ Basic Firebase Auth (Google OAuth) — v2.6

### Active

- [ ] **AUTH-AUDIT-01**: Audit all authentication flows to eliminate "already signed in" or "stale session" bugs.
- [ ] **RBAC-01**: Enforce strict "Edit" view visibility—only Admins and Band Leaders should see setlist editing features.
- [ ] **RBAC-02**: Enforce "Monitor" feature visibility—only users with an assigned monitor bus should see monitor controls.
- [ ] **PUBLIC-01**: Ensure unauthenticated users can access public setlists and charts instantly via public links.
- [ ] **UI-UX-01**: Implement a "feature filtering" system that hides UI elements based on user roles and assignments.
- [ ] **AUTH-ROBUST**: Harden the sign-in flow to handle edge cases (mobile popup blockers, account switching, etc.).

### Out of Scope

- [ ] Adding new non-auth features — focus is purely on audit and hardening.
- [ ] Redesigning the monitor mixing logic — only focusing on its *visibility* and *access*.

## Context

- **Previous Work**: Significant efforts in v1.3, v1.5, v1.6, v1.9, and v2.5 to stabilize the codebase and auth, yet bugs persist around role boundaries.
- **Roles**:
    - **Admin**: Full access to all features.
    - **Band Leader**: Admin-lite; can edit public setlists and upload charts.
    - **Musician**: Access to monitor features (if assigned) and all public setlists/charts.
    - **Member**: Access to public setlists/charts.
    - **Sound Engineer (Toggle)**: Can assign monitors and change monitoring settings.
- **Known Issues**: Non-editors seeing "Edit" options; musicians without monitors seeing monitor buttons; unauthenticated users struggling to access public charts.

## Constraints

- **Tech Stack**: Next.js 16 (App Router), Firebase (Auth, Firestore, Storage), Tailwind CSS 4.
- **User Base**: Non-technical musicians and community members; UX must be frictionless.
- **Security**: Must follow Firebase security best practices (Firestore rules, etc.).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Audit first, then refactor | Need to reproduce and understand the "why" behind current leaks before fixing. | — Pending |
| Role-based feature filtering | UI should reflect permissions, not just show disabled states. | — Pending |

---
*Last updated: 2026-03-13 after initialization of Auth & Access Audit project*
