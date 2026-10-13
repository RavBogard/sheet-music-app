"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { reportSaveError } from "@/lib/save-error"
import {
    Notification,
    subscribeToNotifications,
    markAsRead,
    markAllAsRead,
} from "@/lib/notification-store"
import { useMusicStore } from "@/lib/store"
import { Bell, ListMusic, Upload, Shield, Calendar, CalendarCheck, CalendarX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useFormat, useT } from "@/i18n/client"
import type { T } from "@/i18n/core"
import type { Formatter } from "@/i18n/format"

const ICON_MAP: Record<string, typeof Bell> = {
    setlist_published: ListMusic,
    setlist_updated: ListMusic,
    chart_uploaded: Upload,
    role_changed: Shield,
    general: Bell,
    scheduling_request: Calendar,
    scheduling_confirmed: CalendarCheck,
    scheduling_declined: CalendarX,
    scheduling_reminder: Calendar,
    scheduling_cancelled: CalendarX,
}

export function NotificationBell() {
    const t = useT()
    const fmt = useFormat()
    const { user } = useAuth()
    const router = useRouter()
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    // v4.3 P04: memoize so unrelated parent re-renders don't reduce over
    // the notifications list on every paint.
    const unreadCount = useMemo(
        () => notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
        [notifications],
    )

    const gigModeActive = useMusicStore(s => s.gigModeActive)

    // Subscribe to notifications
    useEffect(() => {
        if (!user?.uid || gigModeActive) return
        return subscribeToNotifications(user.uid, setNotifications)
    }, [user?.uid, gigModeActive])

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    if (!user) return null

    const handleClick = async (notif: Notification) => {
        if (!notif.read) {
            await markAsRead(user.uid, notif.id).catch(err => reportSaveError(err, "notification"))
        }
        if (notif.link) {
            router.push(notif.link)
            setOpen(false)
        }
    }

    const handleMarkAllRead = async () => {
        await markAllAsRead(user.uid).catch(err => reportSaveError(err, "notifications"))
    }

    return (
        <div className="relative" ref={ref}>
            {/* Bell button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(!open)}
                className="relative"
                aria-label={t("nav.notifications")}
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </Button>

            {/* Dropdown */}
            {open && (
                <div className="absolute end-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                        <span className="text-sm font-semibold text-foreground">{t("nav.notifications")}</span>
                        {unreadCount > 0 && (
                            <Button
                                variant="link"
                                size="xs"
                                onClick={handleMarkAllRead}
                                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                            >
                                {t("nav.markAllRead")}
                            </Button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                {t("nav.noNotifications")}
                            </div>
                        ) : (
                            notifications.map(notif => {
                                const Icon = ICON_MAP[notif.type] || Bell
                                const timeAgo = notif.createdAt
                                    ? formatTimeAgo(notif.createdAt.toDate(), t, fmt)
                                    : ''

                                return (
                                    <Button
                                        variant="ghost"
                                        key={notif.id}
                                        onClick={() => handleClick(notif)}
                                        className={`w-full h-auto items-start gap-3 px-4 py-3 rounded-none justify-start text-start hover:bg-accent/50 ${!notif.read ? 'bg-violet-500/5' : ''}`}
                                    >
                                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${!notif.read ? 'bg-violet-500/10 text-violet-500' : 'bg-muted text-muted-foreground'}`}>
                                            <Icon className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm ${!notif.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                {notif.title}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                                {notif.body}
                                            </div>
                                            {timeAgo && (
                                                <div className="text-[10px] text-muted-foreground/70 mt-1">
                                                    {timeAgo}
                                                </div>
                                            )}
                                        </div>
                                        {!notif.read && (
                                            <div className="w-2 h-2 rounded-full bg-violet-500 mt-2 shrink-0" />
                                        )}
                                    </Button>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function formatTimeAgo(date: Date, t: T, fmt: Formatter): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return t("nav.justNow")
    if (seconds < 3600) return t("nav.minutesAgo", { minutes: Math.floor(seconds / 60) })
    if (seconds < 86400) return t("nav.hoursAgo", { hours: Math.floor(seconds / 3600) })
    if (seconds < 604800) return t("nav.daysAgo", { days: Math.floor(seconds / 86400) })
    return fmt.date(date, { month: 'short', day: 'numeric' })
}
