import { afterEach, describe, expect, it } from "vitest"
import { cleanup } from "@testing-library/react"
import { orgString } from "@/lib/org/strings"
import { label } from "@/lib/org/vocab"
import { isPseudoWrapped } from "@/i18n/pseudo"
import { peekActiveUiLanguage, setActiveUiLanguage } from "@/i18n/message-cache"
import { renderPseudo, renderWithI18n } from "@/test-utils/i18n"

/**
 * Phase 7 (lane D): under the pseudo-locale, tenant vocabulary from
 * orgString()/label() is pseudo-wrapped like t() output; real languages and
 * machine values are untouched.
 */
afterEach(() => {
    cleanup()
    setActiveUiLanguage(null)
})

function Probe() {
    return <p>{label("crc", "pastSection")}</p>
}

describe("orgString under the pseudo-locale", () => {
    it("English (no provider, or an English provider) is unchanged", () => {
        const plain = orgString("crc", "pastSection")
        expect(isPseudoWrapped(plain)).toBe(false)
        const r = renderWithI18n(<Probe />)
        expect(r.container.textContent).toBe(plain)
    })

    it("a pseudo provider wraps tenant vocabulary, and unmounting resets it", () => {
        const r = renderPseudo(<Probe />)
        expect(isPseudoWrapped(r.container.textContent ?? "")).toBe(true)
        r.unmount()
        expect(peekActiveUiLanguage()).toBeNull()
        expect(isPseudoWrapped(orgString("crc", "pastSection"))).toBe(false)
    })

    it("machine values (SEO, feed) are never wrapped", () => {
        setActiveUiLanguage("qps")
        expect(orgString("crc", "seo.baseUrl")).toMatch(/^https?:\/\//)
        expect(isPseudoWrapped(orgString("crc", "pastSection"))).toBe(true)
    })
})
