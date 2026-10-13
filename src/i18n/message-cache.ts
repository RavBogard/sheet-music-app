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

/** Test seam. */
export function clearPrimedMessages(): void {
    primed.clear()
}
