"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { prefetchSetlistPDFs } from "@/lib/prefetch"
import { listFileIds } from "@/lib/offline-idb"
import { logger } from "@/lib/logger"
import { PERFORM_PRECACHE_DONE_EVENT } from "@/hooks/use-perform-entry-precache"

interface Props {
    /** Song-track fileIds for this setlist (cacheable charts). */
    fileIds: string[]
}

type Phase = "idle" | "saving"

/**
 * F1 (offline-precache) — "Save offline" CTA + idle auto-precache.
 *
 * The biggest live-service risk: shul WiFi drops mid-service and the band
 * loses their charts. The offline READ path already works (PDFOverlay
 * resolves the chart from the `crc-offline` IDB blob store before falling
 * back to network), but until this lane nothing populated that store on
 * Perform entry — `prefetchSetlistPDFs` had zero callers. This component
 * closes the write side two ways:
 *
 *   1. **Idle auto-precache on mount** — once the band member opens
 *      `/perform/setlist/[id]`, an idle-time (`requestIdleCallback`,
 *      non-blocking, online-only) pass caches every bonded chart so the
 *      whole setlist is offline-ready without any tap. Mirrors the PDF
 *      worker preload pattern in `perform/layout.tsx`.
 *   2. **Explicit "Save offline" CTA** — a band member can force-arm the
 *      cache before a service even if idle precache hasn't finished, with
 *      live N/M progress and a persistent "Saved" done state.
 *
 * Status colors reuse the OfflineIndicator's language: green = ready/done,
 * amber = attention (partially cached — tap to finish). Color is never the
 * only signal — the icon (Download → spinner → Check) changes too.
 */
export function SaveOfflineButton({ fileIds }: Props) {
    // Dedupe + drop pseudo (`flow-`) items and falsy ids; `prefetchSetlistPDFs`
    // guards these too, but the count/fraction must reflect only real charts.
    const cacheable = useMemo(
        () => [...new Set(fileIds.filter((id) => id && !id.startsWith("flow-")))],
        [fileIds],
    )
    const total = cacheable.length
    const sig = cacheable.join(",")

    const [phase, setPhase] = useState<Phase>("idle")
    const [readyCount, setReadyCount] = useState(0)
    const [progress, setProgress] = useState(0)

    // How many cacheable charts are already in the offline store.
    const recount = useCallback(async () => {
        try {
            const ids = await listFileIds()
            const have = new Set(ids)
            let n = 0
            for (const id of cacheable) if (have.has(id)) n++
            setReadyCount(n)
            return n
        } catch (e) {
            logger.warn("[SaveOfflineButton] listFileIds failed:", e)
            return 0
        }
    }, [cacheable])

    // Idle-time auto-precache on entry. Online-only, best-effort, non-blocking.
    // Re-runs only when the setlist's cacheable set changes (sig), guarded by a
    // ref so a re-render with the same set doesn't re-schedule.
    //
    // ipad-idle-auto-precache-fix (F-4): the kick-flag is marked INSIDE the
    // deferred firing closure (`fire`), not before scheduling. The parent
    // (`SetlistPerformClient`) re-renders the moment Dexie's `useLiveQuery`
    // delivers its first frame for the setlist's tracks — `fileIds` is a new
    // array reference, so `cacheable` + `recount` are new identities and this
    // effect re-runs. With the previous "mark before schedule" shape, the
    // cleanup would `cancelIdleCallback(handle)` the pending kick and the
    // new effect would see `idleKickedRef.current === sig` and bail without
    // re-scheduling — leaving the rIC cancelled-and-never-replaced, the
    // precache never firing, and `data-state` stuck on `"idle"` (probe 1 in
    // `e2e/perform-ipad-offline.spec.ts:218`). Marking inside `fire` lets the
    // re-render re-schedule cleanly; once the kick actually runs, the ref
    // flips and subsequent re-renders correctly return early (no double-fire).
    // See `.paul/research/ipad-idle-auto-precache-fix/DIAGNOSIS.md`.
    const idleKickedRef = useRef<string | null>(null)
    useEffect(() => {
        if (total === 0) return
        recount()
        if (idleKickedRef.current === sig) return
        // Can't fetch while offline — the user can still hit "Save offline"
        // once they reconnect.
        if (typeof navigator !== "undefined" && navigator.onLine === false) return

        let cancelled = false
        let handle: number | null = null
        let fallback: ReturnType<typeof setTimeout> | null = null

        const fire = () => {
            if (cancelled) return
            // Mark kicked HERE (not before scheduling) so a re-render that
            // cancels the pending rIC re-schedules instead of bailing.
            idleKickedRef.current = sig
            // Silent path — no progress UI for the passive precache; the button
            // simply flips to "Saved" via recount once it finishes.
            prefetchSetlistPDFs(cacheable)
                .then(() => {
                    if (!cancelled) recount()
                })
                .catch((e) => logger.warn("[SaveOfflineButton] idle precache failed:", e))
        }

        const ric: typeof window.requestIdleCallback | undefined =
            typeof window !== "undefined" ? window.requestIdleCallback : undefined
        if (typeof ric === "function") {
            handle = ric(
                () => {
                    handle = null
                    fire()
                },
                { timeout: 3000 },
            )
        } else {
            // Safari iOS omits requestIdleCallback — defer past first paint.
            fallback = setTimeout(() => {
                fallback = null
                fire()
            }, 2000)
        }

        return () => {
            cancelled = true
            if (
                handle !== null &&
                typeof window !== "undefined" &&
                typeof window.cancelIdleCallback === "function"
            ) {
                try {
                    window.cancelIdleCallback(handle)
                } catch {
                    /* noop */
                }
            }
            if (fallback !== null) clearTimeout(fallback)
        }
    }, [sig, total, cacheable, recount])

    // F1 (perform-entry-precache): the `usePerformEntryPrecache` hook in
    // `SetlistPerformClient` fires `prefetchSetlistPDFs` via `queueMicrotask`
    // on overlay mount — earlier than this component's own rIC fallback.
    // When that pass settles it dispatches `PERFORM_PRECACHE_DONE_EVENT`
    // on the window; we recount here so `data-state` can flip from `"idle"`
    // to `"saved"` without waiting for our rIC schedule to land
    // (closes `e2e/perform-ipad-offline.spec.ts:218` probe 1 reliance on
    // rIC firing on a fresh install).
    useEffect(() => {
        if (typeof window === "undefined") return
        const handler = () => {
            // Best-effort; recount catches its own errors.
            void recount()
        }
        window.addEventListener(PERFORM_PRECACHE_DONE_EVENT, handler)
        return () => {
            window.removeEventListener(PERFORM_PRECACHE_DONE_EVENT, handler)
        }
    }, [recount])

    // Explicit force-cache with live progress.
    const saveOffline = useCallback(async () => {
        if (total === 0 || phase === "saving") return
        setPhase("saving")
        const start = await recount()
        setProgress(start)
        try {
            await prefetchSetlistPDFs(cacheable, (processed) => {
                setProgress(processed)
            })
        } catch (e) {
            logger.warn("[SaveOfflineButton] save offline failed:", e)
        } finally {
            await recount()
            setPhase("idle")
        }
    }, [cacheable, total, phase, recount])

    if (total === 0) return null

    const allReady = readyCount >= total
    const saving = phase === "saving"
    const partial = !saving && readyCount > 0 && !allReady

    // Color + icon BOTH carry the state (never color-only).
    const accent = allReady
        ? "text-green-400"
        : partial
          ? "text-amber-400"
          : "text-muted-foreground"

    const label = saving
        ? `Saving ${progress}/${total}`
        : allReady
          ? "Saved"
          : partial
            ? `Save ${readyCount}/${total}`
            : "Save offline"

    const ariaLabel = saving
        ? `Saving charts for offline use, ${progress} of ${total}`
        : allReady
          ? "All charts saved for offline use"
          : partial
            ? `${readyCount} of ${total} charts saved offline — tap to save the rest`
            : "Save all charts for offline use"

    return (
        <Button
            onClick={saveOffline}
            disabled={saving}
            size="sm"
            variant="ghost"
            aria-label={ariaLabel}
            data-testid="save-offline"
            data-state={saving ? "saving" : allReady ? "saved" : partial ? "partial" : "idle"}
            className={`h-11 min-w-11 gap-1.5 transition-colors duration-200 ${accent}`}
        >
            {saving ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : allReady ? (
                <Check className="h-4 w-4" />
            ) : (
                <Download className="h-4 w-4" />
            )}
            <span className="text-xs hidden sm:inline" aria-live="polite">
                {label}
            </span>
        </Button>
    )
}
