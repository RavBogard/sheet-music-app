/**
 * Identity tokens for tenant strings, split from strings-base.ts so client code
 * that only needs the tokens (the i18n provider on every page, /login) does not
 * bundle STRING_BASE and its server-only email/SMS text.
 */

/** Identity tokens a template may use. */
export interface StringTokens {
    id: string
    name: string
    shortName: string
    abbreviation: string
    host: string
}

export function interpolate(template: string, tokens: StringTokens): string {
    return template.replace(/\{(id|name|shortName|abbreviation|host)\}/g, (_, k: keyof StringTokens) => tokens[k])
}

export function tokensFor(cfg: {
    id: string
    name: string
    branding: { shortName: string; abbreviation: string }
    domains: { primary: string }
}): StringTokens {
    return {
        id: cfg.id,
        name: cfg.name,
        shortName: cfg.branding.shortName,
        abbreviation: cfg.branding.abbreviation,
        host: cfg.domains.primary,
    }
}
