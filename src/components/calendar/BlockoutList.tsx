"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { deleteBlockout } from "@/lib/scheduling-firebase"
import { toast } from "sonner"
import type { MusicianBlockout } from "@/types/models"

interface BlockoutListProps {
    blockouts: MusicianBlockout[]
}

function formatDateRange(start: string, end: string): string {
    const s = new Date(start + 'T12:00:00')
    const e = new Date(end + 'T12:00:00')
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    if (start === end) return s.toLocaleDateString('en-US', opts)
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

function todayKey(): string {
    return new Date().toISOString().split('T')[0]
}

export function BlockoutList({ blockouts }: BlockoutListProps) {
    const active = blockouts.filter(b => b.endDate >= todayKey())
    if (active.length === 0) return null

    async function handleDelete(id: string) {
        try {
            await deleteBlockout(id)
            toast.success('Blockout removed')
        } catch {
            toast.error('Failed to remove blockout')
        }
    }

    return (
        <div className="p-4 border-t border-border/40 space-y-2.5">
            <h4 className="text-eyebrow">Active Blockouts</h4>
            <div className="space-y-2">
                {active.map(b => (
                    <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-card/70 border border-red-500/15 transition-all duration-200 hover:border-red-500/30 hover:shadow-sm">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-500/20 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                                {formatDateRange(b.startDate, b.endDate)}
                            </p>
                            {b.reason && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{b.reason}</p>
                            )}
                        </div>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0 transition-colors duration-200"
                            onClick={() => handleDelete(b.id)}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    )
}
