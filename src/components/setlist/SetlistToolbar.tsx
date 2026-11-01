"use client"

import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * The search toggle. On /setlists it sits in the head row beside "New
 * setlist" (Daniel 2026-11-01: no filter row above the list; the rabbi chips
 * are gone and search matches a rabbi's name instead).
 */
export function SetlistSearchButton({
    open, onOpenChange, onSearchChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSearchChange: (query: string) => void
}) {
    const t = useT()
    return (
        <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { onOpenChange(!open); if (open) onSearchChange("") }}
            className={cn("touch-hit shrink-0", open ? "text-brand" : "text-muted-foreground")}
            aria-label={open ? t("setlist.closeSearch") : t("setlist.searchSetlists")}
            title={open ? t("setlist.closeSearch") : t("setlist.search")}
        >
            {open ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </Button>
    )
}

export function SetlistSearchField({
    searchQuery, onSearchChange,
}: {
    searchQuery: string
    onSearchChange: (query: string) => void
}) {
    const t = useT()
    return (
        <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("setlist.searchPlaceholder")}
            aria-label={t("setlist.searchSetlists")}
            className="h-11 text-sm"
            autoFocus
        />
    )
}

interface SetlistToolbarProps {
    searchQuery: string
    onSearchChange: (query: string) => void
}

/** The toggle and the field together, for callers without a head row. */
export function SetlistToolbar({ searchQuery, onSearchChange }: SetlistToolbarProps) {
    const [searchOpen, setSearchOpen] = useState(!!searchQuery)
    return (
        <div className="shrink-0 space-y-2">
            <div className="flex justify-end">
                <SetlistSearchButton open={searchOpen} onOpenChange={setSearchOpen} onSearchChange={onSearchChange} />
            </div>
            {searchOpen && <SetlistSearchField searchQuery={searchQuery} onSearchChange={onSearchChange} />}
        </div>
    )
}
