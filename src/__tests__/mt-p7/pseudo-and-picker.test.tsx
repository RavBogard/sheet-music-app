import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen } from "@testing-library/react"

import { LanguageSettings } from "@/components/settings/LanguageSettings"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { codeOrgConfig } from "@/lib/org/config-code"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"
import { expectNoUntranslatedText, findUntranslatedText, renderPseudo, renderWithI18n } from "@/test-utils/i18n"

function Good({ title }: { title: string }) {
    const t = useT()
    const fmt = useFormat()
    return (
        <section aria-label={t("language.title")}>
            <h2>{t("language.title")}</h2>
            <p>{t("language.hint")}</p>
            <span>{fmt.date(Date.UTC(2026, 9, 10, 12), { month: "short", day: "numeric" })}</span>
            <span className="song">{title}</span>
            <span>12 · 3</span>
        </section>
    )
}

function Bad() {
    const t = useT()
    return (
        <div>
            <p>{t("language.title")}</p>
            <button title="Close panel">Save</button>
        </div>
    )
}

describe("pseudo-locale render check (reused by the extraction lanes)", () => {
    it("passes when every visible string comes through t() / fmt, with data allowed", () => {
        const r = renderPseudo(<Good title="Blue Morning (Smith)" />)
        expect(() => expectNoUntranslatedText(r.container, { ignoreSelector: ".song" })).not.toThrow()
        expect(() => expectNoUntranslatedText(r.container, { allow: ["Blue Morning (Smith)"] })).not.toThrow()
        expect(findUntranslatedText(r.container)).toEqual(['text: "Blue Morning (Smith)"'])
    })

    it("catches raw JSX text and raw attributes", () => {
        const r = renderPseudo(<Bad />)
        expect(findUntranslatedText(r.container)).toEqual(['text: "Save"', 'title: "Close panel"'])
    })

    it("rtl pseudo renders under dir=rtl", () => {
        const r = renderPseudo(<Good title="x" />, { rtl: true })
        expect(r.container.querySelector("[dir=rtl]")).not.toBeNull()
    })
})

describe("language picker (Settings)", () => {
    afterEach(() => {
        document.cookie = "ui-lang=; Path=/; Max-Age=0"
    })

    it("is absent on CRC and BL (golden Settings unchanged)", () => {
        const a = renderWithI18n(<LanguageSettings />, { config: codeOrgConfig("crc")! })
        expect(a.container.innerHTML).toBe('<div dir="ltr"></div>')
        a.unmount()
        const b = renderWithI18n(<LanguageSettings />, { config: codeOrgConfig("brotherslazaroff")! })
        expect(b.container.innerHTML).toBe('<div dir="ltr"></div>')
    })

    it("on a Hebrew tenant offers עברית and English, in Hebrew, and sets the cookie", () => {
        const onChange = vi.fn()
        renderWithI18n(<LanguageSettings onChange={onChange} />, { lang: "he", config: makeTestOrgConfig() })
        expect(screen.getByRole("radiogroup", { name: "שפה" })).toBeTruthy()
        const he = screen.getByRole("radio", { name: "עברית" })
        const en = screen.getByRole("radio", { name: "English" })
        expect(he.getAttribute("aria-checked")).toBe("true")
        fireEvent.click(he)
        expect(onChange).not.toHaveBeenCalled()
        fireEvent.click(en)
        expect(onChange).toHaveBeenCalledWith("en")
        expect(document.cookie).toContain("ui-lang=en")
    })
})
