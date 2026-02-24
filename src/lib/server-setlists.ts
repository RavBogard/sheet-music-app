import { initAdmin } from "@/lib/firebase-admin"
import { getFirestore } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"
import { serializeSetlist } from "@/lib/server-auth"

/**
 * Fetch public setlists server-side for instant SSR.
 * Returns the next 5 upcoming public setlists.
 */
export async function getUpcomingPublicSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const now = new Date()
        now.setHours(0, 0, 0, 0)

        const snap = await db
            .collection("setlists")
            .where("isPublic", "==", true)
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
 * Fetch recent public setlists (for users with no upcoming events).
 */
export async function getRecentPublicSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const snap = await db
            .collection("setlists")
            .where("isPublic", "==", true)
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
 * Fetch a user's personal setlists server-side.
 */
export async function getPersonalSetlists(userId: string) {
    try {
        initAdmin()
        const db = getFirestore()

        const snap = await db
            .collection("setlists")
            .where("ownerId", "==", userId)
            .orderBy("date", "desc")
            .limit(50)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server personal setlist fetch failed:", error)
        return []
    }
}

/**
 * Fetch all recent public setlists server-side for the dashboard.
 */
export async function getAllPublicSetlists() {
    try {
        initAdmin()
        const db = getFirestore()

        const snap = await db
            .collection("setlists")
            .where("isPublic", "==", true)
            .orderBy("date", "desc")
            .limit(50)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server all public setlist fetch failed:", error)
        return []
    }
}
