/**
 * Multi-tenant phase 7 — the i18n core. Pure and isomorphic (no React, no
 * Next, no Firestore), so the server (`@/i18n/server`), the client
 * (`@/i18n/client`) and plain functions (`orgString`) share one lookup.
 *
 * Keys are namespaced `ns.key`; `ns` is the catalogue file name
 * (`src/i18n/<lang>/<ns>.json`). Lookup order for a key:
 *   1. the tenant's `vocabulary.overrides[ns.key]` (any key), or for the `org`
 *      namespace the legacy un-prefixed override (`overrides[key]`, phase 1);
 *   2. the active language's catalogue;
 *   3. English (production fallback; the catalogue test fails on a gap);
 *   4. the key itself (so a typo is visible, never blank).
 * Then plural selection (`key_one` / `key_two` / `key_other` … chosen by
 * Intl.PluralRules when `vars.count` is a number), then `{var}` interpolation
 * and the tenant tokens (`{id} {name} {shortName} {abbreviation} {host}`).
 * Unknown `{placeholders}` are left as written.
 */

/** Languages a tenant can be configured in (config-schema LocaleSchema.language). */
export const TENANT_LANGUAGES = ["en", "he"] as const
export type TenantLanguage = (typeof TENANT_LANGUAGES)[number]

/**
 * Languages the UI can render in: the tenant languages plus the pseudo-locales
 * (`qps` left-to-right, `qps-rtl` right-to-left) used to find untranslated text.
 */
export const UI_LANGUAGES = ["en", "he", "qps", "qps-rtl"] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]
export type Direction = "ltr" | "rtl"

/** Flat catalogue: full key (`ns.key`, plural variants `ns.key_one`) → template. */
export type Messages = Readonly<Record<string, string>>

export type TVars = Record<string, string | number | null | undefined>
export type T = (key: string, vars?: TVars) => string

export interface TenantTokens {
    id: string
    name: string
    shortName: string
    abbreviation: string
    host: string
}

export function isUiLanguage(v: unknown): v is UiLanguage {
    return typeof v === "string" && (UI_LANGUAGES as readonly string[]).includes(v)
}

export function isTenantLanguage(v: unknown): v is TenantLanguage {
    return typeof v === "string" && (TENANT_LANGUAGES as readonly string[]).includes(v)
}

export function isPseudo(lang: UiLanguage): boolean {
    return lang === "qps" || lang === "qps-rtl"
}

/** Reading direction a language renders in. */
export function directionOf(lang: UiLanguage): Direction {
    return lang === "he" || lang === "qps-rtl" ? "rtl" : "ltr"
}

/** Value for `<html lang>`. Pseudo-locales use the reserved private-use tags. */
export function htmlLangOf(lang: UiLanguage): string {
    if (lang === "qps") return "en-XA"
    if (lang === "qps-rtl") return "ar-XB"
    return lang
}

/** BCP 47 locale the Intl formatters use for a UI language. */
export function intlLocaleOf(lang: UiLanguage): string {
    if (lang === "he") return "he-IL"
    return "en-US"
}

/** Language whose plural rules and catalogue a pseudo-locale borrows. */
export function baseLanguageOf(lang: UiLanguage): TenantLanguage {
    return lang === "he" ? "he" : "en"
}

const pluralRulesCache = new Map<string, Intl.PluralRules>()
function pluralCategory(lang: UiLanguage, n: number): Intl.LDMLPluralRule {
    const loc = intlLocaleOf(lang)
    let pr = pluralRulesCache.get(loc)
    if (!pr) {
        pr = new Intl.PluralRules(loc)
        pluralRulesCache.set(loc, pr)
    }
    return pr.select(n)
}

const TOKEN_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** Replace `{name}` placeholders from vars, then tenant tokens; unknown ones stay. */
export function interpolateVars(template: string, vars?: TVars, tokens?: TenantTokens | null): string {
    if (!template.includes("{")) return template
    return template.replace(TOKEN_RE, (whole, name: string) => {
        if (vars && Object.prototype.hasOwnProperty.call(vars, name)) {
            const v = vars[name]
            return v === null || v === undefined ? "" : String(v)
        }
        if (tokens && Object.prototype.hasOwnProperty.call(tokens, name)) {
            return tokens[name as keyof TenantTokens]
        }
        return whole
    })
}

export interface TranslatorInput {
    lang: UiLanguage
    /** Active language catalogue (for he: Hebrew; for qps: pseudo English). */
    messages: Messages
    /** English, for keys the active catalogue lacks. Omit when `messages` is already merged. */
    fallback?: Messages
    /** The tenant's `vocabulary.overrides`. */
    overrides?: Readonly<Record<string, string>>
    tokens?: TenantTokens | null
    /** Called once per key that fell back past the active catalogue (dev diagnostics, scan). */
    onMissing?: (key: string, lang: UiLanguage) => void
    /** Pseudo-locales wrap overrides too, so a tenant override is not mistaken for missing text. */
    transformOverride?: (s: string) => string
}

/** Look up a key's template; `undefined` when no source has it. */
export function lookupTemplate(input: TranslatorInput, key: string): string | undefined {
    const o = input.overrides
    if (o) {
        let ov = o[key]
        if (ov === undefined && key.startsWith("org.")) ov = o[key.slice(4)]
        if (ov !== undefined) return input.transformOverride ? input.transformOverride(ov) : ov
    }
    const hit = input.messages[key]
    if (hit !== undefined) return hit
    const fb = input.fallback?.[key]
    if (fb !== undefined) {
        input.onMissing?.(key, input.lang)
        return fb
    }
    return undefined
}

export function createTranslator(input: TranslatorInput): T {
    return (key, vars) => {
        let template: string | undefined
        const count = vars?.count
        if (typeof count === "number") {
            const cat = pluralCategory(input.lang, count)
            template =
                (count === 0 ? lookupTemplate(input, `${key}_zero`) : undefined) ??
                lookupTemplate(input, `${key}_${cat}`) ??
                lookupTemplate(input, `${key}_other`) ??
                lookupTemplate(input, key)
        } else {
            template = lookupTemplate(input, key)
        }
        if (template === undefined) {
            input.onMissing?.(key, input.lang)
            return key
        }
        return interpolateVars(template, vars, input.tokens)
    }
}

/**
 * Flatten one namespace file into full keys. Values must be strings; a nested
 * object becomes dotted keys (`{"dialog": {"title": …}}` → `ns.dialog.title`),
 * so either style works for the extraction lanes.
 */
export function flattenNamespace(ns: string, data: unknown, out: Record<string, string> = {}, prefix = ""): Record<string, string> {
    if (!data || typeof data !== "object") return out
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (k.startsWith("$")) continue // "$schema", "$comment"
        const full = prefix ? `${prefix}.${k}` : `${ns}.${k}`
        if (typeof v === "string") out[full] = v
        else if (v && typeof v === "object") flattenNamespace(ns, v, out, full)
    }
    return out
}

/** Namespace file names: lower camel or kebab, starting with a letter. */
export const NAMESPACE_RE = /^[a-z][a-zA-Z0-9-]*$/
