# TypeScript Diagnostics Report — CentralReform.live

**Date:** 2026-02-23
**Tool:** `tsc --noEmit` (TypeScript 5.x, Next.js 15)
**Grade:** A- (0 compilation errors, 73 unused warnings)

---

## Summary

| Check | Result |
|-------|--------|
| `tsc --noEmit` (standard) | **0 errors** |
| `tsc --noEmit --noUnusedLocals --noUnusedParameters` (strict) | **73 warnings** |
| Build (`next build`) | Passes (pre-existing env var warning for `GOOGLE_GENERATIVE_AI_API_KEY`) |

The codebase compiles cleanly with zero type errors. All 73 findings are unused imports/variables/parameters — no type safety issues, no `any` type abuse in core logic, no missing type definitions.

---

## Unused Imports & Variables (73 total)

### By Severity

These are all TS6133 (unused variable/import) or TS6192/TS6196 (unused import declaration). None are bugs, but cleaning them up improves code clarity and tree-shaking.

### High-Frequency Files (5+ warnings)

| File | Warnings | Notes |
|------|----------|-------|
| `src/components/setlist/v2/OverflowMenu.tsx` | 7 | Many unused Lucide icons (Printer, Copy, History, Download, ListChecks, Radio, CalendarPlus, BookmarkPlus) — likely left from removed menu items |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | 4 | `isSyncing`, `isFullyOffline`, `duplicateTrack`, `handleCloneNextWeek`, `handleSaveAsTemplate` — features imported but not yet wired |
| `src/components/music/ChartSuggestions.tsx` | 4 | `useEffect`, `useState`, `useSetlistStore`, `isReplaceMode` — component may have been partially refactored |
| `src/components/performance/SetlistDrawer.tsx` | 3 | `currentSetlistId`, `currentSongRef`, `sectionRefs` — unused refs/state |
| `src/app/perform/setlist/[id]/page.tsx` | 3 | `ScrollArea`, `sectionLabels`, `scrollToSection` — unused imports and variables |

### Newly Added Feature Files (from this session)

| File | Warnings | Notes |
|------|----------|-------|
| `src/components/settings/PushNotificationSettings.tsx` | 1 | Unused `Button` import from shadcn |
| `src/components/setlist/LeaderConsole.tsx` | 3 | Unused `useState`, `setlistName`, `prevTrack` |
| `src/app/live/[id]/page.tsx` | 2 | Unused `index`, `total` destructured variables |
| `src/app/api/cron/backup/route.ts` | 2 | Unused `response`, `projectId` |

### All Other Files (1-2 warnings each)

| File | Warning |
|------|---------|
| `check-storage.ts` | Unused `getFirestore`, `bucketName` (dev utility) |
| `next.config.ts` | Unused `NextConfig` type import |
| `src/app/(main)/error.tsx` | Unused `_error` parameter |
| `src/app/(main)/setlists/[id]/error.tsx` | Unused `_error` parameter |
| `src/app/(main)/tasks/page.tsx` | Unused `orderBy`, `Filter` |
| `src/app/api/setlist/transfer/route.ts` | Unused `logger` |
| `src/app/perform/[id]/page.tsx` | Unused `currentSetlistId`, `isNext` |
| `src/app/perform/error.tsx` | Unused `_error` parameter |
| `src/components/admin/live/FeaturedSetlistCard.tsx` | Unused `getDoc`, `Loader2`, `X` |
| `src/components/admin/LiveServiceSection.tsx` | Unused `setlistsLoading` |
| `src/components/admin/SystemSection.tsx` | Unused `toast`, `Button`, `user` |
| `src/components/dashboard/TaskCards.tsx` | Unused `cn` |
| `src/components/library/ContentSearchResults.tsx` | Unused `onSelectFile` |
| `src/components/library/SongChartsLibrary.tsx` | Unused `handleItemClick` |
| `src/components/music/PDFViewer.tsx` | Unused `fileId` |
| `src/components/nav/AppNavigation.tsx` | Unused `pathname` |
| `src/components/performance/Metronome.tsx` | Unused `Play` icon |
| `src/components/performance/PerformanceToolbar.tsx` | Unused `Home` icon |
| `src/components/performance/RehearsalToolbar.tsx` | Unused `Gauge` icon |
| `src/components/setlist/importer/ImporterModal.tsx` | Unused `ScrollArea` |
| `src/components/setlist/modals/AddSongsModal.tsx` | Unused `libraryLoading` |
| `src/components/setlist/PrintModal.tsx` | Unused `msg`, `pct` |
| `src/components/setlist/SetlistDashboard.tsx` | Unused `setSelectedSetlistForTransfer` |
| `src/components/setlist/tasks/TaskSheet.tsx` | Unused `useMemo`, `SheetTrigger` |
| `src/components/setlist/v2/SetlistMatrixView.tsx` | Unused `rowIdx` |
| `src/hooks/use-smart-transposer.ts` | Unused `e` in catch |
| `src/lib/api-wrapper.ts` | Unused type `ApiHandlerContext` |
| `src/lib/offline-manager.ts` | Unused `isFileCached` |
| `src/lib/setlist-firebase.ts` | Unused `deleteDoc`, `isPublic` |
| `src/lib/setlist-versioning.ts` | Unused `Timestamp` |
| `src/types/schemas.ts` | All imports unused |

---

## Recommendations

### Quick Wins (Batch Cleanup)
1. **Remove unused icon imports** across `OverflowMenu.tsx`, `FeaturedSetlistCard.tsx`, `Metronome.tsx`, `PerformanceToolbar.tsx`, `RehearsalToolbar.tsx` — these are just dead imports from Lucide
2. **Prefix unused error params** with `_` (already done in some files, inconsistent in others)
3. **Remove unused `ScrollArea`** imports (2 occurrences)
4. **Clean `PushNotificationSettings.tsx`** — remove unused `Button` import

### Low Priority
5. **`SetlistEditorV2.tsx`** has 4 unused items that look like planned features (`handleCloneNextWeek`, `handleSaveAsTemplate`) — either remove or add TODO comments
6. **`ChartSuggestions.tsx`** appears partially refactored — 4 unused items suggest incomplete work
7. **`check-storage.ts`** and **`src/types/schemas.ts`** — dev utilities with unused code, low impact

### Do NOT Change
- Error boundary `_error` params — these are required by Next.js error boundary API even if unused
- `next.config.ts` `NextConfig` — common pattern for typed config files

---

## Conclusion

The TypeScript codebase is in excellent shape with zero type errors. The 73 unused warnings are cosmetic and don't affect runtime behavior. The most impactful cleanup would be the icon imports in `OverflowMenu.tsx` (7 unused icons) which slightly bloat the bundle, and the 3 warnings in the newly added `LeaderConsole.tsx`.
