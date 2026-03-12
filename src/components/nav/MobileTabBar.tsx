"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Library, ListMusic, Radio, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"

interface NavItem {
    label: string
    href: string
    icon: typeof ListMusic
    active: boolean
}

export function MobileTabBar() {
    const pathname = usePathname()
    const { isMember, profile } = useAuth()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const congregation = useCongregation()
    const [keyboardOpen, setKeyboardOpen] = useState(false)
    const [monitorOpen, setMonitorOpen] = useState(false)

    const showMonitor = hasMonitorAccess && congregation.features.monitor

    // Establish monitor connection early so QuickMonitorPanel has data
    useMonitorConnection()

    useEffect(() => {
        const vv = window.visualViewport
        if (!vv) return
        const handler = () => {
            setKeyboardOpen(vv.height < window.innerHeight * 0.75)
        }
        vv.addEventListener("resize", handler)
        return () => vv.removeEventListener("resize", handler)
    }, [])

    const isMusician = profile?.role === 'musician' || profile?.role === 'band_leader' || profile?.role === 'admin'

    // Navigation tabs only: Setlists | Schedule* | Library
    const navItems: NavItem[] = [
        {
            label: "Setlists",
            href: "/setlists",
            icon: ListMusic,
            active: pathname.startsWith("/setlists"),
        },
    ]

    if (isMusician) {
        navItems.push({
            label: "Schedule",
            href: "/schedule",
            icon: CalendarDays,
            active: pathname.startsWith("/schedule"),
        })
    }

    // If no monitor access, show Library as third tab for members
    if (!showMonitor && isMember) {
        navItems.push({
            label: "Library",
            href: "/library",
            icon: Library,
            active: pathname.startsWith("/library"),
        })
    }

    const renderNavLink = (item: NavItem) => {
        const Icon = item.icon
        return (
            <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group",
                    item.active ? "text-brand" : "text-muted-foreground hover:text-brand/70"
                )}
            >
                <div className={cn(
                    "relative flex items-center justify-center w-14 h-10 rounded-2xl transition-all duration-300",
                    item.active
                        ? "bg-brand/15 shadow-[0_0_12px_oklch(0.50_0.20_275/0.3)] scale-100"
                        : "bg-transparent scale-90"
                )} style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
                    <Icon className={cn(
                        "w-6 h-6 transition-all duration-300",
                        item.active ? "text-brand stroke-[2.5px]" : "stroke-2"
                    )} />
                </div>
                <span className={cn(
                    "text-[11px] font-medium transition-colors",
                    item.active ? "text-brand font-bold" : "text-muted-foreground"
                )}>
                    {item.label}
                </span>
            </Link>
        )
    }

    return (
        <nav className={cn("fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe", keyboardOpen && "hidden")}>
            <div className="absolute inset-0 material-thick border-t border-brand/10" />

            <div className="relative flex items-center justify-around h-16 sm:h-20 px-2">
                {navItems.map(renderNavLink)}

                {/* Monitor tab: opens popover instead of navigating */}
                {showMonitor && (
                    <Popover open={monitorOpen} onOpenChange={setMonitorOpen}>
                        <PopoverTrigger asChild>
                            <button
                                aria-label="Monitor"
                                className={cn(
                                    "flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group",
                                    monitorOpen ? "text-brand" : "text-muted-foreground hover:text-brand/70"
                                )}
                            >
                                <div className={cn(
                                    "relative flex items-center justify-center w-14 h-10 rounded-2xl transition-all duration-300",
                                    monitorOpen
                                        ? "bg-brand/15 shadow-[0_0_12px_oklch(0.50_0.20_275/0.3)] scale-100"
                                        : "bg-transparent scale-90"
                                )} style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
                                    <Radio className={cn(
                                        "w-6 h-6 transition-all duration-300",
                                        monitorOpen ? "text-brand stroke-[2.5px]" : "stroke-2"
                                    )} />
                                </div>
                                <span className={cn(
                                    "text-[11px] font-medium transition-colors",
                                    monitorOpen ? "text-brand font-bold" : "text-muted-foreground"
                                )}>
                                    Monitor
                                </span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            side="top"
                            align="end"
                            className="w-[min(360px,calc(100vw-2rem))] p-0 bg-popover border-border mb-2"
                        >
                            <QuickMonitorPanel />
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        </nav>
    )
}
