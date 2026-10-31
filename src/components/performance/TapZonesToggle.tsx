"use client"

import { Columns3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMusicStore } from "@/lib/store"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * PERF-05 per-device off switch: "Tap edges to turn pages". Default ON,
 * persisted in `music-storage` (`tapZonesEnabled`), so each iPad keeps its
 * own setting. The icon's three columns stand for the three tap zones.
 */
export function TapZonesToggle({ className }: { className?: string }) {
    const t = useT()
    const enabled = useMusicStore((s) => s.tapZonesEnabled)
    const setEnabled = useMusicStore((s) => s.setTapZonesEnabled)
    const label = t("perform.toolbar.tapEdges")
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="tap-zones-toggle"
            aria-pressed={enabled}
            aria-label={label}
            title={label}
            onClick={() => setEnabled(!enabled)}
            className={cn(
                "h-11 min-w-11 cursor-pointer [touch-action:manipulation]",
                enabled ? "text-primary bg-primary/10 hover:bg-primary/15" : "text-muted-foreground",
                className,
            )}
        >
            <Columns3 className="h-5 w-5" aria-hidden="true" />
        </Button>
    )
}
