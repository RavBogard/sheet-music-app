"use client"

import { List, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SetlistToolbarProps {
    activeTab: 'personal' | 'public'
    onTabChange: (tab: 'personal' | 'public') => void
    view: 'list' | 'calendar'
    onViewChange: (view: 'list' | 'calendar') => void
    showPersonalTab: boolean
}

export function SetlistToolbar({ activeTab, onTabChange, view, onViewChange, showPersonalTab }: SetlistToolbarProps) {
    return (
        <div className="px-6 pt-6 shrink-0 flex items-center justify-between">
            <div className="flex bg-card p-1 rounded-xl w-fit">
                <Button
                    variant={activeTab === 'public' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => onTabChange('public')}
                    className={`transition-all ${activeTab === 'public' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                >
                    Public Library
                </Button>
                {showPersonalTab && (
                    <Button
                        variant={activeTab === 'personal' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => onTabChange('personal')}
                        className={`transition-all ${activeTab === 'personal' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                    >
                        My Personal
                    </Button>
                )}
            </div>

            <div className="flex bg-card p-1 rounded-xl w-fit">
                <Button
                    variant={view === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => onViewChange('list')}
                    className={`h-9 w-9 transition-all ${view === 'list' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                    title="List View"
                >
                    <List className="h-4 w-4" />
                </Button>
                <Button
                    variant={view === 'calendar' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => onViewChange('calendar')}
                    className={`h-9 w-9 transition-all ${view === 'calendar' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                    title="Calendar View"
                >
                    <Calendar className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
