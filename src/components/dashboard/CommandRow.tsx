"use client"

import Link from "next/link"
import { FileMusic, ListMusic, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Compact horizontal command row — always above the fold.
 * Uses <Link> for navigation actions (enables automatic prefetching)
 * and <button> for non-navigation actions (AI chat).
 */
export function CommandRow({
    isMember,
    isBandLeader,
    isLoggedIn,
    onAI,
    hasAI,
    className,
}: {
    isMember: boolean
    isBandLeader: boolean
    isLoggedIn: boolean
    onLibrary?: () => void
    onSetlists?: () => void
    onNewSetlist?: () => void
    onAI: () => void
    hasAI: boolean
    className?: string
}) {
    if (!isLoggedIn && !isMember) return null

    const actions: { icon: typeof FileMusic; label: string; href?: string; onClick?: () => void; color: string }[] = []

    actions.push({ icon: FileMusic, label: 'Library', href: '/library', color: 'text-blue-500 bg-blue-500/10' })
    actions.push({ icon: ListMusic, label: 'Setlists', href: '/setlists', color: 'text-emerald-500 bg-emerald-500/10' })

    if (hasAI && isMember) {
        actions.push({ icon: Sparkles, label: 'Ask AI', onClick: onAI, color: 'text-violet-500 bg-violet-500/10' })
    }

    if (isBandLeader) {
        actions.push({ icon: Plus, label: 'New', href: '/setlists/new', color: 'text-amber-500 bg-amber-500/10' })
    }

    const sharedClasses = "flex items-center justify-center gap-2 py-3 px-2 bg-card hover:bg-accent rounded-xl transition-all active:scale-95 border border-border group"

    return (
        <div className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${actions.length}, 1fr)` }}>
            {actions.map(({ icon: Icon, label, href, onClick, color }) => {
                const content = (
                    <>
                        <div className={cn("p-1.5 rounded-lg", color)}>
                            <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                            {label}
                        </span>
                    </>
                )

                if (href) {
                    return (
                        <Link key={label} href={href} className={sharedClasses}>
                            {content}
                        </Link>
                    )
                }

                return (
                    <Button key={label} variant="ghost" onClick={onClick} className={sharedClasses}>
                        {content}
                    </Button>
                )
            })}
        </div>
    )
}
