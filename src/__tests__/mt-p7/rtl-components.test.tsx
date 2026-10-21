import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

import { ChartContent } from "@/components/i18n/ChartContent"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { ImageScoreViewer } from "@/components/music/ImageScoreViewer"
import { I18nProvider, readingDirection, useReadingDirection, useT } from "@/i18n/client"
import type { Direction, UiLanguage } from "@/i18n/core"

function wrap(lang: UiLanguage, dir: Direction, messages: Record<string, string> = {}) {
    return function LanguageWrapper({ children }: { children: ReactNode }) {
        return (
            <I18nProvider lang={lang} dir={dir} timeZone={null} messages={messages}>
                {children}
            </I18nProvider>
        )
    }
}

describe("ChartContent / chart renderers keep their own direction", () => {
    it("ltr page: no dir attribute (English DOM unchanged)", () => {
        const { container } = render(<ChartContent data-testid="c">x</ChartContent>, { wrapper: wrap("en", "ltr") })
        expect(container.querySelector("[data-testid=c]")!.hasAttribute("dir")).toBe(false)
    })

    it("rtl page: dir=ltr on the chart box", () => {
        const { container } = render(<ChartContent data-testid="c">x</ChartContent>, { wrapper: wrap("he", "rtl") })
        expect(container.querySelector("[data-testid=c]")!.getAttribute("dir")).toBe("ltr")
    })

    it("ImageScoreViewer's scroller: no dir on ltr, dir=ltr on rtl", () => {
        const a = render(<ImageScoreViewer url="https://example.test/a.png" alt="chart" />, { wrapper: wrap("en", "ltr") })
        expect(a.container.querySelector("[data-image-scroll]")!.hasAttribute("dir")).toBe(false)
        a.unmount()
        const b = render(<ImageScoreViewer url="https://example.test/a.png" alt="chart" />, { wrapper: wrap("he", "rtl") })
        expect(b.container.querySelector("[data-image-scroll]")!.getAttribute("dir")).toBe("ltr")
    })
})

describe("DirectionalIcon", () => {
    it("adds no class on ltr, mirrors on rtl", () => {
        const a = render(<DirectionalIcon icon={ChevronRight} className="w-4 h-4" data-testid="i" />, { wrapper: wrap("en", "ltr") })
        expect(a.getByTestId("i").getAttribute("class")).not.toMatch(/scale-x/)
        a.unmount()
        const b = render(<DirectionalIcon icon={ChevronRight} className="w-4 h-4" data-testid="i" />, { wrapper: wrap("he", "rtl") })
        expect(b.getByTestId("i").getAttribute("class")).toMatch(/-scale-x-100/)
    })
})

describe("useReadingDirection", () => {
    it("forward is ArrowRight in ltr, ArrowLeft in rtl", () => {
        expect(readingDirection("ltr")).toMatchObject({ forwardKey: "ArrowRight", backKey: "ArrowLeft", forwardSwipeSign: -1 })
        expect(readingDirection("rtl")).toMatchObject({ forwardKey: "ArrowLeft", backKey: "ArrowRight", forwardSwipeSign: 1 })
        expect(readingDirection("ltr").stepFor("right")).toBe(1)
        expect(readingDirection("rtl").stepFor("right")).toBe(-1)
        function Probe() {
            return <span>{useReadingDirection().forwardKey}</span>
        }
        render(<Probe />, { wrapper: wrap("he", "rtl") })
        expect(screen.getByText("ArrowLeft")).toBeTruthy()
    })
})

describe("useT without a provider falls back to English (tests, isolated renders)", () => {
    it("renders the English catalogue", () => {
        function Probe() {
            return <span>{useT()("common.skipToMain")}</span>
        }
        render(<Probe />)
        expect(screen.getByText("Skip to main content")).toBeTruthy()
    })
})
