/**
 * Unload-safe setlist save transport.
 *
 * Called from the setlist editor's pagehide/beforeunload handler. Uses
 * `fetch(..., { keepalive: true })` because the in-page Firebase SDK write is
 * a Promise the browser will kill when the page unloads.
 *
 * Kept in its own module so the keepalive logic is testable without rendering
 * the entire setlist-logic hook.
 */

import type { SetlistTrack, SetlistMusician } from "@/types/models"

export interface FlushSavePayload {
    setlistId: string
    expectedUpdatedAtMs: number | null
    data: {
        name: string
        tracks: SetlistTrack[]
        trackCount: number
        eventDate?: string
        rabbi?: string
        serviceNotes?: string
        musicians?: SetlistMusician[]
    }
}

/**
 * Fire a keepalive POST to /api/setlist/flush. Best-effort — browsers allow
 * keepalive bodies up to 64 KB and may reject larger payloads.
 */
export function sendKeepaliveFlush(payload: FlushSavePayload, bearerToken: string): void {
    if (!bearerToken) return
    try {
        // Deliberately not awaited — keepalive means the browser owns the request.
        fetch('/api/setlist/flush', {
            method: 'POST',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
            },
            body: JSON.stringify(payload),
        }).catch(() => { /* fire-and-forget */ })
    } catch {
        // Some browsers throw synchronously on oversized keepalive bodies —
        // accept the loss rather than blocking unload.
    }
}
