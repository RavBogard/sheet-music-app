import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"

import { I18nProvider } from "@/i18n/client"
import { directionOf, type UiLanguage } from "@/i18n/core"
import { clientMessagesFor } from "@/i18n/catalogues"
import { tenantTokensOf } from "@/i18n/language"
import { isPseudoWrapped } from "@/i18n/pseudo"
import { codeOrgConfig } from "@/lib/org/config-code"
import type { OrgConfig } from "@/lib/org/config-schema"
import { OrgProvider } from "@/lib/org/org-context"

/**
 * Multi-tenant phase 7 — test helpers for translated components.
 *
 *   renderWithI18n(<SetlistCard … />, { lang: "he" })     // Hebrew, rtl, real catalogue
 *   const r = renderPseudo(<SetlistCard … />)              // every t() string wrapped ⟦…⟧
 *   expectNoUntranslatedText(r.container, { allow: [song.title] })
 *
 * The pseudo check walks every visible text node and the user-facing
 * attributes (title, aria-label, placeholder, alt, aria-description): any
 * letter outside ⟦ ⟧ did not come through t() (or a format helper). Data the
 * component shows (song titles, names) goes in `allow` (exact strings or
 * regexes) or under `ignoreSelector`.
 */

export interface I18nTestOptions {
    lang?: UiLanguage
    /** Tenant config; default CRC's code config. */
    config?: OrgConfig
}

export function I18nTestProviders({ lang = "en", config, children }: I18nTestOptions & { children: ReactNode }) {
    const cfg = config ?? codeOrgConfig("crc")!
    const overrides: Record<string, string> = { ...cfg.vocabulary.overrides }
    return (
        <OrgProvider orgId={cfg.id} config={cfg}>
            <I18nProvider
                lang={lang}
                dir={directionOf(lang)}
                timeZone={lang === "en" ? null : cfg.locale.timeZone}
                messages={clientMessagesFor(lang)}
                overrides={overrides}
                tokens={tenantTokensOf(cfg)}
            >
                <div dir={directionOf(lang)}>{children}</div>
            </I18nProvider>
        </OrgProvider>
    )
}

export function renderWithI18n(ui: ReactElement, opts: I18nTestOptions & Omit<RenderOptions, "wrapper"> = {}): RenderResult {
    const { lang, config, ...rest } = opts
    return render(ui, {
        ...rest,
        wrapper: ({ children }) => (
            <I18nTestProviders lang={lang} config={config}>
                {children}
            </I18nTestProviders>
        ),
    })
}

export function renderPseudo(ui: ReactElement, opts: { rtl?: boolean; config?: OrgConfig } & Omit<RenderOptions, "wrapper"> = {}): RenderResult {
    const { rtl, ...rest } = opts
    return renderWithI18n(ui, { ...rest, lang: rtl ? "qps-rtl" : "qps" })
}

export interface UntranslatedCheckOptions {
    /** Data text that legitimately appears untranslated (song titles, names). */
    allow?: Array<string | RegExp>
    /** Elements whose subtree is data, not UI text. */
    ignoreSelector?: string
    /** Attributes to check besides text nodes. */
    attributes?: string[]
}

const DEFAULT_ATTRS = ["title", "aria-label", "aria-description", "placeholder", "alt"]
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "KBD", "PRE", "SAMP", "NOSCRIPT"])

/** Every visible string in `root` that is not pseudo-wrapped. */
export function findUntranslatedText(root: Element, opts: UntranslatedCheckOptions = {}): string[] {
    const allow = opts.allow ?? []
    const allowed = (s: string) => allow.some((a) => (typeof a === "string" ? s.trim() === a.trim() : a.test(s)))
    const ignored = (el: Element | null) => !!(el && opts.ignoreSelector && el.closest(opts.ignoreSelector))
    const out: string[] = []
    const doc = root.ownerDocument
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement
        if (!parent || ignored(parent)) continue
        if (parent.closest("[hidden]") || [...ancestors(parent)].some((a) => SKIP_TAGS.has(a.tagName))) continue
        const text = n.textContent ?? ""
        if (!text.trim() || isPseudoWrapped(text) || allowed(text)) continue
        out.push(`text: ${JSON.stringify(text.trim())}`)
    }
    for (const el of [root, ...root.querySelectorAll("*")]) {
        if (ignored(el)) continue
        for (const attr of opts.attributes ?? DEFAULT_ATTRS) {
            const v = el.getAttribute(attr)
            if (v && v.trim() && !isPseudoWrapped(v) && !allowed(v)) out.push(`${attr}: ${JSON.stringify(v)}`)
        }
    }
    return out
}

function* ancestors(el: Element): Generator<Element> {
    for (let a: Element | null = el; a; a = a.parentElement) yield a
}

export function expectNoUntranslatedText(root: Element, opts: UntranslatedCheckOptions = {}): void {
    const found = findUntranslatedText(root, opts)
    if (found.length) {
        throw new Error(`Untranslated text under the pseudo-locale (not from t()):\n${found.join("\n")}`)
    }
}
