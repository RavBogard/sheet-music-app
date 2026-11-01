import "server-only"

import type { Firestore } from "firebase-admin/firestore"
import { collections, linkId } from "@/lib/beit-mitzvah/service"
import { rowOrg } from "@/lib/mcp/org-context"
import type { OrgId } from "@/lib/org/types"
import { isFamilyOrg } from "./week-key"

/**
 * BET-6 — the read-only Beit Mitzvah card on a setlist (TF-13).
 *
 * Read server-side from the bridge's own link record (CONTRACT.md): the
 * ceremony's date and kind come from the link; student names, slot, reading
 * reference names and rehearsal dates come from the portal's `details`
 * operation. Names are allowed on the setlist (Daniel, 2026-10-31); references
 * are names only, never verse text (the contract schema refuses text).
 *
 * CRC only. Fails quietly: any missing piece or read error is `null` and the
 * card hides.
 */

export interface CeremonyCard {
    ceremonyType: "morning" | "havdalah"
    localDate: string
    students: string[]
    slot: string | null
    torahRef: string | null
    haftarahRef: string | null
    rehearsals: string[]
}

const TTL_MS = 60_000
const cache = new Map<string, { at: number; card: CeremonyCard | null }>()

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [])

/** The card for a setlist, or null. Never throws. */
export async function readCeremonyCard(db: Firestore, setlistId: string, org: OrgId, now = Date.now()): Promise<CeremonyCard | null> {
    if (!isFamilyOrg(org)) return null
    const key = `${org}:${setlistId}`
    const hit = cache.get(key)
    if (hit && now - hit.at < TTL_MS) return hit.card
    let card: CeremonyCard | null = null
    try {
        const setlist = (await db.collection("setlists").doc(setlistId).get()).data()
        const ceremonyId = str(setlist?.ceremonyId)
        if (setlist && ceremonyId && rowOrg(setlist.orgId) === org) {
            const link = (await db.collection(collections.links).doc(linkId(ceremonyId)).get()).data()
            // The link must point back at this very setlist: a copied ceremonyId never borrows a card.
            if (link && link.orgId === "crc" && link.setlistId === setlistId &&
                (link.ceremonyType === "morning" || link.ceremonyType === "havdalah") && str(link.localDate)) {
                const d = (link.details && typeof link.details === "object" ? link.details : {}) as Record<string, unknown>
                card = {
                    ceremonyType: link.ceremonyType,
                    localDate: String(link.localDate),
                    students: strs(d.students),
                    slot: str(d.slot),
                    torahRef: str(d.torahRef),
                    haftarahRef: str(d.haftarahRef),
                    rehearsals: strs(d.rehearsals).sort(),
                }
            }
        }
    } catch {
        card = null
    }
    cache.set(key, { at: now, card })
    return card
}

/** Test seam. */
export function clearCeremonyCardCache(): void {
    cache.clear()
}
