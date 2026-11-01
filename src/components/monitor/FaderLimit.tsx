"use client"

import { useEffect, useRef, useState } from "react"
import { ShieldAlert } from "lucide-react"
import { useT } from "@/i18n/client"
import { formatDb } from "@/lib/monitor/limits"
import type { ClampNotice } from "@/lib/monitor-store"

/** How long "Limited to … by the sound engineer's limit" stays up. */
export const CLAMP_NOTICE_MS = 3000

/**
 * BET-4: the limit, drawn as a thin tick across the fader track. `orientation`
 * matches the fader: horizontal faders fill left to right, vertical bottom up.
 */
export function CapTick({ cap, orientation }: { cap: number | null | undefined; orientation: "horizontal" | "vertical" }) {
    const t = useT()
    if (typeof cap !== "number" || cap >= 1 || cap < 0) return null
    const pos = `${Math.round(cap * 1000) / 10}%`
    const label = t("monitor.capTick", { db: formatDb(cap) })
    return (
        <div
            data-testid="fader-cap-tick"
            role="img"
            aria-label={label}
            title={label}
            className={
                orientation === "horizontal"
                    ? "absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-caution/90 pointer-events-none"
                    : "absolute inset-x-1 h-0.5 translate-y-1/2 rounded-full bg-caution/90 pointer-events-none"
            }
            style={orientation === "horizontal" ? { left: pos } : { bottom: pos }}
        />
    )
}

/**
 * BET-4: true for 3 s after each new clamped ack for this fader. Keyed on the
 * notice's `seq`, so a second clamp of the same fader shows the line again.
 */
export function useClampNotice(clamp: ClampNotice | null | undefined): ClampNotice | null {
    const [shown, setShown] = useState<ClampNotice | null>(null)
    const lastSeq = useRef<number>(clamp?.seq ?? 0)
    useEffect(() => {
        if (!clamp || clamp.seq === lastSeq.current) return
        lastSeq.current = clamp.seq
        setShown(clamp)
        const timer = setTimeout(() => setShown(null), CLAMP_NOTICE_MS)
        return () => clearTimeout(timer)
    }, [clamp])
    return shown
}

/** The words: "Limited to +2 dB by the sound engineer's limit". */
export function ClampNote({ notice, compact = false }: { notice: ClampNotice; compact?: boolean }) {
    const t = useT()
    return (
        <span
            data-testid="fader-clamp-note"
            role="status"
            className={
                compact
                    ? "block text-xs leading-tight text-center text-caution max-w-[56px] mb-0.5"
                    : "flex items-center gap-1 text-xs font-medium text-caution shrink-0"
            }
        >
            {!compact && <ShieldAlert aria-hidden className="w-3.5 h-3.5" />}
            {t("monitor.limitedTo", { db: formatDb(notice.applied) })}
        </span>
    )
}
