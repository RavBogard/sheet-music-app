"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Library, ListMusic, Radio, CalendarDays, Menu } from "lucide-react"
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
        || pathname.startsWith("/tasks")
        || pathname.startsWith("/settings")
        || pathname.startsWith("/manage")
        || pathname.startsWith("/changelog")
        || (showMonitor && pathname.startsWith("/library"))
        || (!isMusician && pathname.startsWith("/schedule"))

    return (
        <>
            <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
                <div className="absolute inset-0 material-thick" />

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
                                    item.active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                                )}
                            >
                                <div className={cn(
                                    "relative flex items-center justify-center w-12 h-8 rounded-full transition-all duration-300",
                                    item.active
                                        ? "bg-accent scale-100"
                                        : "bg-transparent scale-90"
                                )} style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
                                    <Icon className={cn(
                                        "w-5 h-5 transition-all duration-300",
                                        item.active ? "fill-foreground/20 stroke-[2.5px]" : "stroke-2"
                                    )} />
                                </div>
                                <span className={cn(
                                    "text-[10px] font-medium transition-colors",
                                    item.active ? "text-foreground font-semibold" : "text-muted-foreground"
                                )}>
                                    {item.label}
                                </span>
                            </Link>
                        )
                    })}

                    {/* Menu tab — opens drawer */}
                    <button
                        aria-label="Menu"
                        onClick={() => setDrawerOpen(true)}
                        className={cn(
                            "flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group",
                            isDrawerPageActive || drawerOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                        )}
                    >
                        <div className={cn(
                            "relative flex items-center justify-center w-12 h-8 rounded-full transition-all duration-300",
                            isDrawerPageActive || drawerOpen
                                ? "bg-accent scale-100"
                                : "bg-transparent scale-90"
                        )} style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
                            <Menu className={cn(
                                "w-5 h-5 transition-all duration-300",
                                isDrawerPageActive || drawerOpen ? "stroke-[2.5px]" : "stroke-2"
                            )} />
                        </div>
                        <span className={cn(
                            "text-[10px] font-medium transition-colors",
                            isDrawerPageActive || drawerOpen ? "text-foreground font-semibold" : "text-muted-foreground"
                        )}>
                            Menu
                        </span>
                    </button>
                </div>
            </nav>

            <MobileMenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        </>
    )
}
