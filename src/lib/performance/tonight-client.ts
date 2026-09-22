"use client"

/**
 * Firestore side of tonight-only swaps: the listener every signed-in iPad
 * mounts, and the one transaction every swap / undo / reset goes through.
 * The rules (`firestore.rules`, "TONIGHT-ONLY CHART SWAPS") hold the same
 * contract: rev advances by one per commit, and every deviation lands in the
 * same commit as the overrides state it describes.
 */

import { doc, onSnapshot, runTransaction } from "firebase/firestore"

import { getDb, subscribeWithDb, type Unsubscribe } from "@/lib/firebase"
import {
    DEVIATIONS_COLLECTION,
    OVERRIDES_COLLECTION,
    OVERRIDES_DOC_ID,
    deviationId,
    parseOverridesDoc,
    planReset,
    planSwap,
    type OverridesDoc,
    type ResetRequest,
    type SwapRequest,
    type WritePlan,
} from "./tonight"

/**
 * Follow the overrides doc. `onDoc(null)` for a missing or malformed doc.
 * A read failure (offline, denied, signed out) reports through `onError`
 * and the caller keeps showing the plan — never an empty setlist.
 */
export function subscribeTonight(
    setlistId: string,
    onDoc: (doc: OverridesDoc | null) => void,
    onError: (err: unknown) => void,
): Unsubscribe {
    return subscribeWithDb((db) =>
        onSnapshot(
            doc(db, "setlists", setlistId, OVERRIDES_COLLECTION, OVERRIDES_DOC_ID),
            (snap) => onDoc(snap.exists() ? parseOverridesDoc(snap.data()) : null),
            onError,
        ),
    )
}

async function commit(
    setlistId: string,
    build: (current: OverridesDoc | null) => WritePlan,
): Promise<WritePlan> {
    const db = await getDb()
    const ref = doc(db, "setlists", setlistId, OVERRIDES_COLLECTION, OVERRIDES_DOC_ID)
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const plan = build(snap.exists() ? parseOverridesDoc(snap.data()) : null)
        if (plan.kind !== "write") return plan
        tx.set(ref, plan.next)
        for (const d of plan.deviations) {
            tx.set(doc(db, "setlists", setlistId, DEVIATIONS_COLLECTION, deviationId(d)), d)
        }
        return plan
    })
}

/** Swap one row for tonight, or undo it (choice = the planned chart / null). */
export function commitTonightSwap(setlistId: string, req: SwapRequest): Promise<WritePlan> {
    return commit(setlistId, (current) => planSwap(current, req))
}

/** Reset every row to the plan. */
export function commitTonightReset(setlistId: string, req: ResetRequest): Promise<WritePlan> {
    return commit(setlistId, (current) => planReset(current, req))
}

/**
 * Charts that other rows of the same liturgical moment are bonded to — the
 * "Same moment" section. There is no chart↔moment binding in the library yet,
 * so the evidence is the setlists themselves. Only ids come back; the caller
 * intersects them with the site's own library, which is what scopes them to
 * the tenant. A failure answers an empty set (the section is simply empty).
 */
export async function fetchMomentFileIds(
    momentId: string,
    unitIds: string[],
): Promise<Set<string>> {
    const out = new Set<string>()
    try {
        const { collection, getDocs, limit, query, where } = await import("firebase/firestore")
        const db = await getDb()
        const queries = [query(collection(db, "tracks"), where("momentId", "==", momentId), limit(500))]
        const units = unitIds.filter(Boolean).slice(0, 30)
        if (units.length > 0) {
            queries.push(query(collection(db, "tracks"), where("liturgyRef.unitId", "in", units), limit(500)))
        }
        const snaps = await Promise.allSettled(queries.map((q) => getDocs(q)))
        for (const s of snaps) {
            if (s.status !== "fulfilled") continue
            for (const d of s.value.docs) {
                const f = d.data().fileId
                if (typeof f === "string" && f) out.add(f)
            }
        }
    } catch {
        // No moment evidence is an empty section, not an error.
    }
    return out
}
