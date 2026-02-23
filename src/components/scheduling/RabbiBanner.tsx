"use client"

import { Music, Guitar, Mic2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCongregation } from "@/lib/congregation-store"
import type { RabbiProfile } from "@/types/models"

interface RabbiBannerProps {
    rabbiName?: string
    className?: string
}

/**
 * Contextual banner showing how the leading rabbi affects band needs.
 * Displayed in MusicianPicker when a rabbi is set on the setlist.
 */
export function RabbiBanner({ rabbiName, className }: RabbiBannerProps) {
    const config = useCongregation()
    const profiles = config.scheduling?.rabbiProfiles

    if (!rabbiName) return null

    // Try to match against configured rabbi profiles
    const profile = profiles?.find(p =>
        rabbiName.toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(rabbiName.toLowerCase())
    )

    if (!profile) {
        // Unknown rabbi — no guidance available
        return null
    }

    const roleConfig = getRoleConfig(profile)

    return (
        <div className={cn(
            "flex items-start gap-3 px-4 py-3 rounded-lg border text-sm",
            roleConfig.bgClass,
            roleConfig.borderClass,
            className,
        )}>
            <roleConfig.Icon className={cn("h-4 w-4 mt-0.5 shrink-0", roleConfig.iconClass)} />
            <div>
                <span className={cn("font-medium", roleConfig.textClass)}>
                    {profile.name}
                </span>
                <span className="text-muted-foreground"> — {profile.bandSizeGuidance}</span>
                {profile.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{profile.notes}</p>
                )}
            </div>
        </div>
    )
}

function getRoleConfig(profile: RabbiProfile) {
    switch (profile.musicalRole) {
        case 'band_leader':
            return {
                Icon: Guitar,
                bgClass: 'bg-emerald-500/5',
                borderClass: 'border-emerald-500/20',
                iconClass: 'text-emerald-600 dark:text-emerald-400',
                textClass: 'text-emerald-700 dark:text-emerald-300',
            }
        case 'strummer':
            return {
                Icon: Mic2,
                bgClass: 'bg-amber-500/5',
                borderClass: 'border-amber-500/20',
                iconClass: 'text-amber-600 dark:text-amber-400',
                textClass: 'text-amber-700 dark:text-amber-300',
            }
        case 'non_musical':
            return {
                Icon: AlertCircle,
                bgClass: 'bg-blue-500/5',
                borderClass: 'border-blue-500/20',
                iconClass: 'text-blue-600 dark:text-blue-400',
                textClass: 'text-blue-700 dark:text-blue-300',
            }
        default:
            return {
                Icon: Music,
                bgClass: 'bg-muted/50',
                borderClass: 'border-border',
                iconClass: 'text-muted-foreground',
                textClass: 'text-foreground',
            }
    }
}
