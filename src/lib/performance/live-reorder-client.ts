"use client"

import { getOpsClient } from "@/lib/setlist-ops-client/runtime"
import type { WireOp } from "@/lib/setlist-ops-client/client"

export type LiveReorderFailure = "offline" | "rejected" | "network" | "conflict"

export type LiveReorderResult =
    | { ok: true }
    | { ok: false; reason: Exclude<LiveReorderFailure, "conflict">; code?: string }

/**
 * ONE anchored `move` per dragged row: the row's new neighbours in the order
 * the leader sees (`order`). The server rebases the anchors onto its own
 * order, so a move never half-applies and never needs a stale-version retry.
 */
export function moveOps(order: readonly string[], moved: readonly string[]): WireOp[] {
    const ops: WireOp[] = []
    for (const id of new Set(moved)) {
        const at = order.indexOf(id)
        if (at < 0) continue
        ops.push({
            kind: "move",
            rowId: id,
            afterRowId: at > 0 ? order[at - 1] : null,
            beforeRowId: at + 1 < order.length ? order[at + 1] : null,
        })
    }
    return ops
}

/**
 * Write a reorder from Perform through the setlist ops client (the one writer
 * MCP and the editor use), as ONE batch. What the leader is told is what
 * happens: when the write is not confirmed (offline, refused, a network
 * failure) the batch is also REMOVED from the ops queue, so a move that was
 * rolled back on screen can never land minutes later. Never throws.
 */
export async function commitLiveReorder(
    setlistId: string,
    order: string[],
    moved: string[],
): Promise<LiveReorderResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { ok: false, reason: "offline" }
    }
    const ops = moveOps(order, moved)
    if (ops.length === 0) return { ok: true }
    const client = getOpsClient()
    let key = ""
    try {
        key = await client.enqueue(
            setlistId,
            ops.map((op) => ({ op })),
        )
        const r = await client.settle(setlistId, key)
        if (r.ok) return { ok: true }
        await client.dropBatch(key).catch(() => 0)
        if (r.reason === "offline") return { ok: false, reason: "offline" }
        return { ok: false, reason: "rejected", code: r.reason }
    } catch {
        if (key) await client.dropBatch(key).catch(() => 0)
        return {
            ok: false,
            reason: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network",
        }
    }
}
