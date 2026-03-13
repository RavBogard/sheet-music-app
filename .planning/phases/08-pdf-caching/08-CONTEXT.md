# Phase 8: PDF Worker & Caching Optimization - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase focuses on improving the live performance experience by aggressively pre-fetching the PDF files for the upcoming 2 songs in a setlist. Because the `/api/drive/file/[fileId]` route sends `Cache-Control` headers with `max-age=86400`, the browser will natively cache these requests.

We will build a background prefetcher mechanism that runs invisibly during the setlist view to ensure instantaneous PDF rendering when the user taps "Next."

</domain>

<decisions>
## Implementation Decisions

### Prefetching Strategy
- **Decision:** Implement prefetching using a background `fetch()` within a `useEffect` inside `PDFOverlay.tsx` (or an invisible helper component). Since the browser HTTP cache honors the `Cache-Control` header sent by the edge proxy, `fetch()` is the most robust cross-browser way to ensure the payload is locally cached.
- **Decision:** The prefetcher should look ahead by **2 songs** (checking the current `currentIndex` and grabbing `tracks[currentIndex + 1]` and `tracks[currentIndex + 2]`).
- **Decision:** It will only fetch `track.fileId` if it exists.
- **Decision:** Ensure the prefetch runs with low priority so it doesn't block the UI thread while the current PDF is rendering (e.g., using `requestIdleCallback` or a simple `setTimeout`).

</decisions>

<code_context>
## Existing Code Insights

### `/api/drive/file/[fileId]/route.ts`
- Sends `Cache-Control: public, max-age=86400, s-maxage=604800`.
- Requires `requireAuth: false` but implements custom origin/fetch-site checks. A standard `fetch()` from the client will pass these checks natively.

### `src/components/performance/PDFOverlay.tsx`
- Receives `tracks` array and `currentIndex`. This is the perfect place to mount the prefetching logic since it knows exactly what the current position in the flow is.

</code_context>

---

*Phase: 08-pdf-caching*
*Context gathered: 2026-03-13*