"use client"

/**
 * Firestore side of tonight-only swaps: the listener every signed-in iPad
 * mounts, and the one transaction every swap / undo / reset goes through.
 * The rules (`firestore.rules`, "TONIGHT-ONLY CHART SWAPS") hold the same
 * contract: rev advances by one per commit, and every deviation lands in the
 * same commit as the overrides state it describes.
 */

import { doc, onSnapshot, runTransaction } from "firebase/firestore"

import { auth, getDb, subscribeWithDb, type Unsubscribe } from "@/lib/firebase"
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
 * Live subscriptions per setlist, so the tab that commits a swap / undo / reset
 * shows the doc its own transaction wrote at once instead of waiting for the
 * listen echo (tens of seconds behind on production, 2026-09-22).
 *
 * Nothing is cached. A committed doc goes only to subscriptions that are open
 * when the commit resolves and were opened by the user who committed it, and
 * only while that user is still the one signed in. That transaction read and
 * wrote the doc as this user, so it is data this session may already see. A
 * later mount, another account and a signed-out page learn it from the
 * listener (or the server-rendered frame), under the rules as before.
 */
type CommittedSub = { uid: string; take: (doc: OverridesDoc) => void }
const committedSubs = new Map<string, Set<CommittedSub>>()

const signedInUid = (): string | null => auth?.currentUser?.uid ?? null

function adoptCommitted(setlistId: string, uid: string, doc: OverridesDoc) {
    // Signed out or switched account while the commit was in flight.
    if (signedInUid() !== uid) return
    for (const sub of committedSubs.get(setlistId) ?? []) {
        if (sub.uid === uid) sub.take(doc)
    }
}

/**
 * Follow the overrides doc. `onDoc(null)` for a missing or malformed doc.
 * A read failure (offline, denied, signed out) reports through `onError`
 * and the caller keeps showing the plan — never an empty setlist. After a
 * failure the subscription shows nothing more, not even this tab's commits.
 *
 * Every write bumps `rev` by one (the rules enforce it, across service days
 * too; Reset to plan is a write with no rows), so a doc older than one already
 * shown is never shown over it, whichever path either came by. A missing doc
 * from the listener means the doc is gone and the plan shows, except while
 * this tab's own commit is still ahead of the listener: then it is the stream
 * catching up from before the write. Nothing deletes the doc today (delete is
 * server-only and no server path does it).
 */
export function subscribeTonight(
    setlistId: string,
    onDoc: (doc: OverridesDoc | null) => void,
    onError: (err: unknown) => void,
): Unsubscribe {
    let shownRev = -1 // nothing shown yet; 0 = the plan (no doc)
    let aheadOfListener: number | null = null // rev of an adopted commit not yet delivered
    let closed = false
    const show = (d: OverridesDoc | null) => {
        shownRev = d?.rev ?? 0
        onDoc(d)
    }
    const fromListener = (d: OverridesDoc | null) => {
        if (closed) return
        if (d === null) {
            if (aheadOfListener !== null || shownRev === 0) return
            show(null)
            return
        }
        if (aheadOfListener !== null && d.rev >= aheadOfListener) aheadOfListener = null
        if (d.rev <= shownRev) return
        show(d)
    }

    const uid = signedInUid()
    const sub: CommittedSub | null = uid
        ? {
              uid,
              take: (d) => {
                  if (closed || d.rev <= shownRev) return
                  aheadOfListener = d.rev
                  show(d)
              },
          }
        : null
    const leave = () => {
        closed = true
        if (!sub) return
        const subs = committedSubs.get(setlistId)
        subs?.delete(sub)
        if (subs?.size === 0) committedSubs.delete(setlistId)
    }
    if (sub) {
        let subs = committedSubs.get(setlistId)
        if (!subs) committedSubs.set(setlistId, (subs = new Set()))
        subs.add(sub)
    }

    const unsubscribe = subscribeWithDb((db) =>
        onSnapshot(
            doc(db, "setlists", setlistId, OVERRIDES_COLLECTION, OVERRIDES_DOC_ID),
            (snap) => fromListener(snap.exists() ? parseOverridesDoc(snap.data()) : null),
            (err) => {
                leave()
                onError(err)
            },
        ),
    )
    return () => {
        leave()
        unsubscribe()
    }
}

async function commit(
    setlistId: string,
    build: (current: OverridesDoc | null) => WritePlan,
): Promise<WritePlan> {
    const uid = signedInUid()
    const db = await getDb()
    const ref = doc(db, "setlists", setlistId, OVERRIDES_COLLECTION, OVERRIDES_DOC_ID)
    const plan = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const plan = build(snap.exists() ? parseOverridesDoc(snap.data()) : null)
        if (plan.kind !== "write") return plan
        tx.set(ref, plan.next)
        for (const d of plan.deviations) {
            tx.set(doc(db, "setlists", setlistId, DEVIATIONS_COLLECTION, deviationId(d)), d)
        }
        return plan
    })
    // Only after the commit resolved: the rules accepted exactly this doc.
    if (plan.kind === "write" && uid) adoptCommitted(setlistId, uid, plan.next)
    return plan
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
