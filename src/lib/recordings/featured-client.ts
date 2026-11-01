// Client-side featured take per song (Recordings 2026-11). Members can list
// their org's recordings; each song's one take comes from pickFeatured, so a
// held or hidden take never shows. A signed-out visitor can't list from the
// client, so the public Listen page reads on the server instead.

import { collection, onSnapshot, query, where } from "firebase/firestore"

import { recoverFromFirestoreShutdown, subscribeWithDb } from "@/lib/firebase"
import type { OrgId } from "@/lib/org/types"
import type { Recording } from "@/types/models"

import { pickFeatured } from "./featured"

/** Group recordings by song and keep each song's featured take. Pure. */
export function featuredBySong(recs: Recording[]): Record<string, Recording> {
    const bySong = new Map<string, Recording[]>()
    for (const r of recs) {
        if (!r.songId) continue
        const list = bySong.get(r.songId) ?? []
        list.push(r)
        bySong.set(r.songId, list)
    }
    const out: Record<string, Recording> = {}
    for (const [songId, list] of bySong) {
        const pick = pickFeatured(list)
        if (pick) out[songId] = pick
    }
    return out
}

/** Live map of songId -> featured take for the org. Returns the unsubscribe. */
export function subscribeFeaturedBySong(
    orgId: OrgId,
    cb: (map: Record<string, Recording>) => void,
): () => void {
    return subscribeWithDb((db) =>
        onSnapshot(
            query(collection(db, "recordings"), where("orgId", "==", orgId)),
            (snap) => {
                const recs = snap.docs.map((d) => ({ ...(d.data() as Recording), id: d.id }))
                cb(featuredBySong(recs))
            },
            (err) => {
                recoverFromFirestoreShutdown(err)
            },
        ),
    )
}
