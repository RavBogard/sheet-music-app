"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Library, ListMusic, Settings, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"

interface NavItem {
    label: string
    href: string
    icon: typeof Home
    active: boolean
}

export function MobileTabBar() {
    const pathname = usePathname()
    const { isMember } = useAuth()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const congregation = useCongregation()

    // Tab order: Setlists (most used) → Library → Home (dashboard) → Monitor → Settings
    const navItems: NavItem[] = [
        {
            label: "Setlists",
            href: "/setlists",
            icon: ListMusic,
            active: pathname.startsWith("/setlists"),
        },
    ]

    // Library (member+)
    if (isMember) {
        navItems.push({
            label: "Library",
            href: "/library",
            icon: Library,
            active: pathname.startsWith("/library"),
        })
    }

    // Home — dashboard, center position
    navItems.push({
        label: "Home",
        href: "/",
        icon: Home,
        active: pathname === "/",
    })

    if (hasMonitorAccess && congregation.features.monitor && navItems.length < 5) {
        navItems.push({
            label: "Monitor",
            href: "/monitor",
            icon: Radio,
            active: pathname.startsWith("/monitor"),
        })
    }

    // Settings always last
    navItems.push({
        label: "Settings",
        href: "/settings",
        icon: Settings,
        active: pathname.startsWith("/settings"),
    })

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
            <div className="absolute inset-0 material-thick" />

            <div className="relative flex items-center justify-around h-16 sm:h-20 px-2">
                {navItems.map((item) => {
                    const Icon = item.icon
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group",
                                item.active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                            )}
                        >
                            <div className={cn(
                                "relative flex items-center justify-center w-12 h-8 rounded-full transition-colors duration-300",
                                item.active ? "bg-accent" : "bg-transparent"
                            )}>
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
            </div>
        </nav>
    )
}
