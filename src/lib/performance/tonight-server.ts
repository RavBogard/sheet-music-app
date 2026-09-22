/**
 * Server read of tonight's overrides — the signed-out reload path (SSR frame
 * and `/api/setlists/{id}/tracks`). Admin SDK, so no rule widens anonymous
 * access. Any failure answers null: the plan renders as it would without
 * swaps, never an error or an empty setlist.
 */
import type { Firestore } from "firebase-admin/firestore"

import { logger } from "@/lib/logger"
import { OVERRIDES_COLLECTION, OVERRIDES_DOC_ID, parseOverridesDoc, type OverridesDoc } from "./tonight"

export async function readTonightOverrides(db: Firestore, setlistId: string): Promise<OverridesDoc | null> {
    try {
        const snap = await db
            .collection("setlists")
            .doc(setlistId)
            .collection(OVERRIDES_COLLECTION)
            .doc(OVERRIDES_DOC_ID)
            .get()
        return snap.exists ? parseOverridesDoc(snap.data()) : null
    } catch (err) {
        logger.warn(`[tonight] overrides read failed for ${setlistId}; serving the plan`, err)
        return null
    }
}
