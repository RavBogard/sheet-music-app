import fs from "node:fs"
import path from "node:path"

/**
 * Headless-Chromium renderer for authored charts.
 *
 * Runs the SAME engine the Cowork renderer (`tools/crc_chart/chart_lib.py`)
 * used — Chromium print-to-PDF of the house-style HTML — so what Claude drafts
 * in a chat renders byte-for-byte like the charts Daniel has already approved.
 * DejaVu Sans is bundled and inlined as `@font-face` so the server never falls
 * back to a different typeface (Vercel's Chromium ships almost no fonts).
 *
 * Lives in its own route (`/api/render/chart`) so the ~65 MB Chromium binary
 * is a separate serverless function, not part of `/api/mcp`.
 *
 * Local dev on Windows/macOS: set `CHART_RENDER_CHROME_PATH` to a Chrome/Edge
 * executable; `@sparticuz/chromium` only ships a Linux binary.
 */

export type RenderFormat = "pdf" | "png"

/** Shared secret for /api/render/chart: RENDER_SECRET, else CRON_SECRET (like the intake executor). */
export function renderSecret(
    source: Record<string, string | undefined> = process.env,
): string | undefined {
    return source.RENDER_SECRET ?? source.CRON_SECRET
}

export interface RenderRequest {
    html: string
    format: RenderFormat
    /** PNG only — CSS pixels of page width. Letter @ 96 dpi = 816. */
    widthPx?: number
    /** PNG only — device scale factor. 2 = retina-crisp for chat previews. */
    scale?: number
}

export interface RenderResult {
    bytes: Buffer
    mimeType: "application/pdf" | "image/png"
    /** Chromium's own idea of how many Letter pages the document is. */
    pageCount: number
    renderMs: number
}

const FONT_DIR = path.join(process.cwd(), "src", "lib", "chart-render", "fonts")

const FONT_FACES: Array<{ file: string; weight: number; style: "normal" | "italic" }> = [
    { file: "DejaVuSans.ttf", weight: 400, style: "normal" },
    { file: "DejaVuSans-Bold.ttf", weight: 700, style: "normal" },
    { file: "DejaVuSans-Oblique.ttf", weight: 400, style: "italic" },
    { file: "DejaVuSans-BoldOblique.ttf", weight: 700, style: "italic" },
]

let fontCssCache: string | null = null

/** `@font-face` rules with the TTFs inlined as data URIs. Cached per process. */
export function fontFaceCss(): string {
    if (fontCssCache) return fontCssCache
    const rules = FONT_FACES.map(({ file, weight, style }) => {
        const b64 = fs.readFileSync(path.join(FONT_DIR, file)).toString("base64")
        return `@font-face{font-family:"DejaVu Sans";font-weight:${weight};font-style:${style};src:url(data:font/ttf;base64,${b64}) format("truetype");}`
    })
    fontCssCache = rules.join("\n")
    return fontCssCache
}

/** Prepend the font rules inside <head> (or at the top when there is no head). */
export function injectFonts(html: string, opts: { pngPageMargins?: boolean } = {}): string {
    // Screenshots ignore @page margins; pad the body so a PNG preview shows
    // the same whitespace the printed Letter page will have.
    const pad = opts.pngPageMargins
        ? "<style data-crc-preview>body{padding:0.72in 0.8in 0.6in 0.8in;width:8.5in;min-height:11in;background:#fff}.ft{position:static;margin-top:24px}</style>"
        : ""
    const style = `<style data-crc-fonts>${fontFaceCss()}</style>${pad}`
    const headIdx = html.search(/<head[^>]*>/i)
    if (headIdx >= 0) {
        const end = html.indexOf(">", headIdx) + 1
        return html.slice(0, end) + style + html.slice(end)
    }
    return style + html
}

/**
 * Count pages in a PDF by its /Type /Page objects. Cheap and adequate for the
 * small single-stream PDFs Chromium emits; we only surface it as advice.
 */
export function countPdfPages(pdf: Buffer): number {
    const text = pdf.toString("latin1")
    const matches = text.match(/\/Type\s*\/Page(?![s\w])/g)
    return matches ? matches.length : 1
}

async function launchBrowser() {
    const puppeteer = await import("puppeteer-core")
    const localPath = process.env.CHART_RENDER_CHROME_PATH
    if (localPath) {
        return puppeteer.default.launch({
            executablePath: localPath,
            headless: true,
            args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
        })
    }
    const chromium = (await import("@sparticuz/chromium")).default
    return puppeteer.default.launch({
        args: [...chromium.args, "--font-render-hinting=none"],
        executablePath: await chromium.executablePath(),
        headless: true,
    })
}

export async function renderChartHtml(req: RenderRequest): Promise<RenderResult> {
    const started = Date.now()
    const html = injectFonts(req.html, { pngPageMargins: req.format === "png" })
    const browser = await launchBrowser()
    try {
        const page = await browser.newPage()
        if (req.format === "png") {
            await page.setViewport({
                width: req.widthPx ?? 816,
                height: 1056,
                deviceScaleFactor: req.scale ?? 2,
            })
        }
        await page.setContent(html, { waitUntil: "load" })
        await page.evaluateHandle("document.fonts.ready")

        if (req.format === "pdf") {
            const pdf = Buffer.from(
                await page.pdf({
                    format: "letter",
                    printBackground: true,
                    preferCSSPageSize: true,
                }),
            )
            return {
                bytes: pdf,
                mimeType: "application/pdf",
                pageCount: countPdfPages(pdf),
                renderMs: Date.now() - started,
            }
        }

        // PNG preview: render the PDF pagination faithfully by printing to PDF
        // first for the page count, then screenshotting the page with print
        // media emulation so @page margins and page-break rules apply.
        const pdfForCount = Buffer.from(
            await page.pdf({ format: "letter", printBackground: true, preferCSSPageSize: true }),
        )
        await page.emulateMediaType("print")
        const png = Buffer.from(await page.screenshot({ fullPage: true, type: "png" }))
        return {
            bytes: png,
            mimeType: "image/png",
            pageCount: countPdfPages(pdfForCount),
            renderMs: Date.now() - started,
        }
    } finally {
        await browser.close().catch(() => undefined)
    }
}

/** A tiny house-style sample used by the route's self-test. */
export const SELFTEST_HTML = `<html><head><meta charset="utf-8"><style>
@page{size:Letter;margin:0.72in 0.8in 0.6in 0.8in}
body{font-family:"DejaVu Sans",sans-serif;color:#141414;margin:0}
h1{font-size:34px;margin:0}.c{color:#9C2B1E;font-weight:700;font-size:12.5px}
</style></head><body><h1>Render self-test</h1>
<p>B♭ · A♭ · E♭ · ♯ — שָׁלוֹם — “quotes” … ok</p>
<p><span class="c">Cm</span> Modeh ani l'fanecha</p></body></html>`
