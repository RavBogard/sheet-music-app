"use client"

import { FileMusic, ListMusic, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Compact horizontal command row — always above the fold.
 */
export function CommandRow({
    isMember,
    isBandLeader,
    isLoggedIn,
    onLibrary,
    onSetlists,
    onNewSetlist,
    onAI,
    hasAI,
    className,
}: {
    isMember: boolean
    isBandLeader: boolean
    isLoggedIn: boolean
    onLibrary: () => void
    onSetlists: () => void
    onNewSetlist: () => void
    onAI: () => void
    hasAI: boolean
    className?: string
}) {
    if (!isLoggedIn && !isMember) return null

    const actions: { icon: typeof FileMusic; label: string; onClick: () => void; color: string }[] = []

    actions.push({ icon: FileMusic, label: 'Library', onClick: onLibrary, color: 'text-blue-500 bg-blue-500/10' })
    actions.push({ icon: ListMusic, label: 'Setlists', onClick: onSetlists, color: 'text-emerald-500 bg-emerald-500/10' })

    if (hasAI && isMember) {
        actions.push({ icon: Sparkles, label: 'Ask AI', onClick: onAI, color: 'text-violet-500 bg-violet-500/10' })
    }

    if (isBandLeader) {
        actions.push({ icon: Plus, label: 'New', onClick: onNewSetlist, color: 'text-amber-500 bg-amber-500/10' })
    }

    return (
        <div className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${actions.length}, 1fr)` }}>
            {actions.map(({ icon: Icon, label, onClick, color }) => (
                <button
                    key={label}
                    onClick={onClick}
                    className="flex items-center justify-center gap-2 py-3 px-2 bg-card hover:bg-accent rounded-xl transition-all active:scale-95 border border-border group"
                >
                    <div className={cn("p-1.5 rounded-lg", color)}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                        {label}
                    </span>
                </button>
            ))}
        </div>
    )
}
