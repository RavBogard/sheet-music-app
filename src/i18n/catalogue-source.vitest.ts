import type { CatalogueFile } from "./catalogue-source"

/**
 * Vitest stand-in for catalogue-source.ts (aliased in vitest.config.ts):
 * Vite's `import.meta.glob` instead of `require.context`, same files.
 */
// `glob` is typed here rather than via vite/client, whose global module
// declarations would leak into the Next app's type check.
declare global {
    interface ImportMeta {
        glob(pattern: string, options: { eager: true; import: "default" }): Record<string, unknown>
    }
}

const files = import.meta.glob("./{en,he}/*.json", { eager: true, import: "default" })

export function catalogueFiles(): CatalogueFile[] {
    return Object.entries(files).flatMap(([key, data]) => {
        const m = /^\.\/(en|he)\/([a-z][a-zA-Z0-9-]*)\.json$/.exec(key)
        return m ? [{ lang: m[1], ns: m[2], data }] : []
    })
}
