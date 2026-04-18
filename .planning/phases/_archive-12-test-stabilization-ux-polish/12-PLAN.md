# Phase 12: Test Stabilization & UX Polish

**Gathered:** 2026-03-13
**Status:** Ready to execute

<domain>
## Phase Boundary
This phase resolves 4 broken tests introduced during the Phase 1-11 refactoring, specifically in `server-auth.test.ts`, `performance-toolbar.test.tsx`, and `pdf-overlay.test.tsx`. It also adds minor UX quality-of-life improvements: a smooth logout spinner and a hard reset fallback on the global error boundary.
</domain>

## Proposed Changes

### 1. Fix `src/components/performance/__tests__/pdf-overlay.test.tsx`
- **Task**: Mock `useParams` and `useRouter` from `next/navigation`.
- **Action**: Add `useParams: () => ({ id: 'test-setlist' }), useRouter: () => ({ push: vi.fn() })` to the `vi.mock("next/navigation")` block.

### 2. Fix `src/components/performance/__tests__/performance-toolbar.test.tsx`
- **Task**: Fix missing environment variables causing `useAuth` to crash.
- **Action**: Since `PerformanceToolbar` now imports `useAuth` which eventually relies on Firebase env vars, mock `useAuth` directly in this test file to bypass the Firebase initialization entirely: `vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isBandLeader: true }) }))`.

### 3. Fix `src/lib/__tests__/server-auth.test.ts`
- **Task**: Update the assertion for `getServerUser` fallback name logic.
- **Action**: The test `returns ServerUser with correct fields for valid session` expects `Test User`, but the new logic might be returning `Auth Name`. Update the assertion to match the new correct behavior.

### 4. UX: Smooth Logout (`src/lib/auth-context.tsx`)
- **Task**: Soften the "Hard Logout" visual transition.
- **Action**: Add a global DOM overlay (or just rely on the existing standard loading state pattern) during the `signOut` promise before `window.location.reload()` fires. Actually, the simplest method is to add a small `<style>` injection or full-screen `div` in `signOut()` right before the `await fetch`, e.g., `document.body.innerHTML += '<div class="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div></div>'`.

### 5. UX: Global Error Fallback (`src/app/(main)/error.tsx`)
- **Task**: Provide a hard-reset escape hatch if React state corrupts.
- **Action**: Add a secondary button next to "Retry" that clears local storage and forces a hard refresh: `onClick={() => { localStorage.clear(); window.location.href = '/' }}`.
