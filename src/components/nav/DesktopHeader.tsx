"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Search, UserCircle, LogOut, Settings, CloudOff, Sparkles, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore } from "@/lib/store"
import { useChatStore } from "@/lib/chat-store"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { DriveFile } from "@/types/models"

export function DesktopHeader() {
    const pathname = usePathname()
    const router = useRouter()
    const { user, profile, isMember, isAdmin, signIn, signOut } = useAuth()
    const { allFiles, loadLibrary } = useLibraryStore()
    const { setQueue } = useMusicStore()
    const { toggle: toggleChat, isOpen: isChatOpen } = useChatStore()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()

    // Search
    const [searchQuery, setSearchQuery] = useState("")
    const [showResults, setShowResults] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    const navLinks = [
        { label: "Home", href: "/", show: true },
        { label: "Setlists", href: "/setlists", show: true },
        { label: "Library", href: "/library", show: isMember },
        { label: "Monitor", href: "/monitor", show: hasMonitorAccess },
        { label: "Admin", href: "/admin", show: isAdmin },
    ]

    const searchResults = searchQuery.length > 1
        ? allFiles.filter(f =>
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            f.mimeType !== "application/vnd.google-apps.folder"
        ).slice(0, 8)
        : []

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) setShowResults(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        if (user) loadLibrary()
    }, [user, loadLibrary])

    const handleSelectSong = (file: DriveFile) => {
        const type = file.name.endsWith(".xml") || file.name.endsWith(".musicxml") ? "musicxml" : "pdf"
        setQueue([{ name: file.name.replace(/\.[^/.]+$/, ""), fileId: file.id, type }])
        router.push(`/perform/${file.id}`)
        setSearchQuery("")
        setShowResults(false)
    }

    const [isOnline, setIsOnline] = useState(true)
    useEffect(() => {
        setIsOnline(navigator.onLine)
        const on = () => setIsOnline(true)
        const off = () => setIsOnline(false)
        window.addEventListener("online", on)
        window.addEventListener("offline", off)
        return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
    }, [])

    return (
        <header className="fixed top-0 left-0 right-0 h-16 z-50 hidden md:flex items-center justify-between px-6 bg-background/80 backdrop-blur-md border-b border-border">
            {/* Logo + Nav */}
            <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-3 group">
                    <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-full border border-border transition-transform group-hover:scale-105" />
                    <span className="font-bold text-lg text-foreground">CRC Music</span>
                </Link>

                <nav className="flex items-center gap-1">
                    {navLinks.filter(l => l.show).map(link => {
                        const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))
                        return (
                            <Link key={link.href} href={link.href}
                                className={cn(
                                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                                    isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent",
                                    link.label === "Admin" && "text-violet-500 hover:text-violet-400"
                                )}>
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
                {user ? (
                    <>
                        {!isOnline && (
                            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-medium border border-red-500/20">
                                <CloudOff className="h-3 w-3" /> Offline
                            </div>
                        )}

                        {/* AI Chat */}
                        <Button
                            variant={isChatOpen ? "default" : "ghost"} size="sm" onClick={toggleChat}
                            className={cn(
                                "gap-2 rounded-full transition-colors",
                                isChatOpen ? "bg-purple-600 hover:bg-purple-500 text-white" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                        >
                            <Sparkles className="h-4 w-4" />
                            <span className="hidden lg:inline">AI Assistant</span>
                        </Button>

                        {/* Search */}
                        <div className="relative group" ref={searchRef}>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                            <Input
                                placeholder="Search songs..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true) }}
                                onFocus={() => setShowResults(true)}
                                className="w-64 bg-muted border-border rounded-full pl-9 h-9 text-sm focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                            />
                            {showResults && searchResults.length > 0 && (
                                <div className="absolute top-full mt-2 left-0 right-0 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                                    <div className="p-2 space-y-1">
                                        {searchResults.map(file => (
                                            <button key={file.id} onClick={() => handleSelectSong(file)}
                                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors group">
                                                <div className="text-sm font-medium text-foreground group-hover:text-foreground truncate">
                                                    {file.name.replace(/\.[^/.]+$/, "")}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-px h-6 bg-border" />

                        {/* Profile */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"
                                    className={cn("text-muted-foreground hover:text-foreground rounded-full overflow-hidden transition-all", !isOnline && "ring-2 ring-red-500")}>
                                    {user?.photoURL ? (
                                        <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-border" />
                                    ) : (
                                        <UserCircle className="w-6 h-6" />
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56 bg-popover border-border text-popover-foreground" align="end">
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">{user?.displayName || "Musician"}</p>
                                        <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                                        <p className="text-[10px] uppercase font-bold text-blue-500 mt-1">{profile?.role || "Pending"}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem className="hover:bg-accent cursor-pointer" onClick={() => router.push("/settings")}>
                                    <Settings className="mr-2 h-4 w-4" /> Settings
                                </DropdownMenuItem>
                                {isAdmin && (
                                    <DropdownMenuItem className="hover:bg-accent cursor-pointer" onClick={() => router.push("/admin")}>
                                        <ShieldAlert className="mr-2 h-4 w-4 text-violet-500" /> Admin
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem className="text-red-500 hover:bg-red-500/10 cursor-pointer" onClick={() => signOut()}>
                                    <LogOut className="mr-2 h-4 w-4" /> Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                ) : (
                    <Button onClick={async () => { try { await signIn() } catch {} }} variant="outline" className="border-border hover:bg-accent hover:text-foreground">
                        Sign In
                    </Button>
                )}
            </div>
        </header>
    )
}
