import { getBook, validateLiturgyRef } from "@/lib/books/registry"
import { momentIdForUnit, occurrencesForMoment } from "@/lib/books/moments"
import type { LiturgyRef } from "@/lib/books/types"
import { matchLiturgyTitle } from "./match"

/**
 * A-W4' — re-resolve a row's page when the service changes book.
 *
 * Daniel picks a different siddur for a service and every page number on every
 * row is now about a book nobody is holding. The row still means the same
 * moment; only the paper changed.
 *
 * THE RULE THAT MATTERS: a page is never DROPPED and never GUESSED. If this
 * cannot resolve the moment in the new book, the old ref stays exactly as it
 * was and is marked `stale` — which is honest ("this number is about the other
 * book") in a way that a blank row and a plausible wrong number both are not.
 * Daniel typed some of these by hand, and a re-resolve that silently discarded
 * his work would be the worst outcome of the three.
 *
 * Four ways to find the moment in the new book, strongest first:
 *
 *   1. The same unit id. Unit ids are binding identity (Ruling 8), and the
 *      nine shared `@shabbat-maariv` ids in the Shabbat-morning draft are
 *      exactly this case.
 *   2. The MOMENT the unit belongs to, via `moments.json`. A unit id is
 *      book-local; a moment id is not. This is what Part E was for, and it is
 *      the path that carries Mi Chamocha from a draft to a printed volume.
 *   3. The row's TITLE against the new book's liturgy lookup — clear matches
 *      only, the same bar `propose_liturgy_bindings` uses. This is how a
 *      legacy booklet, which has no unit ids at all, gets resolved.
 *   4. Nothing. Keep the old ref, mark it stale, report it.
 */

export type RebookHow = "unit-id" | "moment" | "title"

export type RebookOutcome =
    | { status: "resolved"; ref: LiturgyRef; how: RebookHow }
    /** Could not be found in the new book. The OLD ref is returned untouched. */
    | { status: "stale"; ref: LiturgyRef; reason: string }

function refFor(book: string, folio: number, unitId?: string): LiturgyRef | null {
    const withId = unitId ? { book, unitId, folio } : { book, folio }
    if (validateLiturgyRef(withId).ok) return withId
    // A unit id belongs to the book that defines it; a legacy pagemap has
    // none. Keep the page, drop the id — same reasoning as the binding tool.
    const pageOnly = { book, folio }
    return validateLiturgyRef(pageOnly).ok ? pageOnly : null
}

export function rebookLiturgyRef(
    current: LiturgyRef,
    toBook: string,
    title: string | null | undefined,
): RebookOutcome {
    if (!toBook || toBook === current.book) {
        return { status: "resolved", ref: current, how: "unit-id" }
    }

    // 1 — the same unit id, if the new book defines it.
    if (current.unitId) {
        const unit = getBook(toBook)?.units?.find((u) => u.id === current.unitId)
        const folio = unit?.folios?.[0]
        if (typeof folio === "number") {
            const ref = refFor(toBook, folio, current.unitId)
            if (ref) return { status: "resolved", ref, how: "unit-id" }
        }
    }

    // 2 — the moment behind the unit, printed somewhere in the new book.
    const momentId = momentIdForUnit(current.unitId)
    if (momentId) {
        for (const o of occurrencesForMoment(momentId, toBook)) {
            const folio = o.folios?.[0]
            if (typeof folio !== "number") continue
            const ref = refFor(toBook, folio, o.unitId)
            if (ref) return { status: "resolved", ref, how: "moment" }
        }
    }

    // 3 — the row's own name, at the binding tool's bar. Never a plausible
    // match: a page arrived at by guessing is the thing being avoided.
    if (title) {
        const m = matchLiturgyTitle(toBook, title)
        if (m.clear && typeof m.clear.entry.folio === "number") {
            const ref = refFor(toBook, m.clear.entry.folio, m.clear.entry.unitId)
            if (ref) return { status: "resolved", ref, how: "title" }
        }
    }

    return {
        status: "stale",
        ref: current,
        reason: momentId
            ? `'${title || current.unitId}' is not printed in '${toBook}'.`
            : `Nothing in '${toBook}' matches '${title || current.unitId || current.folio}'.`,
    }
}

export interface RebookRowInput {
    id: string
    title?: string | null
    liturgyRef?: LiturgyRef | null
}

export interface RebookReport {
    /** Rows whose page moved. */
    resolved: Array<{ rowId: string; title: string; from: number; to: number; how: RebookHow }>
    /** Rows kept as they were, now marked stale. */
    unresolved: Array<{ rowId: string; title: string; folio: number; book: string; reason: string }>
}

/**
 * Re-resolve every bound row of a setlist against a new book.
 *
 * Pure: returns what to write and what to report, and writes nothing.
 */
export function rebookRows(
    rows: RebookRowInput[],
    toBook: string,
): RebookReport & { writes: Array<{ rowId: string; ref: LiturgyRef; stale: boolean }> } {
    const report: RebookReport & {
        writes: Array<{ rowId: string; ref: LiturgyRef; stale: boolean }>
    } = { resolved: [], unresolved: [], writes: [] }

    for (const row of rows) {
        const ref = row.liturgyRef
        if (!ref || typeof ref.folio !== "number" || !ref.book) continue
        const title = row.title ?? ""
        const out = rebookLiturgyRef(ref, toBook, title)
        if (out.status === "resolved") {
            if (out.ref.book === ref.book && out.ref.folio === ref.folio) continue
            report.resolved.push({
                rowId: row.id,
                title,
                from: ref.folio,
                to: out.ref.folio,
                how: out.how,
            })
            report.writes.push({ rowId: row.id, ref: out.ref, stale: false })
        } else {
            report.unresolved.push({
                rowId: row.id,
                title,
                folio: ref.folio,
                book: ref.book,
                reason: out.reason,
            })
            report.writes.push({ rowId: row.id, ref: out.ref, stale: true })
        }
    }
    return report
}
