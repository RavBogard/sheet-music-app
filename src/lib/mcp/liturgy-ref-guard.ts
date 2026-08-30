import { validateLiturgyRef, getRegistryEntry } from "@/lib/books/registry"
import type { LiturgyRef } from "@/lib/books/types"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/errors"

/**
 * Task 7 (liturgy outlines Phase 3) — registry-backed validation on write.
 *
 * Zod (Task 6) checks the SHAPE of a liturgyRef; only the book registry
 * knows whether the book exists and the page is inside it. This is the
 * guard that keeps a hallucinated page number off the rabbi's lectern
 * sheet — the one failure mode this feature cannot afford.
 *
 * Lives in its own neutral module (not `setlist-write.ts`, as the original
 * brief sketched) because `setlist-write.ts` already imports from
 * `server-tracks-write.ts` (addTrack/updateTrack/bulkAddTracks/
 * bulkUpdateTracks) — putting the guard in `setlist-write.ts` and having
 * `server-tracks-write.ts` import it back would create an import cycle.
 * `propose-changes.ts` also needs the guard and imports from
 * `server-tracks-write.ts` today, so a neutral module all three can import
 * from is the only cycle-free placement.
 */

/**
 * Guard a liturgyRef against the book registry before any write. Returns a
 * RichErrorEnvelope to return directly, or null when the ref is fine (or
 * absent — a guard must never reject a valid/omitted reference).
 */
export function liturgyRefGuard(ref?: LiturgyRef): RichErrorEnvelope | null {
    if (!ref) return null
    const res = validateLiturgyRef(ref)
    if (res.ok) return null
    return richError(
        res.machineCode,
        res.message,
        { liturgyRef: ref },
        "Call list_books for valid slugs, then lookup_book_page to resolve the page.",
    )
}

/** Guard a setlist-level book slug. */
export function bookSlugGuard(book?: string): RichErrorEnvelope | null {
    if (!book) return null
    if (getRegistryEntry(book)) return null
    return richError(
        "unknown_book",
        `Unknown book '${book}'.`,
        { book },
        "Call list_books for valid slugs.",
    )
}
