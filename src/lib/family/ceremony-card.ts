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
/** A card that is not there is re-checked sooner, so new details show quickly. */
const MISS_TTL_MS = 10_000
/** A small LRU: Map order is recency; the oldest entry goes first. */
const MAX_ENTRIES = 200
const cache = new Map<string, { at: number; card: CeremonyCard | null }>()

function remember(key: string, at: number, card: CeremonyCard | null) {
    cache.delete(key)
    cache.set(key, { at, card })
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [])
const uniq = (xs: string[]) => [...new Set(xs)]

/**
 * The card for a setlist, or null. Never throws. A setlist several ceremonies
 * link to (`ceremonyIds`, e.g. two families on one morning) shows one card
 * with every student; each link must point back at this very setlist.
 */
export async function readCeremonyCard(db: Firestore, setlistId: string, org: OrgId, now = Date.now()): Promise<CeremonyCard | null> {
    if (!isFamilyOrg(org)) return null
    const key = `${org}:${setlistId}`
    const hit = cache.get(key)
    if (hit && now - hit.at < (hit.card ? TTL_MS : MISS_TTL_MS)) {
        remember(key, hit.at, hit.card)
        return hit.card
    }
    let card = null as CeremonyCard | null
    try {
        const setlist = (await db.collection("setlists").doc(setlistId).get()).data()
        const ids = setlist && rowOrg(setlist.orgId) === org
            ? uniq([str(setlist.ceremonyId), ...strs(setlist.ceremonyIds)].filter((x): x is string => !!x)).slice(0, 10)
            : []
        const links = ids.length
            ? (await db.getAll(...ids.map((id) => db.collection(collections.links).doc(linkId(id))))).map((d) => d.data())
            : []
        for (const link of links) {
            // A copied ceremonyId never borrows another setlist's card.
            if (!link || link.orgId !== "crc" || link.setlistId !== setlistId ||
                (link.ceremonyType !== "morning" && link.ceremonyType !== "havdalah") || !str(link.localDate)) continue
            const d = (link.details && typeof link.details === "object" ? link.details : {}) as Record<string, unknown>
            const join = (a: string | null, b: string | null) => (a && b && a !== b ? `${a} · ${b}` : a ?? b)
            card = card
                ? {
                      ...card,
                      students: uniq([...card.students, ...strs(d.students)]),
                      slot: join(card.slot, str(d.slot)),
                      torahRef: join(card.torahRef, str(d.torahRef)),
                      haftarahRef: join(card.haftarahRef, str(d.haftarahRef)),
                      rehearsals: uniq([...card.rehearsals, ...strs(d.rehearsals)]).sort(),
                  }
                : {
                      ceremonyType: link.ceremonyType,
                      localDate: String(link.localDate),
                      students: strs(d.students),
                      slot: str(d.slot),
                      torahRef: str(d.torahRef),
                      haftarahRef: str(d.haftarahRef),
                      rehearsals: strs(d.rehearsals).sort(),
                  }
        }
    } catch {
        card = null
    }
    remember(key, now, card)
    return card
}

/** Test seam: the number of cached entries. */
export function ceremonyCardCacheSize(): number {
    return cache.size
}

/** Test seam. */
export function clearCeremonyCardCache(): void {
    cache.clear()
}
