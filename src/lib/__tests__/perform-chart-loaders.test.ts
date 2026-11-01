/**
 * Review S1 on PR #48: webpack gives each import() call site its own wrapper
 * chunk, so the warm-up only caches what a chart tap requests when both use
 * the SAME loader functions. These assert the sharing at the source.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as loaders from "@/lib/perform-chart-loaders"
import { VIEWER_LOADERS } from "@/lib/perform-warm"

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("one import() site per chart surface", () => {
    it("the warm-up warms exactly the shared loaders", () => {
        expect(VIEWER_LOADERS).toEqual([
            loaders.loadPDFOverlay,
            loaders.loadPDFViewer,
            loaders.loadTextScoreViewer,
            loaders.loadImageScoreViewer,
            loaders.loadSmartScoreViewer,
        ])
    })

    it("PDFOverlay and the setlist page load through the shared loaders, with no import() of their own", () => {
        const overlay = src("src/components/performance/PDFOverlay.tsx")
        for (const name of ["loadPDFViewer", "loadSmartScoreViewer", "loadTextScoreViewer", "loadImageScoreViewer", "loadAudioViewer"]) {
            expect(overlay).toContain(`${name}()`)
        }
        expect(overlay).not.toMatch(/import\(\s*["']@\/components\/music\//)
        const page = src("src/app/perform/setlist/[id]/SetlistPerformClient.tsx")
        expect(page).toContain("loadPDFOverlay()")
        expect(page).not.toMatch(/import\(\s*["']@\/components\/performance\/PDFOverlay/)
    })
})
