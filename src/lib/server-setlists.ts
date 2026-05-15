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

export async function getAllSetlists(opts: { limit?: number } = {}) {
    try {
        initAdmin()
        const db = getFirestore()

        const limit =
            opts.limit && opts.limit > 0
                ? Math.min(opts.limit, MAX_SETLIST_FETCH)
                : 50

        const snap = await db
            .collection("setlists")
            .orderBy("date", "desc")
            .limit(limit)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server all setlist fetch failed:", error)
        return []
    }
}

// Backward-compat aliases (deprecated — use new names)
export const getUpcomingPublicSetlists = getUpcomingSetlists
export const getRecentPublicSetlists = getRecentSetlists
export const getPersonalSetlists = (_userId: string) => getAllSetlists()
export const getAllPublicSetlists = getAllSetlists
