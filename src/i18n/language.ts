import { directionOf, isPseudo, isUiLanguage, type Direction, type TenantLanguage, type TenantTokens, type UiLanguage } from "@/i18n/core"
import type { OrgConfig } from "@/lib/org/config-schema"
import { tokensFor } from "@/lib/org/string-tokens"

/**
 * Multi-tenant phase 7 — which language a request renders in. Isomorphic.
 *
 * The tenant's `locale.language` is the default. A user may override it with
 * the `ui-lang` cookie (set by the language picker in Settings). The cookie is
 * host-only, so it belongs to the tenant whose address set it, it needs no
 * Firestore read or rule, and the server reads it before the first byte.
 * Only the tenant's language or English is honoured: on an English tenant
 * (CRC, BL) no cookie can change anything. The pseudo-locales (`qps`,
 * `qps-rtl`) are honoured only outside production or when I18N_PSEUDO=1, and
 * I18N_PSEUDO_LOCALE=qps|qps-rtl forces one in dev.
 */
export const LANG_COOKIE = "ui-lang"
export const LANG_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365

export function pseudoAllowed(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.I18N_PSEUDO === "1"
}

export interface LanguageInput {
    tenantLanguage: TenantLanguage
    tenantDirection?: Direction
    cookie?: string | null
}

export function resolveUiLanguage({ tenantLanguage, cookie }: LanguageInput): UiLanguage {
    const forced = process.env.I18N_PSEUDO_LOCALE
    if (pseudoAllowed() && isUiLanguage(forced) && isPseudo(forced)) return forced
    if (isUiLanguage(cookie)) {
        if (isPseudo(cookie)) return pseudoAllowed() ? cookie : tenantLanguage
        if (cookie === tenantLanguage || cookie === "en") return cookie
    }
    return tenantLanguage
}

/** The tenant's configured direction when rendering its own language, else the language's. */
export function resolveDirection(lang: UiLanguage, tenantLanguage: TenantLanguage, tenantDirection?: Direction): Direction {
    if (lang === tenantLanguage && tenantDirection) return tenantDirection
    return directionOf(lang)
}

/** Languages the Settings picker offers a tenant: its own and English. Empty = no picker. */
export function pickerLanguages(tenantLanguage: TenantLanguage): TenantLanguage[] {
    return tenantLanguage === "en" ? [] : [tenantLanguage, "en"]
}

/** Endonyms for the picker; deliberately not translated (each language names itself). */
export const LANGUAGE_ENDONYMS: Record<TenantLanguage, string> = { en: "English", he: "עברית" }

/**
 * The zone dates are formatted in. `locale.formatTimeZone` decides when set;
 * absent, an English tenant keeps today's behaviour (the runtime zone: the
 * viewer's browser, the server's zone for server-rendered text — CRC and BL
 * output unchanged) and any other tenant uses its own zone (a Hebrew tenant
 * sees Asia/Jerusalem wherever the viewer is). `undefined` = runtime zone.
 */
export function formatTimeZoneOf(cfg: Pick<OrgConfig, "locale"> | null | undefined): string | undefined {
    if (!cfg) return undefined
    const mode = cfg.locale.formatTimeZone ?? (cfg.locale.language === "en" ? "runtime" : "tenant")
    return mode === "tenant" ? cfg.locale.timeZone : undefined
}

export function tenantTokensOf(cfg: OrgConfig | null | undefined): TenantTokens | null {
    return cfg ? tokensFor(cfg) : null
}
