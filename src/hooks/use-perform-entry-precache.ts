"use client"

import { useEffect, useRef } from "react"
import { prefetchSetlistPDFs } from "@/lib/prefetch"
import { logger } from "@/lib/logger"

/**
 * Window event dispatched after the entry-precache pass settles (success OR
 * silent failure). `SaveOfflineButton` listens for it to recount its IDB-
 * ready set so its `data-state` reflects entry-precache progress without
 * waiting for the rIC fallback to fire.
 */
export const PERFORM_PRECACHE_DONE_EVENT = "crc-perform-precache-done"

/**
 * F1 (perform-entry-precache) — fires `prefetchSetlistPDFs` on Perform
 * overlay mount via `queueMicrotask`, NOT waiting for `requestIdleCallback`.
 *
 * Why: `SaveOfflineButton`'s rIC path is the durable offline-arming
 * mechanism, but rIC only fires when the browser reaches idle. A band
 * member who opens `/perform/setlist/[id]` on weak shul WiFi may lose
 * connectivity before rIC ever fires — closing that window is the whole
 * point of F1 ([[project_band_ipads_incognito_state]] +
 * `.coord/QUEUE.md` F1 + ipad-sweep §Coverage gap #1).
 *
 * Idempotent with SaveOfflineButton's existing idle-precache and
 * explicit-tap paths: `prefetchSetlistPDFs` itself dedupes input + skips
 * already-cached entries via `hasFile`, so a second call from
 * SaveOfflineButton's rIC is a no-op. Failure is silent (best-effort).
 *
 * On settle (success OR error) we dispatch a `PERFORM_PRECACHE_DONE_EVENT`
 * window event so `SaveOfflineButton` can recount its IDB-ready set —
 * this is what flips its `data-state` from `"idle"` to `"saved"` on a
 * fresh install without waiting for rIC to fire (closes
 * `e2e/perform-ipad-offline.spec.ts:218` probe 1 reliance on rIC).
 *
 * Coordination contract — see `SaveOfflineButton`:
 *   - rIC path stays as a fallback if entry-precache is delayed.
 *   - Both paths read the same Dexie store via `prefetchSetlistPDFs`,
 *     so a re-entrant call is cheap (hasFile guard short-circuits).
 *
 * The effect is gated on a content signature (`sig`) so a parent
 * re-render with a new-reference-same-content `fileIds` array doesn't
 * re-fire the precache (same shape that bit ipad-idle-auto-precache-fix
 * F-4; see `SaveOfflineButton.tsx`'s `idleKickedRef` comment).
 */
export function usePerformEntryPrecache(fileIds: readonly string[]): void {
    // Drop empty/pseudo (`flow-`) ids before signature so callers don't
    // have to do it; mirrors `SaveOfflineButton`'s `cacheable` guard.
    const cacheable = fileIds.filter((id) => id && !id.startsWith("flow-"))
    const sig = cacheable.join(",")

    const triggeredRef = useRef<string | null>(null)

    useEffect(() => {
        if (!sig) return
        if (triggeredRef.current === sig) return
        // Can't fetch while offline — the rIC path + the explicit "Save
        // offline" CTA both also short-circuit here; the user can still
        // hit the CTA once they reconnect.
        if (typeof navigator !== "undefined" && navigator.onLine === false) return

        triggeredRef.current = sig
        let cancelled = false

        const fire = () => {
            if (cancelled) return
            // Snapshot the cacheable list so a parent re-render mid-flight
            // doesn't smuggle a different array in.
            const ids = sig.split(",")
            prefetchSetlistPDFs(ids)
                .catch((e) => {
                    // Silent — pre-cache is best-effort; failures must not
                    // surface to React boundaries or user UI.
                    logger.warn("[perform-entry-precache] precache failed:", e)
                })
                .finally(() => {
                    if (cancelled) return
                    if (typeof window === "undefined") return
                    try {
                        window.dispatchEvent(new Event(PERFORM_PRECACHE_DONE_EVENT))
                    } catch {
                        /* noop — dispatch in JSDOM or stripped Window */
                    }
                })
        }

        // Defer past the current render tick. We deliberately use
        // `queueMicrotask` (NOT `requestIdleCallback`) so the precache
        // fires regardless of browser idleness — the whole point of F1.
        // `setTimeout(0)` is the SSR / older-environment fallback.
        if (typeof queueMicrotask === "function") {
            queueMicrotask(fire)
        } else {
            setTimeout(fire, 0)
        }

        return () => {
            cancelled = true
        }
    }, [sig])
}
