# CentralReform.live: Bulletproof Auth & Architecture

## What This Is
A comprehensive refactoring project to fix authentication instability, streamline public access, eliminate UI leaks, and remove significant technical debt (legacy rendering engines) from the Next.js App Router codebase.

## Core Value
Musicians see exactly what they need instantly, admins have secure control without UI leaks, and the public gets frictionless access to setlists. The system is easy to maintain with a single unified performance engine.

## Requirements

### Validated
- ✓ V2 Setlist Performance View is functional and preferred.
- ✓ Next.js App Router architecture is in place (`src/proxy.ts`).
- ✓ Firebase Client SDK is used for initial auth.

### Active
- [ ] **ARCH-01**: Eliminate the legacy "footswitch" rendering engine (`PerformerView`, `FlowItemView`, `/perform/[id]`).
- [ ] **ARCH-02**: Consolidate all performance views to `/perform/setlist/[id]`.
- [ ] **AUTH-01**: Implement `next-firebase-auth-edge` for robust session-to-cookie synchronization.
- [ ] **AUTH-02**: Standardize mobile login to popup-only (bypassing iOS ITP blocks).
- [ ] **AUTH-03**: Implement "Hard Logout" (cache purge and full reload).
- [ ] **SEC-01**: Strictly enforce the public boundary—editors are only for editors, public goes to performance view.
- [ ] **SEC-02**: Implement Server-Side UI Gating (hide restricted UI at the server level, no client-side flicker).
- [ ] **SEC-03**: Standardize all `/api/*` routes to use the secure `createApiHandler`.

### Out of Scope
- Adding new features to the setlist editor.
- Changing the underlying database schema.
- Re-architecting the X32 monitor bridge (only securing its UI access).

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Delete Footswitch Engine | It is unused, causes routing complexity, and forces the maintenance of two separate performance UI paradigms. | Pending |
| Popup-Only Auth | `signInWithRedirect` is fundamentally broken on modern iOS Safari due to third-party cookie restrictions. | Pending |
| Server-Side Gating | Relying on client-side hydration for RBAC causes UI flicker and leaks "unauthorized" code to the browser. | Pending |

---
*Last updated: 2026-03-13 after initialization*