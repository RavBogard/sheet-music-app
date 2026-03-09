"use client"

import { List, Calendar, Search, X, Grid3X3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"

interface SetlistToolbarProps {
    activeTab: 'personal' | 'public'
    onTabChange: (tab: 'personal' | 'public') => void
    view: 'list' | 'calendar' | 'matrix'
    onViewChange: (view: 'list' | 'calendar' | 'matrix') => void
    showPersonalTab: boolean
    searchQuery: string
    onSearchChange: (query: string) => void
    rabbiFilter: string
    onRabbiFilterChange: (rabbi: string) => void
    availableRabbis: string[]
}

export function SetlistToolbar({
    activeTab, onTabChange, view, onViewChange, showPersonalTab,
    searchQuery, onSearchChange,
    rabbiFilter, onRabbiFilterChange, availableRabbis,
}: SetlistToolbarProps) {
    const [searchOpen, setSearchOpen] = useState(!!searchQuery)

    return (
        <div className="px-6 pt-6 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex bg-card p-1 rounded-xl w-fit">
                    <Button
                        variant={activeTab === 'public' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => onTabChange('public')}
                        className={`transition-all ${activeTab === 'public' ? 'bg-brand/15 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-brand/5'}`}
                    >
                        Public Library
                    </Button>
                    {showPersonalTab && (
                        <Button
                            variant={activeTab === 'personal' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => onTabChange('personal')}
                            className={`transition-all ${activeTab === 'personal' ? 'bg-brand/15 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-brand/5'}`}
                        >
                            My Personal
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) onSearchChange("") }}
                        className={`h-9 w-9 ${searchOpen ? "text-brand" : "text-muted-foreground"}`}
                        title="Search"
                    >
                        {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                    </Button>

                    <div className="flex bg-card p-1 rounded-xl w-fit">
                        <Button
                            variant={view === 'list' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => onViewChange('list')}
                            className={`h-9 w-9 transition-all ${view === 'list' ? 'bg-brand/15 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-brand/5'}`}
                            title="List View"
                        >
                            <List className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={view === 'calendar' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => onViewChange('calendar')}
                            className={`h-9 w-9 transition-all ${view === 'calendar' ? 'bg-brand/15 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-brand/5'}`}
                            title="Calendar View"
                        >
                            <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={view === 'matrix' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => onViewChange('matrix')}
                            className={`h-9 w-9 transition-all ${view === 'matrix' ? 'bg-brand/15 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-brand/5'}`}
                            title="Matrix View"
                        >
                            <Grid3X3 className="h-4 w-4" />
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
                        placeholder="Search setlists..."
                        className="h-9 text-sm"
                        autoFocus
                    />
                </div>
            )}

            {availableRabbis.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                    <button
                        onClick={() => onRabbiFilterChange("")}
                        className={`px-2.5 py-1 rounded-full text-xs transition-colors ${!rabbiFilter ? "bg-brand text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        All
                    </button>
                    {availableRabbis.map((r) => (
                        <button
                            key={r}
                            onClick={() => onRabbiFilterChange(rabbiFilter === r ? "" : r)}
                            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${rabbiFilter === r ? "bg-brand text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            Rabbi {r}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
