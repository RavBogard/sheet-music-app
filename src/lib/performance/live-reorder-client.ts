"use client"

import { apiFetch } from "@/lib/api-client"

export type LiveReorderFailure = "offline" | "rejected" | "network" | "conflict"

export type LiveReorderResult =
    | { ok: true }
    /** Someone changed the setlist since this page last saw it. */
    | { ok: false; reason: "stale"; currentVersion: number; currentOrder: string[] }
    | { ok: false; reason: Exclude<LiveReorderFailure, "conflict">; code?: string }

/**
 * Write a new row order from the Perform page through `/api/setlist/reorder`
 * (the server path MCP `reorder_setlist` uses), gated on the setlist version
 * the page last saw. Never throws: the caller rolls its optimistic order
 * back on any `ok: false`, or re-applies the move on a stale answer.
 */
export async function commitLiveReorder(
    setlistId: string,
    orderedTrackIds: string[],
    lastSeenVersion?: number,
): Promise<LiveReorderResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { ok: false, reason: "offline" }
    }
    try {
        const res = await apiFetch("/api/setlist/reorder", {
            method: "POST",
            body: JSON.stringify(
                lastSeenVersion === undefined
                    ? { setlistId, orderedTrackIds }
                    : { setlistId, orderedTrackIds, lastSeenVersion },
            ),
            timeout: 15_000,
        })
        if (res.ok) return { ok: true }
        let body: { code?: unknown; currentVersion?: unknown; orderedTrackIds?: unknown } = {}
        try {
            body = ((await res.json()) ?? {}) as typeof body
        } catch {
            // non-JSON error body
        }
        if (
            body.code === "stale_version" &&
            typeof body.currentVersion === "number" &&
            Array.isArray(body.orderedTrackIds) &&
            body.orderedTrackIds.every((id) => typeof id === "string")
        ) {
            return {
                ok: false,
                reason: "stale",
                currentVersion: body.currentVersion,
                currentOrder: body.orderedTrackIds as string[],
            }
        }
        return { ok: false, reason: "rejected", code: typeof body.code === "string" ? body.code : undefined }
    } catch {
        return {
            ok: false,
            reason: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network",
        }
    }
}
