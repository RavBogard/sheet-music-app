import registryJson from "@/data/books/registry.json"
import type { BookRegistryEntry } from "./types"

/**
 * Slug → display title, for surfaces that must NAME a book without needing
 * its contents.
 *
 * Deliberately separate from `./registry`, which statically imports all five
 * book JSON files (~80KB) so the MCP tools can resolve page lookups on the
 * server. Client components must import THIS module, never that one.
 * `registry.json` is a small array of {slug, title, tier, pages, source}.
 */
const TITLES: Readonly<Record<string, string>> = Object.freeze(
    Object.fromEntries(
        (registryJson as BookRegistryEntry[]).map((b) => [b.slug, b.title])
    )
)

export function bookTitle(slug: string | undefined): string | undefined {
    if (!slug) return undefined
    return TITLES[slug]
}
