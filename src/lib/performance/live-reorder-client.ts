"use client"

import { apiFetch } from "@/lib/api-client"

export type LiveReorderFailure = "offline" | "rejected" | "network"

export type LiveReorderResult = { ok: true } | { ok: false; reason: LiveReorderFailure; code?: string }

/**
 * Write a new row order from the Perform page through `/api/setlist/reorder`
 * (the server path MCP `reorder_setlist` uses). Never throws: the caller
 * rolls its optimistic order back on any `ok: false`.
 */
export async function commitLiveReorder(
    setlistId: string,
    orderedTrackIds: string[],
): Promise<LiveReorderResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { ok: false, reason: "offline" }
    }
    try {
        const res = await apiFetch("/api/setlist/reorder", {
            method: "POST",
            body: JSON.stringify({ setlistId, orderedTrackIds }),
            timeout: 15_000,
        })
        if (res.ok) return { ok: true }
        let code: string | undefined
        try {
            const body = (await res.json()) as { code?: unknown }
            if (typeof body?.code === "string") code = body.code
        } catch {
            // non-JSON error body
        }
        return { ok: false, reason: "rejected", code }
    } catch {
        return {
            ok: false,
            reason: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network",
        }
    }
}
