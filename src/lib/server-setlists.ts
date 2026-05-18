import { initAdmin } from "@/lib/firebase-admin"
import { getFirestore } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"
import { serializeSetlist } from "@/lib/server-auth"

/**
 * Fetch upcoming setlists server-side for instant SSR.
 * Returns the next 5 upcoming setlists.
 * v4.0: No private/public distinction — all setlists are accessible.
 */
export async function getUpcomingSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const now = new Date()
        now.setHours(0, 0, 0, 0)

        const snap = await db
            .collection("setlists")
            .where("eventDate", ">=", now)
            .orderBy("eventDate", "asc")
            .limit(5)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server setlist fetch failed:", error)
        return []
    }
}

/**
 * Fetch recent setlists (for users with no upcoming events).
 */
export async function getRecentSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const snap = await db
            .collection("setlists")
            .orderBy("date", "desc")
            .limit(5)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server recent setlist fetch failed:", error)
        return []
    }
}

/**
 * Fetch setlists server-side for the dashboard and the MCP list_setlists
 * read tool, ordered by `date` descending. Default cap 50 (dashboard
 * fits on one screen, no scroll-paging needed); MCP callers can raise it
 * via `opts.limit` up to MAX_SETLIST_FETCH for paging through larger
 * archives.
 *
 * Cowork CF1 UAT (2026-05-15, §7.7) flagged that David has 41 setlists
 * total but `list_setlists` only ever returned the first 20; raising the
 * MCP-side cap was useless because the underlying query was hard-capped
 * at 50. Now the cap floats up to 200 so a band leader doing a multi-
 * month historical review via Claude can actually see all the entries
 * without having to thread `from`/`to` windows.
 */
export const MAX_SETLIST_FETCH = 200

/**
 * Optional Firestore ordering field. `date` (write timestamp, default —
 * preserves SSR + list_setlists historical behavior) vs. `eventDate` (the
 * actual service day, what David's "next service to plan" lookups want).
 * Cycle-5 C5C-010 — list_setlists exposes a `sort` arg that flows here.
 */
export type AllSetlistsOrderBy = "date" | "eventDate"

export async function getAllSetlists(
    opts: { limit?: number; orderBy?: AllSetlistsOrderBy } = {},
) {
    try {
        initAdmin()
        const db = getFirestore()

        const limit =
            opts.limit && opts.limit > 0
                ? Math.min(opts.limit, MAX_SETLIST_FETCH)
                : 50
        const orderBy: AllSetlistsOrderBy = opts.orderBy ?? "date"

        const snap = await db
            .collection("setlists")
            .orderBy(orderBy, "desc")
            .limit(limit)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server all setlist fetch failed:", error)
        return []
    }
}

/**
 * Cycle-3.5 P2-004 — cursor-paginated `setlists` fetch.
 *
 * The legacy `getAllSetlists` (above) returns up to 50/200 setlists in
 * one shot and is consumed by SSR + the MCP `list_setlists` tool. As
 * David's archive grows past the 50-cap (CF1 UAT 2026-05-15 found 41
 * already), a paged fetch lets the /setlists dashboard ship page-1
 * over the wire and load older pages on demand without changing
 * `getAllSetlists`'s shape.
 *
 * Cursor encoding: the ISO-string `date` of the last item on the
 * previous page. `startAfter(Date)` accepts a JS Date directly against
 * an `orderBy('date', 'desc')` query. When the last item lacks `date`
 * (legacy seed data — uncommon but possible), we close the page
 * (`nextCursor: null`) rather than risk an undefined cursor.
 *
 * Page size defaults to 50; callers can request smaller pages on
 * follow-up fetches but the upper cap stays `MAX_SETLIST_FETCH`.
 */

export interface SetlistsPage {
    items: ReturnType<typeof serializeSetlist>[]
    nextCursor: string | null
}

export async function getSetlistsPage(opts: {
    cursor?: string | null
    pageSize?: number
} = {}): Promise<SetlistsPage> {
    try {
        initAdmin()
        const db = getFirestore()

        const pageSize =
            opts.pageSize && opts.pageSize > 0
                ? Math.min(opts.pageSize, MAX_SETLIST_FETCH)
                : 50

        let q = db
            .collection("setlists")
            .orderBy("date", "desc")
            .limit(pageSize + 1) // +1 sentinel so we know if a next page exists

        if (opts.cursor) {
            const cursorDate = new Date(opts.cursor)
            if (!Number.isNaN(cursorDate.getTime())) {
                q = q.startAfter(cursorDate)
            }
        }

        const snap = await q.get()
        const docs = snap.docs.slice(0, pageSize)
        const items = docs.map((d) => serializeSetlist(d.id, d.data()))

        const hasMore = snap.docs.length > pageSize
        const lastItem = items[items.length - 1] as
            | { date?: string }
            | undefined
        const nextCursor =
            hasMore && typeof lastItem?.date === "string"
                ? lastItem.date
                : null

        return { items, nextCursor }
    } catch (error) {
        logger.warn("Server paged setlist fetch failed:", error)
        return { items: [], nextCursor: null }
    }
}

// Backward-compat aliases (deprecated — use new names)
export const getUpcomingPublicSetlists = getUpcomingSetlists
export const getRecentPublicSetlists = getRecentSetlists
export const getPersonalSetlists = (_userId: string) => getAllSetlists()
export const getAllPublicSetlists = getAllSetlists
