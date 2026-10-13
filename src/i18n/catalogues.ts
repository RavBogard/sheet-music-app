import "server-only"

import { catalogueFiles } from "@/i18n/catalogue-source"
import { flattenNamespace, NAMESPACE_RE, type Messages, type TenantLanguage, type UiLanguage } from "@/i18n/core"
import { primeMessages } from "@/i18n/message-cache"
import { pseudoMessages } from "@/i18n/pseudo"
import { STRING_BASE } from "@/lib/org/strings-base"

/**
 * Multi-tenant phase 7 — the catalogues, assembled (server only).
 *
 *   src/i18n/en/<ns>.json   English, the source of truth
 *   src/i18n/he/<ns>.json   Hebrew
 *   src/i18n/notes/<ns>.json translator notes (tests and translators only)
 *
 * The `org` namespace is the phase 1 tenant catalogue: its English is
 * STRING_BASE (src/lib/org/strings-base.ts, typed, CRC's text), so `org.*`
 * has no en JSON file; `he/org.json` translates it.
 */

/** Keys never sent to the browser: server-only surfaces (AI prompt, feed ids, email/SMS, SEO). */
export const SERVER_ONLY_KEY_PREFIXES = ["org.ai.", "org.feed.", "org.email.", "org.sms.", "org.seo."] as const

export interface Catalogues {
    en: Messages
    he: Messages
}

function build(): Catalogues {
    const en: Record<string, string> = {}
    const he: Record<string, string> = {}
    for (const [k, v] of Object.entries(STRING_BASE)) en[`org.${k}`] = v
    for (const f of catalogueFiles()) {
        if (!NAMESPACE_RE.test(f.ns)) continue
        if (f.lang === "en" && f.ns === "org") continue // English org text lives in STRING_BASE
        flattenNamespace(f.ns, f.data, f.lang === "he" ? he : en)
    }
    return { en: Object.freeze(en), he: Object.freeze(he) }
}

let cache: Catalogues | null = null
const merged = new Map<UiLanguage, Messages>()

export function catalogues(): Catalogues {
    if (!cache) cache = build()
    return cache
}

/**
 * The full message map for a UI language: Hebrew over English (so a missing
 * Hebrew key shows English in production), English, or pseudo-English.
 */
export function messagesFor(lang: UiLanguage): Messages {
    const hit = merged.get(lang)
    if (hit) return hit
    const { en, he } = catalogues()
    let out: Messages
    if (lang === "he") out = Object.freeze({ ...en, ...he })
    else if (lang === "qps" || lang === "qps-rtl") out = Object.freeze(pseudoMessages(en))
    else out = en
    merged.set(lang, out)
    return out
}

/** The messages a page hands the browser: `messagesFor` minus the server-only keys. */
export function clientMessagesFor(lang: UiLanguage): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(messagesFor(lang))) {
        if (SERVER_ONLY_KEY_PREFIXES.some((p) => k.startsWith(p))) continue
        out[k] = v
    }
    return out
}

/** Prime the isomorphic message cache for every language (idempotent). */
export function primeAllMessages(): void {
    for (const lang of ["en", "he", "qps", "qps-rtl"] as const) primeMessages(lang, messagesFor(lang))
}

/** Language a tenant language falls back to — always English. */
export const FALLBACK_LANGUAGE: TenantLanguage = "en"

/** Test seam: rebuild after a test swaps catalogue files. */
export function resetCataloguesForTests(): void {
    cache = null
    merged.clear()
}

primeAllMessages()
