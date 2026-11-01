/**
 * The one `import()` site for each chart surface on Perform.
 *
 * Webpack gives every `import()` call site its own chunk group, with its own
 * small wrapper chunk. The page (`SetlistPerformClient`), the overlay
 * (`PDFOverlay`'s `next/dynamic` viewers) and the Perform warm-up
 * (`perform-warm.ts`) must all call THESE functions: then the chunks the
 * warm-up caches are exactly the ones a chart tap requests, and a chart never
 * opened online still opens offline after a deploy (review S1 on PR #48).
 * Never write a second `import()` of these modules elsewhere on Perform.
 */
export const loadPDFOverlay = () => import("@/components/performance/PDFOverlay")
export const loadPDFViewer = () => import("@/components/music/PDFViewer")
export const loadSmartScoreViewer = () => import("@/components/music/SmartScoreViewer")
export const loadTextScoreViewer = () => import("@/components/music/TextScoreViewer")
export const loadImageScoreViewer = () => import("@/components/music/ImageScoreViewer")
export const loadAudioViewer = () => import("@/components/music/AudioViewer")
