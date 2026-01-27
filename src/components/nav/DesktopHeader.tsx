"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, Bell, UserCircle, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function DesktopHeader() {
    const pathname = usePathname()

    const navLinks = [
        { label: "Dashboard", href: "/" },
        { label: "Library", href: "/library" },
        { label: "Setlists", href: "/setlists" },
        { label: "Audio", href: "/audio" },
    ]

    return (
        <header className="fixed top-0 left-0 right-0 h-16 z-50 hidden md:flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-md border-b border-white/5">
            {/* Logo Area */}
            <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-3 group">
                    <img
                        src="/logo.jpg"
                        alt="Logo"
                        className="w-8 h-8 rounded-full border border-zinc-700 transition-transform group-hover:scale-105"
                    />
                    <span className="font-bold text-lg bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        CRC Music
                    </span>
                </Link>

                {/* Main Nav */}
                <nav className="flex items-center gap-1">
                    {navLinks.map(link => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                                    isActive
                                        ? "bg-white/10 text-white"
                                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
                {/* Search Bar - Visual Only for now */}
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
                    <Input
                        placeholder="Search songs..."
                        className="w-64 bg-zinc-900/50 border-zinc-800 rounded-full pl-9 h-9 text-sm focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                    />
                </div>

                <div className="w-px h-6 bg-zinc-800" />

                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white rounded-full">
                    <Bell className="w-5 h-5" />
                </Button>

                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white rounded-full">
                    <UserCircle className="w-6 h-6" />
                </Button>
            </div>
        </header>
    )
}
