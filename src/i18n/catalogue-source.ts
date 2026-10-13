/**
 * Multi-tenant phase 7 — where the catalogue files come from (bundler build).
 *
 * `require.context` is resolved by webpack (`next build --webpack`, the
 * production build) and by Turbopack (`next dev`): every
 * `src/i18n/<lang>/<ns>.json` is bundled into the SERVER code that imports
 * this module, with no list to maintain. Adding a namespace file never edits a
 * shared file. Vitest has no `require.context`; vitest.config.ts aliases this
 * module to `catalogue-source.vitest.ts` (`import.meta.glob`, same contract).
 *
 * Only `@/i18n/catalogues` (server-only) imports this; the browser never
 * bundles a catalogue (the layout hands it the active language's messages).
 */
export interface CatalogueFile {
    lang: string
    ns: string
    data: unknown
}

const ctx = require.context("./", true, /^\.\/(en|he)\/[a-z][a-zA-Z0-9-]*\.json$/)

export function catalogueFiles(): CatalogueFile[] {
    return ctx.keys().map((key) => {
        const m = /^\.\/(en|he)\/([a-z][a-zA-Z0-9-]*)\.json$/.exec(key)!
        const mod = ctx(key) as { default?: unknown } | unknown
        const data = mod && typeof mod === "object" && "default" in (mod as object) ? (mod as { default: unknown }).default : mod
        return { lang: m[1], ns: m[2], data }
    })
}
