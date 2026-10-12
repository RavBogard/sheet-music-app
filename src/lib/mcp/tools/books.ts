/**
 * Task 8 (liturgy outlines phase 1-3) — read-only MCP tools that let an
 * agent discover which liturgy books are registered and resolve a prayer
 * name to a printed page number, so a setlist's liturgyRef is always
 * looked up rather than hand-typed.
 *
 * These are read-only and take no uid, but keep the plain-args signature
 * shape used by neighbouring read handlers for consistency.
 */
import { listBooks } from "@/lib/books/registry"
import { lookupBookPage, type BookMatch } from "@/lib/books/lookup"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { bookSlugsFor } from "@/lib/org/tenant-lists"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

export interface ListBooksOk {
    ok: true
    books: Array<{ slug: string; title: string; tier: "feed" | "pagemap"; pages: number }>
}

/**
 * Multi-tenant phase 1: the caller's tenant's books (liturgy.books), in
 * registry order; every registered book when the tenant lists none.
 */
export function listBooksTool(orgId: OrgId = DEFAULT_ORG_ID): ListBooksOk {
    const own = bookSlugsFor(orgId)
    const books = own ? listBooks().filter((b) => own.includes(b.slug)) : listBooks()
    return {
        ok: true,
        books: books.map(({ slug, title, tier, pages }) => ({ slug, title, tier, pages })),
    }
}

export interface LookupBookPageArgs {
    book: string
    query: string
}

/**
 * `totalMatches` / `truncated` mirror `lookupBookPage`'s `LookupResult` — the
 * count BEFORE truncation and whether the returned `matches` (capped at
 * MAX_MATCHES) were cut off. These MUST reach the wire: dropping them would
 * silently hide a 9th candidate from the caller, defeating the point of the
 * truncation signal.
 */
export interface LookupBookPageOk {
    ok: true
    book: string
    query: string
    matches: BookMatch[]
    totalMatches: number
    truncated: boolean
}

export function lookupBookPageTool(
    args: LookupBookPageArgs,
): LookupBookPageOk | RichErrorEnvelope {
    const res = lookupBookPage(args.book, args.query)
    if (!res.ok) {
        return richError(
            res.machineCode,
            res.message,
            { book: args.book },
            "Call list_books for valid slugs.",
        )
    }
    return {
        ok: true,
        book: args.book,
        query: args.query,
        matches: res.matches,
        totalMatches: res.totalMatches,
        truncated: res.truncated,
    }
}
