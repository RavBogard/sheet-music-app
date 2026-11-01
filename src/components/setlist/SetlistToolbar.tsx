"use client"

import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useT } from "@/i18n/client"
import { SegmentedChips } from "@/components/ui/segmented-chips"
import { cn } from "@/lib/utils"

interface SetlistToolbarProps {
    /** @deprecated No longer used — kept for backward compat */
    activeTab?: 'personal' | 'public'
    /** @deprecated No longer used — kept for backward compat */
    onTabChange?: (tab: 'personal' | 'public') => void
    /** @deprecated No longer used */
    showPersonalTab?: boolean
    searchQuery: string
    onSearchChange: (query: string) => void
    rabbiFilter: string
    onRabbiFilterChange: (rabbi: string) => void
    availableRabbis: string[]
}

export function SetlistToolbar({
    searchQuery, onSearchChange,
    rabbiFilter, onRabbiFilterChange, availableRabbis,
}: SetlistToolbarProps) {
    const t = useT()
    const [searchOpen, setSearchOpen] = useState(!!searchQuery)

    const searchButton = (
        <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) onSearchChange("") }}
            className={cn("touch-hit shrink-0", searchOpen ? "text-brand" : "text-muted-foreground")}
            aria-label={searchOpen ? t("setlist.closeSearch") : t("setlist.searchSetlists")}
            title={searchOpen ? t("setlist.closeSearch") : t("setlist.search")}
        >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </Button>
    )

    // Option B: the rabbi chips and the search toggle at the end of the same
    // row; on a phone the chips wrap (nothing is clipped or hidden behind the
    // toggle). No "All setlists" label: the groups below have their own
    // headings.
    return (
        <div className="shrink-0 space-y-2">
            <div className="flex items-start gap-2">
                {availableRabbis.length > 0 ? (
                    <SegmentedChips
                        ariaLabel={t("setlist.rabbiFilterGroupLabel")}
                        value={rabbiFilter}
                        // Tapping the active rabbi again clears the filter, as before.
                        onChange={(v) => onRabbiFilterChange(v === rabbiFilter ? "" : v)}
                        className="min-w-0 flex-1"
                        options={[
                            { value: "", label: t("setlist.rabbiFilterAll") },
                            ...availableRabbis.map((r) => ({ value: r, label: t("setlist.rabbiFilterChip", { name: r }) })),
                        ]}
                    />
                ) : (
                    <span className="flex-1" />
                )}
                {searchButton}
            </div>

            {searchOpen && (
                <Input
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={t("setlist.searchPlaceholder")}
                    aria-label={t("setlist.searchSetlists")}
                    className="h-11 text-sm"
                    autoFocus
                />
            )}
        </div>
    )
}
