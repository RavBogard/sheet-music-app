/**
 * Print delivery for a single chart — the mechanism behind PDFOverlay's
 * "Print this chart" toolbar action.
 *
 * ── Why this module exists (2026-09-10 bug) ──────────────────────────────
 * The original implementation loaded the chart's PDF blob into a hidden
 * `<iframe>` and called `iframe.contentWindow.print()` from `onload`. In
 * Chrome that produces a BLANK sheet carrying nothing but the browser's own
 * header/footer. Probed live on prod (Chrome 152):
 *
 *   - At the moment `iframe.onload` fires for a `blob:` PDF the frame still
 *     holds an EMPTY placeholder document — `contentDocument.body.children`
 *     is 0 and there is no `<embed>`. `print()` there prints that empty
 *     document. That is the blank page.
 *   - ~250ms later Chrome's built-in PDF viewer takes the frame over, and
 *     from then on the frame is CROSS-ORIGIN: reading `contentWindow.print`
 *     throws `SecurityError: Blocked a frame with origin "…" from accessing
 *     a cross-origin frame`. So "wait longer, then print" cannot work
 *     either — at no point in the frame's life is a printable PDF document
 *     reachable from this origin.
 *   - Frame size was NOT the variable: the placeholder/handoff sequence was
 *     identical at 0×0 and at 800×1000.
 *
 * So we never hand a PDF to the browser's plugin. We rasterize the pages
 * with the same pdf.js build the on-screen viewer already uses, and print a
 * plain same-origin HTML document of `<img>` pages — a document this origin
 * owns and can legally call `print()` on.
 */

import { desiredWorkerSrc } from "@/lib/pdf-worker-offline"

/** One rendered chart page, ready to drop into the print document. */
export interface PrintPageImage {
    /** Object URL of the rendered page bitmap. Revoked after printing. */
    url: string
    /** Page width in PDF points (1/72") — drives page orientation. */
    widthPt: number
    /** Page height in PDF points. */
    heightPt: number
}

/** Target render resolution. 200 DPI is the sweet spot for a chart on
 *  paper — visually indistinguishable from vector at music-stand distance,
 *  and a letter page lands at 1700×2200, comfortably inside the per-page
 *  cap below. */
const TARGET_DPI = 200
const PDF_POINTS_PER_INCH = 72
/** Hard ceiling on a rendered page's longest side, so a poster-size or
 *  mis-scaled source page can't blow out memory on an iPad. */
const MAX_PAGE_PX = 3000

/**
 * Render every page of a PDF blob to a bitmap using the app's existing
 * pdf.js (via react-pdf, so the worker version matches the one
 * `scripts/copy-pdf-worker.js` stages in `public/`).
 *
 * The `workerSrc` write is UNCONDITIONAL on purpose — react-pdf's barrel
 * assigns the truthy placeholder `'pdf.worker.mjs'` at module load, so an
 * `if (!workerSrc)` guard never fires. Same reasoning (and same helper) as
 * `PDFViewer.tsx`.
 */
export async function rasterizePdfToPageImages(blob: Blob): Promise<PrintPageImage[]> {
    const { pdfjs } = await import("react-pdf")
    pdfjs.GlobalWorkerOptions.workerSrc = desiredWorkerSrc(pdfjs.version)

    const data = new Uint8Array(await blob.arrayBuffer())
    const doc = await pdfjs.getDocument({ data }).promise
    const pages: PrintPageImage[] = []

    try {
        for (let n = 1; n <= doc.numPages; n++) {
            const page = await doc.getPage(n)
            const base = page.getViewport({ scale: 1 })
            const dpiScale = TARGET_DPI / PDF_POINTS_PER_INCH
            const capScale = MAX_PAGE_PX / Math.max(base.width, base.height)
            const viewport = page.getViewport({ scale: Math.min(dpiScale, capScale) })

            const canvas = document.createElement("canvas")
            canvas.width = Math.max(1, Math.floor(viewport.width))
            canvas.height = Math.max(1, Math.floor(viewport.height))
            const ctx = canvas.getContext("2d")
            if (!ctx) throw new Error("Couldn't prepare the chart for print (no 2D canvas).")
            // Paper is white; a PDF with no painted background would otherwise
            // rasterize onto transparency and print as a black block.
            ctx.fillStyle = "#ffffff"
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            await page.render({ canvas, canvasContext: ctx, viewport }).promise

            const pageBlob = await new Promise<Blob | null>(resolve =>
                canvas.toBlob(resolve, "image/png"),
            )
            if (!pageBlob) throw new Error("Couldn't prepare the chart for print (page render failed).")
            pages.push({
                url: URL.createObjectURL(pageBlob),
                widthPt: base.width,
                heightPt: base.height,
            })
            // Free the backing store eagerly — a multi-page chart would
            // otherwise hold every full-resolution canvas alive at once.
            canvas.width = 0
            canvas.height = 0
        }
    } finally {
        void doc.destroy()
    }

    if (pages.length === 0) throw new Error("This chart has no pages to print.")
    return pages
}

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
}

/**
 * Build the print document: one full-page `<img>` per chart page, each
 * scaled to fit its sheet without cropping.
 *
 * `@page size` is set from the pages' own aspect ratio so a landscape chart
 * doesn't print shrunken onto a portrait sheet. A mixed-orientation
 * document gets whichever orientation most of its pages want; the
 * `object-fit: contain` box keeps the odd page out intact either way.
 */
export function buildPrintDocumentHtml(pages: PrintPageImage[], title: string): string {
    const landscapeCount = pages.filter(p => p.widthPt > p.heightPt).length
    const orientation = landscapeCount * 2 > pages.length ? "landscape" : "portrait"
    const safeTitle = title.replace(/[&<>"]/g, c => HTML_ESCAPES[c])
    const body = pages
        .map(p => `<div class="pg"><img src="${p.url}" alt=""></div>`)
        .join("")

    return `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>
@page { size: ${orientation}; margin: 6mm; }
html, body { margin: 0; padding: 0; background: #fff; }
.pg {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100vh; overflow: hidden;
  page-break-after: always; break-after: page;
}
.pg:last-child { page-break-after: auto; break-after: auto; }
img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
</style></head><body>${body}</body></html>`
}

/**
 * Print an HTML document we authored, via a hidden same-origin iframe.
 *
 * `srcdoc` inherits this origin, so `contentWindow.print()` is legal here —
 * unlike the `blob:` PDF frame that caused the blank-page bug. Every image
 * is awaited before printing, because a print issued against half-loaded
 * images prints empty boxes.
 */
export function printHtmlInHiddenIframe(html: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement("iframe")
        iframe.setAttribute("aria-hidden", "true")
        iframe.title = "Print preview"
        // Off-screen rather than 0×0: layout must actually happen for the
        // images to decode and for the print box to be measured.
        iframe.style.position = "fixed"
        iframe.style.left = "-10000px"
        iframe.style.top = "0"
        iframe.style.width = "800px"
        iframe.style.height = "1100px"
        iframe.style.border = "0"
        iframe.style.opacity = "0"
        iframe.style.pointerEvents = "none"

        let settled = false
        const finish = (err?: Error) => {
            if (settled) return
            settled = true
            clearTimeout(loadTimeout)
            // Leave the frame in place briefly — tearing it down while the OS
            // print dialog is still reading from it prints a blank sheet.
            setTimeout(() => {
                try {
                    document.body.removeChild(iframe)
                } catch {
                    /* already gone */
                }
            }, 1000)
            if (err) reject(err)
            else resolve()
        }

        const loadTimeout = setTimeout(
            () => finish(new Error("Timed out preparing the chart for print.")),
            30000,
        )

        iframe.onload = () => {
            void (async () => {
                try {
                    const win = iframe.contentWindow
                    const doc = iframe.contentDocument
                    if (!win || !doc) throw new Error("Couldn't open the print preview.")

                    await Promise.all(
                        Array.from(doc.images).map(img =>
                            img.complete
                                ? Promise.resolve()
                                : new Promise<void>(res => {
                                      img.addEventListener("load", () => res(), { once: true })
                                      img.addEventListener("error", () => res(), { once: true })
                                  }),
                        ),
                    )

                    win.focus()
                    win.print()
                    finish()
                } catch (err) {
                    finish(err instanceof Error ? err : new Error(String(err)))
                }
            })()
        }
        iframe.onerror = () => finish(new Error("Couldn't load the chart for print."))

        document.body.appendChild(iframe)
        iframe.srcdoc = html
    })
}

/** Print a PDF blob: rasterize → own-document print. Page object URLs are
 *  revoked once the dialog has had time to read them. */
export async function printPdfBlob(blob: Blob, title: string): Promise<void> {
    const pages = await rasterizePdfToPageImages(blob)
    try {
        await printHtmlInHiddenIframe(buildPrintDocumentHtml(pages, title))
    } finally {
        setTimeout(() => pages.forEach(p => URL.revokeObjectURL(p.url)), 60000)
    }
}

/** Print an image blob (a photographed/scanned chart) through the same
 *  own-document path — no plugin, no cross-origin frame. */
export async function printImageBlob(blob: Blob, title: string): Promise<void> {
    const url = URL.createObjectURL(blob)
    const dims = await new Promise<{ w: number; h: number }>(resolve => {
        const probe = new Image()
        probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight })
        // Unknown dimensions → assume portrait; `object-fit: contain` still
        // fits the sheet, only the @page orientation guess suffers.
        probe.onerror = () => resolve({ w: 0, h: 1 })
        probe.src = url
    })
    try {
        await printHtmlInHiddenIframe(
            buildPrintDocumentHtml([{ url, widthPt: dims.w, heightPt: dims.h }], title),
        )
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
}
