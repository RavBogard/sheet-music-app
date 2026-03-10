"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Library, ListMusic, Radio, CalendarDays, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { MobileMenuDrawer } from "@/components/nav/MobileMenuDrawer"

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
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [keyboardOpen, setKeyboardOpen] = useState(false)

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
    const showMonitor = hasMonitorAccess && congregation.features.monitor

    // Fixed 4-tab layout: Setlists | Schedule* | Library/Monitor | Menu
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

    // Third slot: Monitor (if user has access) or Library (for members)
    if (showMonitor) {
        navItems.push({
            label: "Monitor",
            href: "/monitor",
            icon: Radio,
            active: pathname.startsWith("/monitor"),
        })
    } else if (isMember) {
        navItems.push({
            label: "Library",
            href: "/library",
            icon: Library,
            active: pathname.startsWith("/library"),
        })
    }

    // Check if current path is active in the drawer (not in tabs)
    const isDrawerPageActive = pathname === "/"
        || pathname.startsWith("/settings")
        || pathname.startsWith("/manage")
        || pathname.startsWith("/changelog")
        || (showMonitor && pathname.startsWith("/library"))
        || (!isMusician && pathname.startsWith("/schedule"))

    return (
        <>
            <nav className={cn("fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe", keyboardOpen && "hidden")}>
                <div className="absolute inset-0 material-thick border-t border-brand/10" />

                <div className="relative flex items-center justify-around h-16 sm:h-20 px-2">
                    {navItems.map((item) => {
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
                    })}

                    {/* Menu tab — opens drawer */}
                    <Button
                        variant="ghost"
                        aria-label="Menu"
                        onClick={() => setDrawerOpen(true)}
                        className={cn(
                            "flex flex-1 flex-col h-full py-2 rounded-none fluid-interaction group",
                            isDrawerPageActive || drawerOpen ? "text-brand" : "text-muted-foreground hover:text-brand/70 hover:bg-transparent"
                        )}
                    >
                        <div className={cn(
                            "relative flex items-center justify-center w-14 h-10 rounded-2xl transition-all duration-300",
                            isDrawerPageActive || drawerOpen
                                ? "bg-brand/15 shadow-[0_0_12px_oklch(0.50_0.20_275/0.3)] scale-100"
                                : "bg-transparent scale-90"
                        )} style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
                            <Menu className={cn(
                                "w-6 h-6 transition-all duration-300",
                                isDrawerPageActive || drawerOpen ? "text-brand stroke-[2.5px]" : "stroke-2"
                            )} />
                        </div>
                        <span className={cn(
                            "text-[11px] font-medium transition-colors",
                            isDrawerPageActive || drawerOpen ? "text-brand font-bold" : "text-muted-foreground"
                        )}>
                            Menu
                        </span>
                    </Button>
                </div>
            </nav>

            <MobileMenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        </>
    )
}
