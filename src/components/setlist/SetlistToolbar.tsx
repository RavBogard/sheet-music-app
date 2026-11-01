"use client"

import { List, Calendar, Search, X } from "lucide-react"
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
    view: 'list' | 'calendar' | 'matrix'
    onViewChange: (view: 'list' | 'calendar' | 'matrix') => void
    /** @deprecated No longer used */
    showPersonalTab?: boolean
    searchQuery: string
    onSearchChange: (query: string) => void
    rabbiFilter: string
    onRabbiFilterChange: (rabbi: string) => void
    availableRabbis: string[]
}

export function SetlistToolbar({
    view, onViewChange,
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

                    <div role="group" aria-label={t("setlist.viewGroupLabel")} className="flex gap-1 rounded-lg border border-rule bg-card p-0.5 w-fit">
                        <Button
                            variant={view === 'list' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => onViewChange('list')}
                            className={`h-11 w-11 transition-all ${view === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                            aria-label={t("setlist.listViewLabel")}
                            aria-pressed={view === 'list'}
                            title={t("setlist.listViewTitle")}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={view === 'calendar' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => onViewChange('calendar')}
                            className={`h-11 w-11 transition-all ${view === 'calendar' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                            aria-label={t("setlist.calendarViewLabel")}
                            aria-pressed={view === 'calendar'}
                            title={t("setlist.calendarViewTitle")}
                        >
                            <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={view === 'matrix' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => onViewChange('matrix')}
                            className={`h-11 w-11 transition-all ${view === 'matrix' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                            aria-label={t("setlist.matrixViewLabel")}
                            aria-pressed={view === 'matrix'}
                            title={t("setlist.matrixViewTitle")}
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                        </Button>
                    </div>
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
