/**
 * The one `import()` site for the chart overlay on the setlist page.
 *
 * Webpack gives every `import()` call site its own chunk group, so the
 * Perform warm-up (`perform-warm.ts`) and the page must share this function:
 * then the chunks the warm-up caches, and the module it pre-evaluates, are
 * exactly the ones a chart tap asks for.
 */
export const loadPDFOverlay = () => import("@/components/performance/PDFOverlay")
