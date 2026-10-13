import { peekOrgConfig } from "@/lib/org/config-cache"
import { codeOrgConfig } from "@/lib/org/config-code"
import { STRING_BASE, interpolate, tokensFor, type StringKey } from "@/lib/org/strings-base"
import type { OrgId } from "@/lib/org/types"
import { peekCompleteMessages, peekMessages } from "@/i18n/message-cache"

export { STRING_BASE, interpolate, tokensFor, type StringKey, type StringTokens } from "@/lib/org/strings-base"

/**
 * A tenant string: the tenant's override if it has one, else the catalogue
 * text in the tenant's language, else the base template (English, CRC's text),
 * interpolated with the tenant's identity. Reads the primed config (see
 * config-cache.ts) and falls back to the code tables, then to CRC.
 *
 * Phase 7: this is a thin wrapper over the `org` namespace of the i18n
 * catalogue (`t("org.<key>")`). It is synchronous and knows only the tenant,
 * so it renders in the TENANT's language; code that has a request (and so the
 * user's language choice) can call `t("org.<key>")` from useT()/getT() instead.
 * For an English tenant (CRC, BL) the output is exactly what it was.
 */
export function orgString(orgId: OrgId, key: StringKey): string {
    const cfg = peekOrgConfig(orgId) ?? codeOrgConfig(orgId) ?? codeOrgConfig("crc")!
    const override = cfg.vocabulary.overrides[key]
    let template: string | undefined = override
    if (template === undefined && cfg.locale.language !== "en") {
        // Server: the complete catalogue (SSR of <I18nProvider> primes the
        // client subset into the plain cache). Browser: what the provider primed.
        const lang = cfg.locale.language
        template = (peekCompleteMessages(lang) ?? peekMessages(lang))?.[`org.${key}`]
    }
    return interpolate(template ?? STRING_BASE[key], tokensFor(cfg))
}
