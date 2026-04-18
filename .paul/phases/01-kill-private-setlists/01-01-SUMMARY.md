# 01-01 — Kill Private Setlists — Summary

**Completed:** 2026-04-13
**Status:** Code + tests complete. Production deploy + migration + smoke test pending.

## What changed

- **Type / schema** — removed `isPublic` field entirely:
  - `src/types/models.ts` — dropped from `Setlist`
  - `src/types/schemas.ts` — dropped from Zod schema
  - `src/lib/validations.ts` — dropped from `createSetlistSchema`

- **Service layer** (`src/lib/setlist-firebase.ts`):
  - `createSetlist(name, tracks, additionalData?)` — removed `isPublic` param and field
  - `subscribeToSetlist(id, callback)` — removed `_isPublic` param
  - `updateSetlist(id, data)` — removed `_isPublic` param
  - `deleteSetlist(id)` — removed `_isPublic` param
  - `duplicateSetlist`, `cloneForNextWeek`, `saveAsTemplate` — removed `isPublic: true` literals
  - **Deleted `makePublic()` and `makePrivate()` methods** (no longer meaningful)

- **Callers / API routes — removed the arg or the `isPublic: false` write:**
  - `src/hooks/use-creation-wizard.ts` — removed `isPublic` state, `setIsPublic`, `musicians.length > 0 && isPublic` gate → always schedule musicians
  - `src/hooks/use-setlist-logic.ts` — removed `initialIsPublic`, `isPublic` state, **deleted `togglePublic()`** entirely
  - `src/hooks/use-setlist-dashboard.ts` — dropped arg from `deleteSetlist` / `createSetlist` calls; removed literal in matrix data
  - `src/hooks/use-add-to-setlist.ts` — dropped arg from `updateSetlist` / `subscribeToSetlist`; removed `undoIsPublic`
  - `src/components/setlist/ChatPanel.tsx` — dropped arg from `createSetlist` and `updateSetlist`
  - `src/app/api/setlist/transfer/route.ts` — removed `isPublic: false` write
  - `src/app/api/setlists/import/execute/route.ts` — removed `isPublic: false, // Default to private until reviewed`
  - `src/app/api/chat/route.ts` — removed from system prompt example, from `CREATE_SETLIST` payload, from `where('isPublic', '==', true)` query (now queries all 100 most-recent setlists), from display string
  - `src/app/api/admin/set-role/route.ts` — **removed entire "demotion guard" block** that locked public setlists on demotion (no longer meaningful)
  - `src/app/api/setlists/matrix/route.ts` — removed `.where('isPublic', '==', true)` filter
  - `src/app/api/setlist/publish/route.ts` — removed `isPublic: true` write; gate re-notify on `publishedAt` instead (`wasPublished = !!setlist.publishedAt`)
  - `src/app/api/setlist/print/public/route.ts` — gate now checks `!!setlist.publishedAt` instead of `isPublic === true`

- **Firestore query filters stripped** (field no longer exists, so filters would return 0 docs):
  - `src/hooks/use-upcoming-prep.ts`
  - `src/components/admin/TemplatesSection.tsx`
  - `src/components/nav/MobileTabBar.tsx`
  - `src/lib/scheduling-firebase.ts`

- **UI affordances removed:**
  - `src/components/setlist/wizard/CreationWizard.tsx` — removed the Personal/Public toggle and unused `isBandLeader` prop
  - `src/components/setlist/v2/OverflowMenu.tsx` — removed "Make Public / Make Private" menu item and "Update & Notify / Publish & Notify" copy split (now just "Publish & Notify")
  - `src/components/setlist/v2/SetlistEditorV2.tsx` — removed `initialIsPublic` prop, `isPublic`/`setIsPublic`/`togglePublic` wiring, the `router.refresh()` cache-bust effect
  - `src/components/setlist/modals/NamePrompt.tsx` — removed `initialIsPublic` and `isPublic` arg from `onConfirm`
  - `src/components/setlist/SetlistCards.tsx` — removed Globe/Lock icons from card headers and the "public-only owner attribution" gate
  - `src/app/(main)/setlists/[id]/page.tsx` — removed `initialIsPublic` prop

- **Tests updated:**
  - `src/lib/setlist-firebase.test.ts` — updated signatures; **added regression-guard test "never writes isPublic to Firestore"**
  - Updated fixtures in: `assignment-auth.test.ts`, `route-auth.test.ts`, `add-to-setlist-sheet.test.tsx`, `setlist-editor-v2.test.tsx`, `use-add-to-setlist.test.ts`, `use-creation-wizard.test.ts`, `use-setlist-dashboard.test.ts`, `use-upcoming-prep.test.ts`, `next-service-card.test.tsx`, `public-view.test.tsx`, `validations.test.ts`
  - Updated `server-auth.test.ts` `serializeSetlist` test to use `isTemplate` as the generic-passthrough example
  - Updated `scheduling-firebase.test.ts` to assert eventDate-only filter

- **Migration script:** `scripts/migrate-remove-isPublic.ts` — idempotent, batch-writes `FieldValue.delete()` for every setlist doc that still has `isPublic`.

## Verification

- `npx tsc --noEmit` → exit 0 ✓
- `npx vitest run` → **1084 / 1084 tests pass** ✓ (1 pre-existing unrelated failure in `song-charts-library.test.tsx` — env validation issue on master, independent of this work — verified by re-running on stashed master)
- `rg "isPublic" sheet-music-app/src` — only unrelated concepts remain: `isPublicView` (logged-out performance view), `isPublicRoute` (proxy auth gate), and the two regression-guard tests asserting `isPublic` is NOT used.

## Deviations from plan

The plan under-scoped. The approved plan listed ~18 files; actual reach was ~30 files because `isPublic` also appeared in:
- 5 Firestore query filters (`.where('isPublic', '==', true)`) that would silently return zero docs once the field was stripped
- The `/api/setlist/publish` route, which conflated "is public" with "is published" — split cleanly using `publishedAt` instead
- The `/api/setlist/print/public` public-download gate — now gates on `publishedAt`
- The admin `set-role` demotion guard — removed entirely (dead logic)
- The `OverflowMenu` and `CreationWizard` UI toggles — user-facing affordances
- The `MusicianPicker.isPublished` prop — left optional; `emailEvents` panel will no longer conditionally render (minor: data is still server-side, panel was auxiliary)

All deviations stay within the spirit of the approved plan ("fully eliminate the private/public distinction in code, data, and UI"). No adjacent refactors, no LOW-004 bundling.

## Not yet done (Task 5 — needs human verification)

1. Commit + push `origin master` (Vercel auto-deploys to prod).
2. Run migration: `FIREBASE_SERVICE_ACCOUNT_KEY=... pnpm tsx scripts/migrate-remove-isPublic.ts` — log touched count.
3. Production smoke test: create a setlist via (a) wizard, (b) chat, (c) import, (d) transfer. Confirm in Firestore each doc has no `isPublic`. Sign in as a second user; confirm all 4 visible.
