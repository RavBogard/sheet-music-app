"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    getSaveFailures,
    prefetchSetlistPDFs,
    SAVE_FAILURES_CHANGED_EVENT,
    type SaveFailureReason,
} from "@/lib/prefetch"
import type { ChartVersions } from "@/lib/offline/chart-version"
import { listFileIds, OFFLINE_STORE_CHANGED_EVENT } from "@/lib/offline-idb"
import { logger } from "@/lib/logger"
import { PERFORM_PRECACHE_DONE_EVENT } from "@/hooks/use-perform-entry-precache"
import { useT } from "@/i18n/client"

interface Props {
    /** Song-track fileIds for this setlist (cacheable charts). */
    fileIds: string[]
    /** Web refresh: reports how many of this setlist's charts are on this
     *  device, so the head row's status line can say "N/M charts on this
     *  iPad". Read-only; it changes nothing about caching. */
    onReadyChange?: (
        ready: number,
        total: number,
        savedIds: ReadonlySet<string>,
        /** PERF-21: this setlist's charts that failed to save, with why. */
        failures: ReadonlyMap<string, SaveFailureReason>,
    ) => void
    /** PERF-18: server versions per fileId; stale cached charts re-fetch in place. */
    versions?: ChartVersions | null
}

type Phase = "idle" | "saving"

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
}

function sameMap<V>(a: ReadonlyMap<string, V>, b: ReadonlyMap<string, V>): boolean {
    if (a.size !== b.size) return false
    for (const [k, v] of a) if (!b.has(k) || b.get(k) !== v) return false
    return true
}

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
export function SaveOfflineButton({ fileIds, onReadyChange, versions }: Props) {
    const t = useT()
    // Dedupe + drop pseudo (`flow-`) items and falsy ids; `prefetchSetlistPDFs`
    // guards these too, but the count/fraction must reflect only real charts.
    // Keyed on content, not array identity: a caller that passes a fresh
    // array each render must not re-run the count (re-audit P1 render loop).
    const sig = [...new Set(fileIds.filter((id) => id && !id.startsWith("flow-")))].join(",")
    const cacheable = useMemo(() => (sig ? sig.split(",") : []), [sig])
    const total = cacheable.length

    const [phase, setPhase] = useState<Phase>("idle")
    const [readyCount, setReadyCount] = useState(0)
    const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set())
    const [progress, setProgress] = useState(0)
    const [failures, setFailures] = useState<ReadonlyMap<string, SaveFailureReason>>(() => new Map())
    // Read at call time; the map is not part of any effect's trigger.
    const versionsRef = useRef<ChartVersions | null | undefined>(versions)
    useEffect(() => {
        versionsRef.current = versions
    }, [versions])

    // PERF-21: this setlist's failed fileIds from the save passes. Only ids
    // still missing from the device are kept: a chart that failed a refresh
    // but still has its older copy is saved, not failed.
    const readFailures = useCallback((have: ReadonlySet<string>) => {
        const all = getSaveFailures()
        const mine = new Map<string, SaveFailureReason>()
        for (const id of cacheable) {
            const f = all.get(id)
            if (f && !have.has(id)) mine.set(id, f.reason)
        }
        setFailures((prev) => (sameMap(prev, mine) ? prev : mine))
    }, [cacheable])

    // How many cacheable charts are already in the offline store.
    const recount = useCallback(async () => {
        try {
            const ids = await listFileIds()
            const have = new Set(ids)
            let n = 0
            const mine = new Set<string>()
            for (const id of cacheable) if (have.has(id)) { n++; mine.add(id) }
            setReadyCount(n)
            // Keep the old object when nothing changed, so the report to
            // the parent (onReadyChange) doesn't fire and re-render it.
            setSavedIds((prev) => (sameSet(prev, mine) ? prev : mine))
            readFailures(mine)
            return n
        } catch (e) {
            logger.warn("[SaveOfflineButton] listFileIds failed:", e)
            return 0
        }
    }, [cacheable, readFailures])

    useEffect(() => {
        onReadyChange?.(readyCount, total, savedIds, failures)
    }, [onReadyChange, readyCount, total, savedIds, failures])

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
    // Since the re-audit render-loop fix, `cacheable` is keyed on `sig`, so a
    // same-content re-render no longer re-runs this effect at all.
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
            prefetchSetlistPDFs(cacheable, undefined, { versions: versionsRef.current })
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
        window.addEventListener(SAVE_FAILURES_CHANGED_EVENT, handler)
        // A chart saved or removed outside these passes (opening it in the
        // viewer saves it too) still moves the N/M count.
        window.addEventListener(OFFLINE_STORE_CHANGED_EVENT, handler)
        return () => {
            window.removeEventListener(OFFLINE_STORE_CHANGED_EVENT, handler)
            window.removeEventListener(PERFORM_PRECACHE_DONE_EVENT, handler)
            window.removeEventListener(SAVE_FAILURES_CHANGED_EVENT, handler)
        }
    }, [recount])

    // Explicit force-cache with live progress.
    const saveOffline = useCallback(async () => {
        if (total === 0 || phase === "saving") return
        setPhase("saving")
        const start = await recount()
        setProgress(start)
        try {
            await prefetchSetlistPDFs(
                cacheable,
                (processed) => {
                    setProgress(processed)
                },
                { versions: versionsRef.current },
            )
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
    // Light-mode shades (green-800 / amber-800) for WCAG AA contrast on the
    // light-theme header glass — green-400 / amber-400 fail there (axe color-
    // contrast, 1.6:1 on the "Saved" state); green-700 was marginal (4.46:1 on
    // prod), green-800 clears at 6.43:1. Dark mode keeps the vivid shades.
    const accent = allReady
        ? "text-success"
        : partial
          ? "text-caution"
          : "text-muted-foreground"

    // WS-13 (v11.6-03-02): the all-ready state shows the explicit N/N count
    // (not a bare "Saved") so a player can confirm EVERY chart is cached before
    // leaving wifi — symmetric with the partial "Save M/N".
    const label = saving
        ? t("perform.saveOffline.saving", { progress, total })
        : allReady
          ? t("perform.saveOffline.saved", { total })
          : partial
            ? t("perform.saveOffline.partial", { ready: readyCount, total })
            : t("perform.saveOffline.idle")

    // Charts still missing from this device: the one blue primary action,
    // worded with the count it will save. Everything saved stays quiet.
    const needsSave = !saving && !allReady
    const missing = total - readyCount
    const visibleLabel = needsSave ? t("perform.saveOffline.save", { count: missing }) : label

    const ariaLabel = saving
        ? t("perform.saveOffline.savingAria", { progress, total })
        : allReady
          ? t("perform.saveOffline.allSavedAria")
          : partial
            ? t("perform.saveOffline.partialAria", { ready: readyCount, total })
            : t("perform.saveOffline.idleAria")

    return (
        <Button
            onClick={saveOffline}
            disabled={saving}
            size="sm"
            variant={needsSave ? "default" : "ghost"}
            aria-label={ariaLabel}
            data-testid="save-offline"
            data-state={saving ? "saving" : allReady ? "saved" : partial ? "partial" : "idle"}
            className={`h-11 min-w-11 gap-1.5 transition-colors duration-200 ${needsSave ? "" : accent}`}
        >
            {saving ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : allReady ? (
                <Check className="h-4 w-4" />
            ) : (
                <Download className="h-4 w-4" />
            )}
            <span className={needsSave ? "tnum text-sm font-bold" : "tnum text-xs font-semibold hidden sm:inline"} aria-live="polite">
                {visibleLabel}
            </span>
        </Button>
    )
}
