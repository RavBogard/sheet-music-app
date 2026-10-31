"use client"

import { useT } from "@/i18n/client"
import { useMonitorStore } from "@/lib/monitor-store"

/**
 * MIXER-15: someone on two or more wedge buses picks which one they are
 * mixing. Renders nothing for the usual one-bus musician.
 */
export function BusSwitcher({ compact = false }: { compact?: boolean }) {
    const t = useT()
    const buses = useMonitorStore((s) => s.myBusIndices) ?? []
    const current = useMonitorStore((s) => s.myBusIndex)
    const selectBus = useMonitorStore((s) => s.selectBus)
    if (buses.length < 2) return null
    return (
        <div role="radiogroup" aria-label={t("monitor.busSwitcher")} data-testid="bus-switcher" className="inline-flex gap-1 rounded-lg bg-muted/60 p-1">
            {buses.map((b) => {
                const on = b === current
                return (
                    <button
                        key={b}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => selectBus(b)}
                        className={`min-h-[44px] ${compact ? "min-w-[44px] px-2 text-xs" : "px-3 text-sm"} rounded-md font-semibold tabular-nums cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        {t("monitor.busOption", { bus: b })}
                    </button>
                )
            })}
        </div>
    )
}
