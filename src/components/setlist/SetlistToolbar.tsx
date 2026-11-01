"use client"

import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useT } from "@/i18n/client"
import { SegmentedChips } from "@/components/ui/segmented-chips"

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

    return (
        <div className="shrink-0 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground px-1">
                    {t("setlist.allSetlists")}
                </h2>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) onSearchChange("") }}
                        className={`h-11 w-11 ${searchOpen ? "text-brand" : "text-muted-foreground"}`}
                        aria-label={searchOpen ? t("setlist.closeSearch") : t("setlist.searchSetlists")}
                        title={searchOpen ? t("setlist.closeSearch") : t("setlist.search")}
                    >
                        {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                    </Button>

                </div>
            </div>

            {/* Search bar + rabbi filter chips */}
            {searchOpen && (
                <div className="flex items-center gap-2">
                    <Input
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={t("setlist.searchPlaceholder")}
                        aria-label={t("setlist.searchSetlists")}
                        className="h-11 text-[15px]"
                        autoFocus
                    />
                </div>
            )}

            {availableRabbis.length > 0 && (
                <SegmentedChips
                    ariaLabel={t("setlist.rabbiFilterGroupLabel")}
                    value={rabbiFilter}
                    // Tapping the active rabbi again clears the filter, as before.
                    onChange={(v) => onRabbiFilterChange(v === rabbiFilter ? "" : v)}
                    options={[
                        { value: "", label: t("setlist.rabbiFilterAll") },
                        ...availableRabbis.map((r) => ({ value: r, label: t("setlist.rabbiFilterChip", { name: r }) })),
                    ]}
                />
            )}
        </div>
    )
}
