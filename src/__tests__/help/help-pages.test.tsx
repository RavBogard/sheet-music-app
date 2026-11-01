import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

/**
 * The Help area: one render test per route, plus guards that the catalogue
 * still says what docs/guides/*.md say (the markdown is the source of truth)
 * and that Hebrew keeps every mark the English has.
 */

const h = vi.hoisted(() => ({ lang: "en" as "en" | "he" }))

vi.mock("@/i18n/server", async () => {
    const { createTranslator } = await import("@/i18n/core")
    const { messagesFor } = await import("@/i18n/catalogues")
    return { getT: async () => createTranslator({ lang: h.lang, messages: messagesFor(h.lang) }) }
})

import { catalogues, messagesFor } from "@/i18n/catalogues"
import { createTranslator } from "@/i18n/core"
import { HELP_GUIDES, HELP_SLUGS, guideKeys, type HelpSlug } from "@/lib/help/guides"
import HelpPage from "@/app/(main)/help/page"
import MichaelPage from "@/app/(main)/help/michael/page"
import DrewPage from "@/app/(main)/help/drew/page"
import BeforePage from "@/app/(main)/help/before/page"
import AfterPage from "@/app/(main)/help/after/page"

type ServerEl = { type: (props: unknown) => Promise<React.ReactElement>; props: unknown }
const PAGES: Record<HelpSlug, () => unknown> = { michael: MichaelPage, drew: DrewPage, before: BeforePage, after: AfterPage }

/** Each page returns an async server component; await it the way Next does. */
async function renderPage(page: () => unknown) {
    const el = page() as ServerEl
    return render(await el.type(el.props))
}

beforeEach(() => {
    h.lang = "en"
})
afterEach(cleanup)

describe("/help index", () => {
    it("shows four cards, one per guide, each linking to its route", async () => {
        await renderPage(HelpPage)
        expect(screen.getByTestId("help-index")).toBeTruthy()
        expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
        for (const slug of HELP_SLUGS) {
            const card = screen.getByTestId(`help-card-${slug}`)
            expect(card.getAttribute("href")).toBe(`/help/${slug}`)
            // 44px touch target
            expect(card.className).toMatch(/min-h-(11|12|14)/)
        }
    })
})

describe("guide routes", () => {
    it.each(HELP_SLUGS)("/help/%s renders its root, a title heading and a way back", async (slug) => {
        await renderPage(PAGES[slug])
        const root = screen.getByTestId(`help-guide-${slug}`)
        expect(within(root).getByRole("heading", { level: 1 })).toBeTruthy()
        expect(screen.getByTestId("help-back").getAttribute("href")).toBe("/help")
        expect(screen.getByTestId("help-print")).toBeTruthy()
    })

    it("Michael: eight numbered steps for each iPad, with the names in code", async () => {
        await renderPage(MichaelPage)
        const root = screen.getByTestId("help-guide-michael")
        const lists = root.querySelectorAll("ol")
        expect(lists).toHaveLength(1)
        expect(lists[0].querySelectorAll("li")).toHaveLength(8)
        const code = [...root.querySelectorAll("code")].map((c) => c.textContent)
        expect(code).toContain("CRC Band 1")
        expect(code).toContain("CRC Music")
        expect(code).toContain("bridge/watchdog/INSTALL.md")
    })

    it("Drew: the Dropbox folder and file names stay as written", async () => {
        await renderPage(DrewPage)
        const code = [...screen.getByTestId("help-guide-drew").querySelectorAll("code")].map((c) => c.textContent)
        expect(code).toEqual(expect.arrayContaining(["11.07_SAT MORNING", "11.13_FRI NIGHT", "_V1", "_V2", "/monitor/engineer"]))
    })

    it("Before: two tables and tick boxes that tick on screen", async () => {
        await renderPage(BeforePage)
        const root = screen.getByTestId("help-guide-before")
        expect(root.querySelectorAll("table")).toHaveLength(2)
        const boxes = within(root).getAllByRole("checkbox") as HTMLInputElement[]
        expect(boxes).toHaveLength(10)
        expect(boxes.every((b) => !b.checked)).toBe(true)
        fireEvent.click(boxes[0])
        expect(boxes[0].checked).toBe(true)
        // the "if something's wrong" table has a header row and five rows
        const wrong = root.querySelectorAll("table")[1]
        expect(wrong.querySelectorAll("thead th")).toHaveLength(2)
        expect(wrong.querySelectorAll("tbody tr")).toHaveLength(5)
    })

    it("After: five tick boxes", async () => {
        await renderPage(AfterPage)
        expect(within(screen.getByTestId("help-guide-after")).getAllByRole("checkbox")).toHaveLength(5)
    })

    it("renders in Hebrew too, with the file names still left to right", async () => {
        h.lang = "he"
        await renderPage(DrewPage)
        const root = screen.getByTestId("help-guide-drew")
        const code = [...root.querySelectorAll("code")]
        expect(code.length).toBeGreaterThan(0)
        expect(code.every((c) => c.getAttribute("dir") === "ltr")).toBe(true)
        // no raw mark leaks into the text
        expect(root.textContent).not.toMatch(/\*\*|`/)
    })
})

describe("catalogue", () => {
    const { en, he } = catalogues()
    const keys = HELP_SLUGS.flatMap((s) => guideKeys(HELP_GUIDES[s]))

    it("every key a guide uses exists in English and in Hebrew", () => {
        expect(keys.filter((k) => !(k in en))).toEqual([])
        expect(keys.filter((k) => !(k in he))).toEqual([])
    })

    it("every English guide string is used by a guide or the index (no orphan strings)", () => {
        const all = Object.keys(en).filter((k) => k.startsWith("helpGuides."))
        const used = new Set([
            ...keys,
            "helpGuides.indexTitle",
            "helpGuides.allGuides",
            "helpGuides.printGuide",
            ...HELP_SLUGS.map((s) => HELP_GUIDES[s].cardKey),
        ])
        expect(all.filter((k) => !used.has(k))).toEqual([])
    })

    it("Hebrew keeps the same bold and code marks as English", () => {
        const marks = (s: string) => [(s.match(/\*\*/g) ?? []).length, (s.match(/`/g) ?? []).length].join()
        expect(keys.filter((k) => marks(en[k]) !== marks(he[k]))).toEqual([])
    })

    it("Hebrew keeps the Latin file names and product names", () => {
        const must = ["11.07_SAT MORNING", "11.13_FRI NIGHT", "_V1", "_V2", "X32", "Mixing Station", "Dropbox", "CRC Band 3", "CRC Music"]
        const allHe = keys.map((k) => he[k]).join("\n")
        for (const m of must) expect(allHe, m).toContain(m)
    })

    it("Hebrew uses the app's own labels where the app has them", () => {
        const t = createTranslator({ lang: "he", messages: messagesFor("he") })
        const before = keys
            .filter((k) => k.startsWith("helpGuides.before."))
            .map((k) => he[k])
            .join("\n")
        expect(before).toContain(t("settings.logOut"))
        expect(before).toContain(t("auth.setUpDevice"))
        expect(before).toContain(t("auth.approveButton"))
        expect(before).toContain(t("dashboard.onboardingPendingBody"))
        expect(before).toContain(t("perform.offline.setlistUpdated"))
    })
})

describe("the catalogue says what docs/guides/*.md say", () => {
    const FILES: Record<HelpSlug, string> = {
        michael: "michael-ipads.md",
        drew: "drew-sound.md",
        before: "pre-service.md",
        after: "post-service.md",
    }
    const norm = (s: string) => s.replace(/\s+/g, " ").trim()
    const { en } = catalogues()
    const read = (slug: HelpSlug) => readFileSync(join(process.cwd(), "docs", "guides", FILES[slug]), "utf8")

    it.each(HELP_SLUGS)("every English string of %s appears, word for word, in its markdown", (slug) => {
        const md = norm(read(slug).replace(/^# /m, ""))
        const missing = guideKeys(HELP_GUIDES[slug]).filter((k) => !md.includes(norm(en[k])))
        expect(missing).toEqual([])
    })

    it.each(HELP_SLUGS)("%s has as many tick boxes and numbered steps as its markdown", (slug) => {
        const md = read(slug)
        const g = HELP_GUIDES[slug]
        const count = (kind: "checks" | "ol") =>
            g.blocks.reduce((n, b) => (b.kind === kind ? n + b.keys.length : n), 0)
        expect(count("checks")).toBe((md.match(/^- \[ \]/gm) ?? []).length)
        expect(count("ol")).toBe((md.match(/^\d+\. /gm) ?? []).length)
    })
})
