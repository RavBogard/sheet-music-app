# Plan 08: PDF Worker & Caching Optimization

**Phase:** 8 - PDF Worker & Caching
**Status:** Ready to execute

## Goal
Implement background pre-fetching for the next 2 PDF files in a setlist so they open instantaneously when a user advances to the next song during a live performance.

## Requirements
- ✓ PERF-01: Implement background pre-fetching for the next 2 songs in a setlist.

## Proposed Changes

### 1. `src/components/performance/PDFOverlay.tsx`
- **Task**: Add a `useEffect` hook to handle background prefetching.
- **Action**: When `currentIndex` changes, calculate the next 2 valid `fileId`s from the `tracks` array.
- **Action**: Use a local `useRef(new Set<string>())` to track which `fileId`s have already been prefetched to avoid redundant network requests.
- **Action**: Execute `fetch(\`/api/drive/file/\${id}\`)` for the identified files. We don't need to await or process the response body; the browser's network layer will cache the response payload automatically based on the `Cache-Control` header.
- **Action**: Wrap the `fetch` calls in `requestIdleCallback` (with a `setTimeout` fallback for Safari) so the prefetching does not block the UI thread while `react-pdf` is rendering the *current* chart.

## Verification Criteria
- [ ] Inspecting the Network tab in DevTools shows the next 2 PDFs being fetched in the background when opening a chart.
- [ ] Navigating to the next chart loads the PDF instantly from `(disk cache)` or `(memory cache)`.
- [ ] The app compiles cleanly (`tsc --noEmit`).

---
*Plan: 08-PLAN*
*Phase: 08-pdf-caching*