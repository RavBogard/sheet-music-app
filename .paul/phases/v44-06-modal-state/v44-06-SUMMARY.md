# v44-06 Modal State Hygiene — SUMMARY

**Status:** Complete
**Date:** 2026-04-15
**Commits pushed to `origin/master`:**

| Hash | Task | Message |
|------|------|---------|
| `5664255` | 1 | fix(modal-state): re-seed EditDetails + NamePrompt on open |
| `2e9b310` | 2 | fix(modal-state): clear pending role on props change + CollapsibleSection localStorage opt-in |
| `f36c101` | 3 | fix(modal-state): reset SwapPicker query + selection on reopen |
| `31d4b85` | 4 | test(modal-state): regression suite for setlist-modal close/reopen invariants |

## Per-file diff summary

### `src/components/setlist/modals/EditDetails.tsx`
A pre-existing `useEffect` already attempted to re-seed state on open, but its
deps array included every `initial*` prop — which would clobber in-progress
edits any time the parent re-rendered with a new `Date` instance or similar.
Narrowed the deps to `[isOpen]` (with the appropriate `eslint-disable` for
`react-hooks/exhaustive-deps`) so the seed only runs on the false→true edge.

### `src/components/setlist/modals/NamePrompt.tsx`
Added a `useEffect` mirroring the EditDetails pattern: on every false→true
`isOpen` transition, reset `name` ← `initialName` and `date` ← `initialDate`.
Deps limited to `[isOpen]`. Closes UX-002.

### `src/components/admin/UserRow.tsx`
Added a `useEffect(() => { setPendingRole(null) }, [user.role])` so any parent
refresh that changes the user's actual role clears a stale confirmation.
Cancel was already wired via `AlertDialog onOpenChange` — no change needed
there. Closes UX-011.

### `src/components/admin/CollapsibleSection.tsx`
Added optional `storageKey?: string` prop. When present, initial `isOpen` is
hydrated from `localStorage['crc.collapse.<key>']` via a `useState` lazy
initializer (SSR-safe via `typeof window !== 'undefined'`, try/catch for
private-mode/restricted-storage contexts). Toggle now writes back via a
`useCallback`. Omitting the prop preserves the exact prior in-memory
behavior — fully backward compatible. No call sites needed updating (the
component has no other consumers in the current codebase; the prop is
available for future admin-page adoption). Closes UX-018.

### `src/components/performance/SwapPicker.tsx`
Added `useEffect(() => { if (!open) return; setQuery(""); setSelectedIndex(0) }, [open])`.
Sits alongside v44-03's autofocus effect and the `results`-driven
`setSelectedIndex(0)` effect without conflict. Closes UX-015.

### `src/components/setlist/modals/__tests__/modal-state.test.tsx` (new, +225 lines)
Three React Testing Library regression cases — one per setlist-modal
invariant. Uses `vi.mock` for `@/lib/congregation-store` and
`@/lib/library-store`; stubs `HTMLElement.prototype.scrollIntoView` in
`beforeAll` since jsdom doesn't implement it.

## UX findings closed (from R2B-client-ux.md)

- **UX-001** — EditDetails leaked prior-setlist edits on reopen → fixed
- **UX-002** — NamePrompt retained prior typed name on reopen → fixed
- **UX-011** — UserRow pending role-change confirmation got stuck after
  parent-driven role refresh → fixed
- **UX-015** — SwapPicker retained prior search query + highlight on
  reopen → fixed
- **UX-018** — CollapsibleSection open/closed state didn't persist across
  navigation → fixed (opt-in via `storageKey`)

## Already-correct modals (no change needed)

- `AddSongsModal.tsx` — not in plan scope; spot-check not performed.
- `MatchFileModal.tsx` — not in plan scope.
- `EditDetails` pre-existing reset effect was present but had wrong deps
  (documented above).
- `UserRow` Cancel → `setPendingRole(null)` was already wired via
  `AlertDialog onOpenChange`; only the props-change reset needed adding.

## Test counts

| | Before | After |
|---|---:|---:|
| Test files | 116 | 117 |
| Tests | 1321 | **1324** (+3) |

All 1324 green. `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.

## Zero visual leakage

Every change is a state-reset hook or a new opt-in prop. No JSX structure,
className, animation, copy, or interaction-design change in any of the five
source files.

## Band-readiness

With v44-06 complete, all R2B "must fix before release" client-UX items are
closed. The setlist modal trust-building invariants (rename/edit see fresh
state, role confirmations don't stick, swap picker starts clean) are
test-locked at 1324 green. The app is ready for band onboarding from a
modal-state-hygiene standpoint.
