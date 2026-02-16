"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Library, ListMusic, Settings, Radio, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-context"

interface NavItem {
    label: string
    href: string
    icon: typeof Home
    active: boolean
    accent?: string  // override active color
}

export function MobileTabBar() {
    const pathname = usePathname()
    const { isMember, isAdmin } = useAuth()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const congregation = useCongregation()

    // Build nav items dynamically based on role (max 5 tabs)
    // Priority: Home, Setlists always. Then role-dependent middle slots. Settings always last.
    const navItems: NavItem[] = [
        {
            label: "Home",
            href: "/",
            icon: Home,
            active: pathname === "/",
        },
        {
            label: "Setlists",
            href: "/setlists",
            icon: ListMusic,
            active: pathname.startsWith("/setlists"),
        },
    ]

    // Middle slots (up to 2, based on role)
    if (isAdmin) {
        navItems.push({
            label: "Admin",
            href: "/admin",
            icon: ShieldAlert,
            active: pathname.startsWith("/admin"),
            accent: "violet",
        })
    }

    if (isMember) {
        navItems.push({
            label: "Library",
            href: "/library",
            icon: Library,
            active: pathname.startsWith("/library"),
        })
    }

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
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-t border-border" />

            <div className="relative flex items-center justify-around h-16 sm:h-20 px-2">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const activeColor = item.accent === "violet" ? "text-violet-400" : "text-blue-400"
                    const activeFill = item.accent === "violet" ? "fill-violet-400/20" : "fill-blue-400/20"
                    const activeGlow = item.accent === "violet" ? "bg-violet-500/20" : "bg-blue-500/20"

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 transition-all active:scale-95 group",
                                item.active ? activeColor : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <div className="relative">
                                <Icon className={cn(
                                    "w-6 h-6 transition-all duration-300",
                                    item.active && `${activeFill} stroke-[2.5px]`
                                )} />
                                {item.active && (
                                    <div className={cn("absolute -inset-2 blur-lg rounded-full opacity-50", activeGlow)} />
                                )}
                            </div>
                            <span className={cn(
                                "text-[10px] font-medium transition-colors",
                                item.active ? activeColor : "text-muted-foreground"
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
