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
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import type { T } from "@/i18n/core"
import type { Formatter } from "@/i18n/format"

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
    const t = useT()
    const fmt = useFormat()

    const isPending = assignment.status === 'pending'
    const isConfirmed = assignment.status === 'confirmed'
    const isDeclined = assignment.status === 'declined'

    const eventDateStr = formatAssignmentDate(assignment.eventDate, t, fmt)

    async function handleRespond(action: 'accept' | 'decline') {
        setResponding(action)
        try {
            const result = await respondToAssignment({
                assignmentId: assignment.id,
                action,
            })
            if (result.success) {
                toast.success(action === 'accept' ? t("schedule.toastConfirmed") : t("schedule.toastDeclined"))
            } else {
                toast.error(t("schedule.respondFailed"))
            }
        } catch (e) {
            toast.error(t("schedule.respondFailed"))
        } finally {
            setResponding(null)
        }
    }

    return (
        <div className={cn(
            "group relative rounded-lg border bg-card p-5 transition-all hover:shadow-md",
            isPending && "border-caution/30 bg-caution/5",
            isConfirmed && "border-success/30",
            isDeclined && "border-destructive/30 opacity-60",
            className,
        )}>
            {/* Status indicator */}
            <div className="absolute top-4 end-4">
                <StatusBadge status={assignment.status} autoConfirmed={assignment.autoConfirmed} />
            </div>

            {/* Service info */}
            <div className="space-y-3">
                <div>
                    <h3 className="font-semibold text-foreground pe-24 line-clamp-1">
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
                                    m.status === 'confirmed' ? "bg-success/10 text-success" :
                                        m.status === 'pending' ? "bg-caution/10 text-caution dark:text-caution" :
                                            "bg-muted text-muted-foreground"
                                )}>
                                    {m.instrument ? t("schedule.musicianWithInstrument", { musicianName: m.name, instrument: m.instrument }) : m.name}
                                </span>
                            ))}
                            {otherMusicians.length > 5 && (
                                <span className="text-xs text-muted-foreground">{t("schedule.moreMusicians", { count: otherMusicians.length - 5 })}</span>
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
                                className="gap-1.5 h-11 bg-success hover:bg-success/90 text-success-foreground"
                                onClick={() => handleRespond('accept')}
                                disabled={responding !== null}
                            >
                                {responding === 'accept' ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Check className="h-3.5 w-3.5" />
                                )}
                                {t("schedule.accept")}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 h-11 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                                onClick={() => handleRespond('decline')}
                                disabled={responding !== null}
                            >
                                {responding === 'decline' ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <X className="h-3.5 w-3.5" />
                                )}
                                {t("schedule.decline")}
                            </Button>
                        </>
                    )}

                    <Link href={`/setlists/${assignment.setlistId}`} className="ms-auto">
                        <Button size="sm" variant="ghost" className="gap-1.5 h-11 text-muted-foreground">
                            {t("schedule.viewSetlist")} <DirectionalIcon icon={ChevronRight} className="h-3.5 w-3.5" />
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

function StatusBadge({ status, autoConfirmed }: { status: string; autoConfirmed?: boolean }) {
    const t = useT()
    switch (status) {
        case 'confirmed':
            return (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                    <Check className="h-3 w-3 me-1" />
                    {autoConfirmed ? t("schedule.badgeAutoConfirmed") : t("schedule.badgeConfirmed")}
                </Badge>
            )
        case 'pending':
            return (
                <Badge variant="outline" className="bg-caution/10 text-caution dark:text-caution border-caution/30 animate-pulse">
                    <Clock className="h-3 w-3 me-1" />
                    {t("schedule.badgePending")}
                </Badge>
            )
        case 'declined':
            return (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                    <X className="h-3 w-3 me-1" />
                    {t("schedule.badgeDeclined")}
                </Badge>
            )
        default:
            return null
    }
}

/**
 * Compact assignment-card date format ("Fri, Feb 14", year shown only when
 * different from current). Intentionally distinct from the canonical
 * `formatEventDate` in `@/lib/firestore-helpers` (which uses long forms) —
 * the card layout needs a tighter string under the service title.
 */
function formatAssignmentDate(eventDate: unknown, t: T, fmt: Formatter): string {
    if (!eventDate) return t("schedule.cardDateTbd")

    try {
        let date: Date
        if (typeof eventDate === 'string') {
            date = new Date(eventDate)
        } else if (eventDate && typeof eventDate === 'object' && 'seconds' in eventDate) {
            date = new Date((eventDate as { seconds: number }).seconds * 1000)
        } else if (eventDate instanceof Date) {
            date = eventDate
        } else {
            return t("schedule.cardDateTbd")
        }

        if (isNaN(date.getTime())) return t("schedule.cardDateTbd")

        return fmt.date(date, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
        })
    } catch {
        return t("schedule.cardDateTbd")
    }
}
