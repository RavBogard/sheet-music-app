"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Library, ListMusic, Mic2, PlayCircle, Settings, Music2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function MobileTabBar() {
    const pathname = usePathname()

    const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`)

    const navItems = [
        {
            label: "Home",
            href: "/",
            icon: Home,
            active: pathname === "/"
        },
        {
            label: "Setlists",
            href: "/setlists",
            icon: ListMusic,
            active: pathname.startsWith("/setlists")
        },
        {
            label: "Library",
            href: "/library",
            icon: Library,
            active: pathname.startsWith("/library")
        },
        {
            label: "Settings",
            href: "/settings",
            icon: Settings,
            active: pathname.startsWith("/settings")
        }
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
            {/* Glassmorphism Background */}
            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl border-t border-white/10" />

            <div className="relative flex items-center justify-around h-16 sm:h-20 px-2">
                {navItems.map((item) => {
                    const Icon = item.icon

                    // Standard Tab Item
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 transition-all active:scale-95 group",
                                item.active ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            <div className="relative">
                                <Icon className={cn(
                                    "w-6 h-6 transition-all duration-300",
                                    item.active && "fill-blue-400/20 stroke-[2.5px]"
                                )} />
                                {item.active && (
                                    <div className="absolute -inset-2 bg-blue-500/20 blur-lg rounded-full opacity-50" />
                                )}
                            </div>
                            <span className={cn(
                                "text-[10px] font-medium transition-colors",
                                item.active ? "text-blue-400" : "text-zinc-500"
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
