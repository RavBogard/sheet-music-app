import type { Messages, UiLanguage } from "@/i18n/core"

/**
 * Multi-tenant phase 7 — the synchronous, isomorphic view of the catalogues,
 * like config-cache.ts is for tenant config.
 *
 * Server: `@/i18n/catalogues` (server-only) primes every language the moment
 * it loads, and get-org-config imports it, so any server path that resolved a
 * tenant can translate synchronously (orgString, crons, emails).
 * Browser: no catalogue is bundled. The root layout hands the active
 * language's merged messages to <I18nProvider>, which primes them here, so
 * plain functions such as `orgString` see them too. Tests prime English in
 * src/test-setup.ts so components rendered without a provider show English.
 *
 * Keyed by language, never by user, so sharing across requests is safe.
 */
const primed = new Map<UiLanguage, Messages>()

export function primeMessages(lang: UiLanguage, messages: Messages): void {
    primed.set(lang, messages)
}

export function peekMessages(lang: UiLanguage): Messages | undefined {
    return primed.get(lang)
}

/**
 * The complete catalogue as loaded from the files (server and tests only;
 * never set in the browser). The no-provider fallback of useT() reads this,
 * so a test that mounts <I18nProvider> with a handful of messages cannot
 * clobber the English every other component falls back to.
 */
const complete = new Map<UiLanguage, Messages>()

export function primeCompleteMessages(lang: UiLanguage, messages: Messages): void {
    complete.set(lang, messages)
    primed.set(lang, messages)
}

export function peekCompleteMessages(lang: UiLanguage): Messages | undefined {
    return complete.get(lang)
}

/** Test seam. */
export function clearPrimedMessages(): void {
    primed.clear()
    complete.clear()
    activeUiLanguage = null
}

/**
 * Phase 7 (lane D): the UI language the browser's <I18nProvider> is showing,
 * so plain functions that know only the tenant (orgString, label) can tell a
 * pseudo-locale is active and wrap their output like t() does. Set by the
 * provider in the browser only (never on the server, where one module serves
 * many requests); null = no provider mounted.
 */
let activeUiLanguage: UiLanguage | null = null

export function setActiveUiLanguage(lang: UiLanguage | null): void {
    activeUiLanguage = lang
}

export function peekActiveUiLanguage(): UiLanguage | null {
    return activeUiLanguage
}
