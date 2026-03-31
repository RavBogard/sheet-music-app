"use client"

import { useState } from "react"
import { Calendar, Music, Check, X, Clock, Users, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { respondToAssignment } from "@/lib/scheduling-firebase"
import { toast } from "sonner"
import type { SchedulingAssignment } from "@/types/models"
import Link from "next/link"

interface ScheduleCardProps {
    assignment: SchedulingAssignment
    /** Other musicians confirmed for the same setlist */
    otherMusicians?: Array<{ name: string; instrument?: string; status: string }>
    className?: string
}

/**
 * Card showing a single service assignment for a musician.
 * Displays service info, instrument, other musicians, and accept/decline actions.
 */
export function ScheduleCard({ assignment, otherMusicians, className }: ScheduleCardProps) {
    const [responding, setResponding] = useState<'accept' | 'decline' | null>(null)

    const isPending = assignment.status === 'pending'
    const isConfirmed = assignment.status === 'confirmed'
    const isDeclined = assignment.status === 'declined'

    const eventDateStr = formatEventDate(assignment.eventDate)

    async function handleRespond(action: 'accept' | 'decline') {
        setResponding(action)
        try {
            const result = await respondToAssignment({
                assignmentId: assignment.id,
                action,
            })
            if (result.success) {
                toast.success(action === 'accept' ? 'Confirmed!' : 'Declined')
            } else {
                toast.error('Failed to respond')
            }
        } catch (e) {
            toast.error('Failed to respond')
        } finally {
            setResponding(null)
        }
    }

    return (
        <div className={cn(
            "group relative rounded-xl border bg-card p-5 transition-all hover:shadow-md",
            isPending && "border-amber-500/30 bg-amber-500/5",
            isConfirmed && "border-emerald-500/30",
            isDeclined && "border-red-500/30 opacity-60",
            className,
        )}>
            {/* Status indicator */}
            <div className="absolute top-4 right-4">
                <StatusBadge status={assignment.status} autoConfirmed={assignment.autoConfirmed} />
            </div>

            {/* Service info */}
            <div className="space-y-3">
                <div>
                    <h3 className="font-semibold text-foreground pr-24 line-clamp-1">
                        {assignment.setlistName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{eventDateStr}</span>
                    </div>
                </div>

                {/* My instrument */}
                {assignment.instrument && (
                    <div className="flex items-center gap-2 text-sm">
                        <Music className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{assignment.instrument}</span>
                    </div>
                )}

                {/* Other musicians */}
                {otherMusicians && otherMusicians.length > 0 && (
                    <div className="flex items-start gap-2 text-sm">
                        <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                        <div className="flex flex-wrap gap-1.5">
                            {otherMusicians.slice(0, 5).map((m, i) => (
                                <span key={i} className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                                    m.status === 'confirmed' ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
                                        m.status === 'pending' ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" :
                                            "bg-muted text-muted-foreground"
                                )}>
                                    {m.name}{m.instrument ? ` (${m.instrument})` : ''}
                                </span>
                            ))}
                            {otherMusicians.length > 5 && (
                                <span className="text-xs text-muted-foreground">+{otherMusicians.length - 5} more</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                    {isPending && (
                        <>
                            <Button
                                size="sm"
                                variant="default"
                                className="gap-1.5 h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => handleRespond('accept')}
                                disabled={responding !== null}
                            >
                                {responding === 'accept' ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Check className="h-3.5 w-3.5" />
                                )}
                                Accept
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 h-11 text-red-600 hover:bg-red-500/10 hover:text-red-600 border-red-500/30"
                                onClick={() => handleRespond('decline')}
                                disabled={responding !== null}
                            >
                                {responding === 'decline' ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <X className="h-3.5 w-3.5" />
                                )}
                                Decline
                            </Button>
                        </>
                    )}

                    <Link href={`/setlists/${assignment.setlistId}`} className="ml-auto">
                        <Button size="sm" variant="ghost" className="gap-1.5 h-11 text-muted-foreground">
                            View Setlist <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

function StatusBadge({ status, autoConfirmed }: { status: string; autoConfirmed?: boolean }) {
    switch (status) {
        case 'confirmed':
            return (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    <Check className="h-3 w-3 mr-1" />
                    {autoConfirmed ? 'Auto-confirmed' : 'Confirmed'}
                </Badge>
            )
        case 'pending':
            return (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 animate-pulse">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                </Badge>
            )
        case 'declined':
            return (
                <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30">
                    <X className="h-3 w-3 mr-1" />
                    Declined
                </Badge>
            )
        default:
            return null
    }
}

function formatEventDate(eventDate: unknown): string {
    if (!eventDate) return 'Date TBD'

    try {
        let date: Date
        if (typeof eventDate === 'string') {
            date = new Date(eventDate)
        } else if (eventDate && typeof eventDate === 'object' && 'seconds' in eventDate) {
            date = new Date((eventDate as { seconds: number }).seconds * 1000)
        } else if (eventDate instanceof Date) {
            date = eventDate
        } else {
            return 'Date TBD'
        }

        if (isNaN(date.getTime())) return 'Date TBD'

        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
        })
    } catch {
        return 'Date TBD'
    }
}
