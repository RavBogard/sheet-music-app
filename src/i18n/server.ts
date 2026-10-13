import "server-only"

import { cookies, headers } from "next/headers"
import { createTranslator, htmlLangOf, isPseudo, type Direction, type T, type TenantTokens, type UiLanguage } from "@/i18n/core"
import { clientMessagesFor, messagesFor, SERVER_ONLY_KEY_PREFIXES } from "@/i18n/catalogues"
import { createFormatter, type Formatter } from "@/i18n/format"
import { formatTimeZoneOf, LANG_COOKIE, resolveDirection, resolveUiLanguage, tenantTokensOf } from "@/i18n/language"
import { pseudoize } from "@/i18n/pseudo"
import { peekOrgConfig } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import type { OrgConfig } from "@/lib/org/config-schema"
import { getOrgConfig } from "@/lib/org/get-org-config"
import { coerceOrgId } from "@/lib/org/registry"
import { STRING_BASE } from "@/lib/org/strings-base"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 7 — `t()` for server components, route handlers and
 * server actions.
 *
 *   const t = await getT()             // the request's tenant + the user's language cookie
 *   t("setlists.title")
 *   const { t, fmt, lang, dir } = await getI18n()
 *   fmt.date(setlist.eventDate, { month: "long", day: "numeric" })
 *
 * Outside a request (crons, scripts, Inngest), pass the tenant and use the
 * synchronous `tForOrg(orgId)` after `getOrgConfig(orgId)` has primed it.
 * Platform console and MCP text stay English and do not call this.
 */

export interface I18nState {
    orgId: OrgId
    config: OrgConfig | null
    lang: UiLanguage
    dir: Direction
    /** `<html lang>` value. */
    htmlLang: string
    /** IANA zone dates format in; undefined = runtime zone (CRC/BL, as today). */
    timeZone: string | undefined
}

export interface ServerI18n extends I18nState {
    t: T
    fmt: Formatter
}

async function requestCookie(): Promise<string | null> {
    try {
        return (await cookies()).get(LANG_COOKIE)?.value ?? null
    } catch {
        return null // not in a request scope
    }
}

async function requestOrgId(): Promise<OrgId> {
    try {
        return coerceOrgId((await headers()).get("x-org-id"))
    } catch {
        return coerceOrgId(null)
    }
}

/** Language state for a tenant + an optional cookie value. Pure apart from config lookup. */
export function i18nStateFor(orgId: OrgId, config: OrgConfig | null, cookie: string | null): I18nState {
    const cfg = config ?? codeOrgConfig(orgId)
    const tenantLanguage = cfg?.locale.language ?? "en"
    const lang = resolveUiLanguage({ tenantLanguage, cookie })
    return {
        orgId,
        config: cfg,
        lang,
        dir: resolveDirection(lang, tenantLanguage, cfg?.locale.direction),
        htmlLang: htmlLangOf(lang),
        timeZone: formatTimeZoneOf(cfg),
    }
}

export function translatorFor(state: Pick<I18nState, "lang" | "config">): T {
    return createTranslator({
        lang: state.lang,
        messages: messagesFor(state.lang),
        overrides: state.config?.vocabulary.overrides,
        tokens: tenantTokensOf(state.config),
        transformOverride: isPseudo(state.lang) ? pseudoize : undefined,
    })
}

/** The request's language, translator and formatter. `orgId` defaults to the request's tenant. */
export async function getI18n(orgId?: OrgId): Promise<ServerI18n> {
    const reqOrg = await requestOrgId()
    const id = orgId ?? reqOrg
    const config = await getOrgConfig(id)
    // The cookie is host-only: it is the user's choice for THIS address's tenant.
    const cookie = id === reqOrg ? await requestCookie() : null
    const state = i18nStateFor(id, config, cookie)
    return { ...state, t: translatorFor(state), fmt: createFormatter({ lang: state.lang, timeZone: state.timeZone }) }
}

export async function getT(orgId?: OrgId): Promise<T> {
    return (await getI18n(orgId)).t
}

/** Alias of getT, for call sites that read better as "the server's t". */
export const serverT = getT

export async function getFormat(orgId?: OrgId): Promise<Formatter> {
    return (await getI18n(orgId)).fmt
}

/** Synchronous translator for a tenant in its own language (no request: crons, emails). Prime the config first. */
export function tForOrg(orgId: OrgId, lang?: UiLanguage): T {
    const config = codeOrgConfigOrPrimed(orgId)
    const state = i18nStateFor(orgId, config, lang ?? null)
    return translatorFor(lang ? { ...state, lang } : state)
}

/** What the root layout hands <I18nProvider>. */
export function clientI18nProps(state: I18nState): {
    lang: UiLanguage
    dir: Direction
    timeZone: string | null
    messages: Record<string, string>
    overrides: Record<string, string>
    tokens: TenantTokens | null
} {
    const overrides: Record<string, string> = {}
    for (const [k, v] of Object.entries(state.config?.vocabulary.overrides ?? {})) {
        // Phase 1 overrides of the org namespace are stored un-prefixed ("ai.…").
        const full = isOrgKey(k) ? `org.${k}` : k
        if (SERVER_ONLY_KEY_PREFIXES.some((p) => full.startsWith(p))) continue
        overrides[k] = v
    }
    return {
        lang: state.lang,
        dir: state.dir,
        timeZone: state.timeZone ?? null,
        messages: clientMessagesFor(state.lang),
        overrides,
        tokens: tenantTokensOf(state.config),
    }
}

function isOrgKey(k: string): boolean {
    return Object.prototype.hasOwnProperty.call(STRING_BASE, k)
}

function codeOrgConfigOrPrimed(orgId: OrgId): OrgConfig | null {
    return peekOrgConfig(orgId) ?? codeOrgConfig(orgId)
}
