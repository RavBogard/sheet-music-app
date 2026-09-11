import { describe, expect, it } from "vitest"
import {
    countPdfPages,
    fontFaceCss,
    injectFonts,
    renderChartHtml,
    renderSecret,
    SELFTEST_HTML,
} from "@/lib/chart-render/html-to-pdf"

describe("renderSecret", () => {
    it("prefers RENDER_SECRET and falls back to CRON_SECRET", () => {
        expect(renderSecret({ RENDER_SECRET: "r", CRON_SECRET: "c" })).toBe("r")
        expect(renderSecret({ CRON_SECRET: "c" })).toBe("c")
        expect(renderSecret({})).toBeUndefined()
    })
})

describe("fonts", () => {
    it("inlines all four DejaVu faces as data URIs", () => {
        const css = fontFaceCss()
        expect(css.match(/@font-face/g)?.length).toBe(4)
        expect(css).toContain("font-weight:700;font-style:italic")
        expect(css).toContain("data:font/ttf;base64,")
    })
    it("injects the font style right after <head>, or at the top without one", () => {
        const withHead = injectFonts("<html><head><meta charset='utf-8'></head><body>x</body></html>")
        expect(withHead.indexOf("<style data-crc-fonts>")).toBe("<html><head>".length)
        const noHead = injectFonts("<p>x</p>")
        expect(noHead.startsWith("<style data-crc-fonts>")).toBe(true)
        expect(noHead.endsWith("<p>x</p>")).toBe(true)
    })
})

describe("countPdfPages", () => {
    it("counts /Type /Page objects and ignores /Pages", () => {
        const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Pages /Kids [] >>\n2 0 obj << /Type /Page >>\n3 0 obj << /Type /Page >>", "latin1")
        expect(countPdfPages(pdf)).toBe(2)
    })
    it("returns 1 when nothing matches", () => {
        expect(countPdfPages(Buffer.from("%PDF-1.4"))).toBe(1)
    })
})

// Real Chromium render — runs only where a browser binary is available
// (CHART_RENDER_CHROME_PATH locally; production proves itself via ?selftest=1).
const chrome = process.env.CHART_RENDER_CHROME_PATH
describe.skipIf(!chrome)("renderChartHtml (real browser)", () => {
    it("renders the self-test sample to a one-page PDF and a PNG", async () => {
        const pdf = await renderChartHtml({ html: SELFTEST_HTML, format: "pdf" })
        expect(pdf.mimeType).toBe("application/pdf")
        expect(pdf.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-")
        expect(pdf.pageCount).toBe(1)

        const png = await renderChartHtml({ html: SELFTEST_HTML, format: "png", scale: 1 })
        expect(png.mimeType).toBe("image/png")
        expect(png.bytes.subarray(1, 4).toString("latin1")).toBe("PNG")
        expect(png.pageCount).toBe(1)
    }, 60_000)
})
