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
 * Fetch all setlists server-side for the dashboard.
 * v4.0: No private/public distinction.
 */
export async function getAllSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const snap = await db
            .collection("setlists")
            .orderBy("date", "desc")
            .limit(50)
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
