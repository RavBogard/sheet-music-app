"use client"

import { type UpcomingSetlistWithPrep } from "@/hooks/use-upcoming-prep"
import { Bell } from "lucide-react"
import { useT } from "@/i18n/client"

/**
 * Banner showing setlists that were updated since the user's last visit.
 * Uses the `isNew` flag from the prep hook (compares updatedAt vs lastVisitedAt).
 */
export function WhatsChangedBanner({
    items,
}: {
    items: UpcomingSetlistWithPrep[]
}) {
    const t = useT()
    const changedItems = items.filter(i => i.isNew)
    if (changedItems.length === 0) return null

    return (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
            <Bell className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-400">
                    {t("dashboard.setlistsUpdated", { count: changedItems.length })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {t("dashboard.changedSinceLastVisit", {
                        count: changedItems.length,
                        setlistNames: changedItems
                            .map(i => t("dashboard.quotedSetlistName", { setlistName: i.setlist.name }))
                            .join(t("dashboard.listSeparator")),
                    })}
                </p>
            </div>
        </div>
    )
}
