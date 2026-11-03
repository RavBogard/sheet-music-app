"use client"

import { getDb } from "@/lib/local/schema"
import { getOpsClient } from "@/lib/setlist-ops-client/runtime"
import { canonicalOrder } from "@/lib/setlist-ops-client/view"
import type { WireOp } from "@/lib/setlist-ops-client/client"

export type LiveReorderFailure = "offline" | "rejected" | "network" | "conflict"

export type LiveReorderResult =
    | { ok: true }
    | { ok: false; reason: Exclude<LiveReorderFailure, "conflict">; code?: string }

/**
 * The `move` ops that turn `current` into `target`, each anchored on its
 * neighbours at that step (the server rebases anchors onto its newer order).
 * Rows missing from either list are left where they are.
 */
export function movesToReach(current: readonly string[], target: readonly string[]): WireOp[] {
    const have = new Set(current)
    const want = target.filter((id) => have.has(id))
    const seq = current.slice()
    const ops: WireOp[] = []
    want.forEach((id, i) => {
        if (seq[i] === id) return
        seq.splice(seq.indexOf(id), 1)
        seq.splice(i, 0, id)
        ops.push({
            kind: "move",
            rowId: id,
            afterRowId: i > 0 ? seq[i - 1] : null,
            beforeRowId: i + 1 < seq.length ? seq[i + 1] : null,
        })
    })
    return ops
}

/**
 * Write a new row order from Perform through the setlist ops client (the one
 * writer MCP and the editor use). The whole reorder is ONE batch, so other
 * devices get it as one update; the ops client retries a network failure with
 * backoff under the same batch id. Never throws: the caller rolls its
 * optimistic order back on any `ok: false`.
 */
export async function commitLiveReorder(
    setlistId: string,
    orderedTrackIds: string[],
): Promise<LiveReorderResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { ok: false, reason: "offline" }
    }
    try {
        const rows = await getDb().tracks.where("setlistId").equals(setlistId).toArray()
        const ops = movesToReach(
            canonicalOrder(rows).map((r) => r.id),
            orderedTrackIds,
        )
        if (ops.length === 0) return { ok: true }
        const client = getOpsClient()
        const key = await client.enqueue(
            setlistId,
            ops.map((op) => ({ op })),
        )
        const r = await client.settle(setlistId, key)
        if (r.ok) return { ok: true }
        if (r.reason === "offline") return { ok: false, reason: "offline" }
        return { ok: false, reason: "rejected", code: r.reason }
    } catch {
        return {
            ok: false,
            reason: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network",
        }
    }
}
