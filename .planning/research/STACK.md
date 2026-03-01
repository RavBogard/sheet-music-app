# Stack Research

**Domain:** Worship music performance app -- outline print & live performance refinements
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH (most recommendations verified against npm registry and official docs; @react-pdf/renderer compatibility is the main uncertainty)

---

## Context: What Already Exists

This is a subsequent milestone. The core stack is locked:

- Next.js 16.1.4 / React 19.2.3 / TypeScript 5.x (strict mode)
- Firebase (Auth, Firestore, Storage, Admin SDK)
- TailwindCSS 4 / Radix UI / Lucide React
- Zustand + TanStack React Query for state
- pdf-lib 1.17.1 for PDF generation (cover page outline + chord transposition merge)
- Zod 4.3.6 for schema validation

This research focuses on **what to add or change** for three improvements:
1. Better printed outlines (clean, scannable, music-stand-ready)
2. Glanceable live performance views
3. TypeScript type safety + error handling

---

## Recommended Additions

### 1. PDF Generation: Improve the Cover Page Outline

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `@cantoo/pdf-lib` | 2.5.3 | Drop-in replacement for unmaintained `pdf-lib` | Active fork: SVG support, bug fixes, updated Oct 2025. Original `pdf-lib` 1.17.1 has had zero updates since 2021 and the maintainer is unresponsive. API is identical -- swap the import, keep all existing code. | HIGH |
| `@pdf-lib/fontkit` | 1.1.1 | Custom font embedding for outline PDF | Enables embedding TTF/OTF fonts (e.g., Inter, Source Sans) instead of being limited to 14 standard PDF fonts (Helvetica, Times, Courier). Required for readable, branded outlines. 5 years old but stable and works with both `pdf-lib` and `@cantoo/pdf-lib`. | HIGH |

**What NOT to add:**

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@react-pdf/renderer` | Persistent, unresolved `renderToBuffer`/`renderToStream` failures in Next.js App Router route handlers (issues open for Next 13, 14, 15 -- no fix as of March 2026). `PDFDocument is not a constructor` error, `Minified React error #31`, and ESM import failures in production. Would require a separate Node microservice or Pages Router, defeating the purpose. | Keep `pdf-lib` (swap to `@cantoo/pdf-lib`). The existing imperative drawing API is actually well-suited for this use case -- the outline is a structured table, not a complex layout. |
| `pdfmake` | JSON-driven API is powerful for complex reports but overkill for a single-page outline table. Adds 940K weekly downloads worth of dependency for something `pdf-lib` already handles. Bundle size concern for a PWA. | `@cantoo/pdf-lib` with fontkit |
| `puppeteer` / headless Chrome | Requires a separate server process, 300MB+ Chrome binary, cold-start latency. This app runs on Vercel-style serverless. Massive overhead for a 1-page outline. | `@cantoo/pdf-lib` |
| CSS `@media print` / browser Print dialog | Cannot programmatically generate PDFs for email delivery. The app already emails PDFs via Resend -- the print pipeline must produce a `Uint8Array`. Browser print is useful as a secondary option but cannot replace server-side generation. | Keep server-side PDF pipeline; optionally add `@media print` styles for a quick client-side print-to-paper fallback |

**Strategy: Improve, don't replace.** The existing `buildCoverPage()` function in `print-pipeline.ts` is ~140 lines of imperative pdf-lib drawing. The improvements are:

1. **Swap `pdf-lib` to `@cantoo/pdf-lib`** -- identical API, active maintenance, SVG support for decorative elements
2. **Add fontkit + a TTF font** (Inter or Source Sans Pro) -- dramatically better typography vs. standard Helvetica
3. **Add a "Tune" column** to the outline table -- the missing field musicians need most
4. **Increase row height and font size** -- current 10pt/18px rows are too small for arm's-length music stand reading; target 12-14pt with 22-24px row spacing
5. **Add page overflow handling** -- current code stops drawing at `yOffset < 60` with no continuation page; add automatic pagination for long service outlines
6. **Add section header visual weight** -- current headers are the same size as content rows; make them stand out with a rule line or background band

### 2. Live Performance View: Glanceable Outline Mode

No new libraries needed. This is a UI/pattern problem solved with existing tools (TailwindCSS + Radix UI + Zustand).

| Pattern | Purpose | Implementation Approach | Confidence |
|---------|---------|------------------------|------------|
| Outline-first default | Musicians look at the outline 90% of the time, charts only for unfamiliar pieces | New `OutlinePerformanceView` component that shows full service outline with NOW/NEXT highlighting. Charts accessible via tap/drill-down. | HIGH |
| High-contrast large text | Readable from music stand under stage lighting | Dark background (`bg-black`), white text, minimum 20px body / 28px current item. TailwindCSS utility classes only -- no new dependencies. | HIGH |
| Single-screen information density | All critical info (tune, key, lead) visible without scrolling on current item | Card-based layout: tune name is hero text, key in a colored badge, lead musician beneath. Similar to the existing `ServiceFlowCard` but with musical metadata added. | HIGH |
| Contextual scroll position | Show 2-3 items above and below the current track | CSS `scroll-snap-type: y mandatory` with `scroll-snap-align: center` on each row. The current `@tanstack/react-virtual` (3.13.18, already installed) handles virtualization for long setlists. | HIGH |
| Minimal interaction | Advance with swipe, foot pedal (keyboard), or auto-follow from leader console | Already implemented in `FlowItemView.tsx` with `PageDown`, `ArrowRight`, touch swipe. Extend to the new outline view. | HIGH |
| NOW/NEXT/UP NEXT hierarchy | Glanceable at-a-glance status | Three visual tiers: current item (full size, bright), next item (medium, slightly dimmed), upcoming items (list, dimmed). Use opacity and scale to create depth, not just color. | HIGH |

**What NOT to build:**

| Anti-Pattern | Why | Instead |
|--------------|-----|---------|
| Auto-scrolling lyrics/chord display as default | Musicians know the liturgical tunes -- they need the outline, not the chart. Chart display should be opt-in per track. | Show outline by default, offer "View Chart" as drill-down |
| Complex gesture library (e.g., `@use-gesture/react`) | The existing touch handlers in `FlowItemView.tsx` are 20 lines and work well. A gesture library adds bundle weight and abstraction for a simple swipe. | Keep the existing `onTouchStart`/`onTouchEnd` handlers |
| Separate "performance" and "outline" apps/routes | Musicians will switch between outline and chart views within a single service. Separate routes cause navigation latency. | Single route with view-mode toggle via Zustand store |

### 3. TypeScript Type Safety Improvements

No new libraries needed. Zod 4.3.6 is already installed and should be used more consistently.

| Pattern | Target | Approach | Confidence |
|---------|--------|----------|------------|
| Firestore Timestamp type guard | 4 files with `(value as any).seconds` pattern | Create `src/lib/timestamp.ts` with a `toDate()` utility that accepts `Date \| { seconds: number; nanoseconds?: number } \| undefined` and returns `Date`. Import `Timestamp` from `firebase-admin/firestore` for `instanceof` checks on the server, use duck-typing (`'seconds' in value`) on the client. | HIGH |
| Replace `as any` with `unknown` + narrowing | 38 instances across 22 files | For each `as any`: (1) identify what the actual type is, (2) define a proper interface or use an existing one, (3) use type guards to narrow `unknown`. Priority: API routes first (security-sensitive), then components. | HIGH |
| Zod schema validation in all API routes | 5+ routes with missing or incomplete validation | Use existing Zod 4.3.6 schemas from `src/types/schemas.ts` in every route handler. Pattern: `const body = schema.parse(await req.json())` early in the handler. Zod 4 has 14x faster string parsing than Zod 3, so no performance concern. | HIGH |
| Discriminated unions for track types | Track `type` field is a loose string | Define `type TrackType = 'song' \| 'header' \| 'reading' \| 'prayer' \| 'transition' \| 'note'` and use discriminated union for type-specific fields (e.g., songs have `key`, headers don't). | HIGH |
| Replace `.catch(() => {})` with logging | 48 instances across 29 files | Create `src/lib/swallow.ts` with `function swallowWithLog(context: string)` that returns `(err: unknown) => logger.warn(context, err)`. Replace bare empty catches. Keep truly intentional silences (cleanup ops) but add a `// intentional: cleanup` comment. | HIGH |
| `Promise.allSettled` for parallel loads | Dashboard, setlist page, print modal | Replace `Promise.all()` calls where individual failures shouldn't break the whole load. Extract settled results with a typed helper: `function getSettledValues<T>(results: PromiseSettledResult<T>[]): T[]` | MEDIUM |

**What NOT to do:**

| Avoid | Why | Instead |
|-------|-----|---------|
| Enable `noUncheckedIndexedAccess` in tsconfig immediately | This flag is correct but will produce hundreds of new errors at once, blocking development. | Fix `as any` first, then enable in a dedicated cleanup phase |
| Use `@ts-expect-error` as a replacement for `as any` | This just trades one type escape hatch for another. | Write proper types and guards |
| Add a runtime type-checking library (io-ts, typebox, etc.) | Zod 4 is already installed and does the same thing with better DX. Adding a second validation library creates confusion. | Use Zod consistently |

---

## Installation

```bash
# Replace pdf-lib with actively maintained fork (identical API)
npm uninstall pdf-lib
npm install @cantoo/pdf-lib@^2.5.3

# Add fontkit for custom font embedding
npm install @pdf-lib/fontkit@^1.1.1
```

No other new dependencies required. All other improvements use existing libraries.

### Migration for `@cantoo/pdf-lib`

The API is identical to `pdf-lib`. The only change needed is the import path:

```typescript
// Before
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

// After
import { PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib"
```

All existing code in `print-pipeline.ts` works without modification.

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| PDF generation | `@cantoo/pdf-lib` (keep existing approach) | `@react-pdf/renderer` | If the app moves off Next.js App Router, or if a separate PDF microservice is acceptable. The JSX-based API is more developer-friendly for complex layouts, but Next.js compatibility issues make it a non-starter today. |
| PDF generation | `@cantoo/pdf-lib` | `pdfmake` | If the outline grows to multi-page complex reports with dynamic tables, headers/footers, watermarks. For a single-page service outline, `pdf-lib` is simpler. |
| Font in PDF | TTF font via fontkit | Standard PDF fonts (Helvetica) | If bundle size is critical and typography quality is acceptable. Standard fonts add 0 bytes but look generic and have no unicode support beyond Latin-1. |
| Outline UI | TailwindCSS utility classes | CSS-in-JS (styled-components, emotion) | Never in this app. TailwindCSS 4 is already the styling system and it handles everything needed. Adding a CSS-in-JS library would create two competing styling paradigms. |
| Type safety | Zod 4 schemas + manual type guards | tRPC end-to-end types | If the app had a complex API layer with many endpoints. For ~10 API routes, Zod schemas in each route handler are simpler and more explicit than adding a tRPC layer. |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@cantoo/pdf-lib@2.5.3` | `@pdf-lib/fontkit@1.1.1` | Drop-in replacement for `pdf-lib@1.17.1`. Same fontkit registration API. |
| `@cantoo/pdf-lib@2.5.3` | Node.js 18+ | Tested in Node and browser environments. No native dependencies. |
| `@pdf-lib/fontkit@1.1.1` | `@cantoo/pdf-lib@2.5.3` | 5 years old but stable. 145 dependents on npm. Works via `pdfDoc.registerFontkit(fontkit)`. |
| `zod@4.3.6` | `firebase-admin@13.6.0` | Already installed. Use for request body validation in API routes. |
| `@tanstack/react-virtual@3.13.18` | `react@19.2.3` | Already installed. Use for virtualized outline list in performance view. |

---

## Stack Patterns by Variant

**If the outline is 1 page (most services):**
- Single-page PDF with the improved table layout. No pagination needed.
- Font size 12-14pt for body rows, 16pt for section headers, 24pt for title.

**If the outline exceeds 1 page (large B'nei Mitzvah or High Holiday services):**
- Automatic pagination with page numbers and a continuation header.
- `yOffset` tracking already exists in `buildCoverPage()`; extend it to create a new page when `yOffset < 80` and continue drawing.

**If a musician wants just the outline (no charts):**
- "Outline Only" print option that skips the per-track PDF appending step.
- Returns a 1-2 page PDF instantly (no file fetching, no transposition).
- Dramatically faster than the current full-print pipeline.

**If the live performance view is used on a small phone screen:**
- Current item only with tune/key/lead as hero content.
- Swipe to advance. No outline list visible -- just NOW and a peek at NEXT.
- Use `@media (max-width: 640px)` to hide the outline sidebar.

**If the live performance view is used on a tablet or music stand iPad:**
- Full outline list with scroll-snap to current item.
- Current item highlighted with scale/opacity emphasis.
- Chart drill-down available as a slide-over panel via Radix Dialog.

---

## Sources

- [npm: @cantoo/pdf-lib](https://www.npmjs.com/package/@cantoo/pdf-lib) -- version 2.5.3, actively maintained fork, verified Feb 2026. HIGH confidence.
- [npm: @pdf-lib/fontkit](https://www.npmjs.com/package/@pdf-lib/fontkit) -- version 1.1.1, stable fontkit adapter. HIGH confidence.
- [npm: @react-pdf/renderer](https://www.npmjs.com/package/@react-pdf/renderer) -- version 4.3.2. Verified incompatibility with Next.js App Router server-side rendering via [Issue #3074](https://github.com/diegomura/react-pdf/issues/3074) and [Issue #2994](https://github.com/diegomura/react-pdf/issues/2994). HIGH confidence in the incompatibility.
- [GitHub: pdf-lib maintenance status](https://github.com/Hopding/pdf-lib/issues/1423) -- confirmed unmaintained since 2021. HIGH confidence.
- [npm: zod](https://zod.dev/v4) -- version 4.3.6, performance improvements (14x faster string parsing). HIGH confidence.
- [TypeScript type assertion elimination patterns](https://dev.to/matthewhou/10-typescript-tricks-that-made-me-mass-delete-type-assertions-from-our-codebase-9pd) -- community patterns for replacing `as any`. MEDIUM confidence (patterns are well-established, specific codebase applicability needs validation).
- [Firestore Timestamp TypeScript patterns](https://medium.com/@shuhan.chan08/firebase-timestamps-done-right-why-your-apps-time-logic-might-be-broken-25188c3b5b24) -- type guard patterns for Timestamp handling. MEDIUM confidence.
- [CSS @media print best practices](https://print-css.rocks/) -- print stylesheet patterns. HIGH confidence (W3C standards).
- [Glanceable UI principles for wearables/constrained displays](https://www.influencers-time.com/designing-wearable-web-experiences-ux-principles-for-2025/) -- one-intent-per-screen, minimal cognitive load. MEDIUM confidence (general UX principles, not music-specific).

---
*Stack research for: CentralReform.Live outline & stability milestone*
*Researched: 2026-03-01*
