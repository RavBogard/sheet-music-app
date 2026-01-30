"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Search, Bell, UserCircle, Menu, LogOut, Settings, User, Cloud, CloudOff, Loader2, UserCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore } from "@/lib/store"
import { useChatStore } from "@/lib/chat-store"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function DesktopHeader() {
    const pathname = usePathname()
    const router = useRouter()
    const { user, profile, isMember, isAdmin, signIn, signOut } = useAuth()
    const { allFiles, loading, loadLibrary } = useLibraryStore()
    const { setQueue } = useMusicStore()
    const { toggle: toggleChat, isOpen: isChatOpen } = useChatStore()

    // Search State
    const [searchQuery, setSearchQuery] = useState("")
    const [showResults, setShowResults] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    const navLinks = [
        { label: "Dashboard", href: "/" },
        { label: "Public Setlists", href: "/setlists", public: true },
        // Restricted Links (Require Member Role)
        { label: "Library", href: "/library", restricted: true },
        { label: "Audio", href: "/audio", restricted: true },
    ]

    // Handle Search Filter
    const searchResults = searchQuery.length > 1
        ? allFiles.filter(f =>
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            f.mimeType !== 'application/vnd.google-apps.folder'
        ).slice(0, 8)
        : []

    // Close results when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowResults(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Initial Sync (Only when user is ready)
    useEffect(() => {
        if (user) {
            loadLibrary()
        }
    }, [user])

    const handleSelectSong = (file: any) => {
        const type = file.name.endsWith('.xml') || file.name.endsWith('.musicxml') ? 'musicxml' : 'pdf'
        setQueue([{
            name: file.name.replace(/\.[^/.]+$/, ""),
            fileId: file.id,
            type: type
        }])
        router.push(`/perform/${file.id}`)
        setSearchQuery("")
        setShowResults(false)
    }

    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        setIsOnline(navigator.onLine)
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

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
                    {navLinks
                        .filter(link => {
                            if (link.public) return true
                            if (link.label === "Dashboard") return true
                            // Restricted links: Only show if user is a Member (not just generic 'user')
                            if (link.restricted) return isMember
                            return false
                        })
                        .map(link => {
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
                {user ? (
                    <>
                        {/* Offline Warning Banner (optional, but requested ring) */}
                        {!isOnline && (
                            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-medium border border-red-500/20">
                                <CloudOff className="h-3 w-3" />
                                Offline
                            </div>
                        )}

                        {/* AI Chat Button */}
                        <Button
                            variant={isChatOpen ? "default" : "ghost"}
                            size="sm"
                            onClick={toggleChat}
                            className={cn(
                                "gap-2 rounded-full transition-colors",
                                isChatOpen ? "bg-purple-600 hover:bg-purple-500 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Sparkles className="h-4 w-4" />
                            <span className="hidden lg:inline">AI Assistant</span>
                        </Button>

                        {/* Search Bar */}
                        <div className="relative group" ref={searchRef}>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
                            <Input
                                placeholder="Search songs..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value)
                                    setShowResults(true)
                                }}
                                onFocus={() => setShowResults(true)}
                                className="w-64 bg-zinc-900/50 border-zinc-800 rounded-full pl-9 h-9 text-sm focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
                            />

                            {/* Search Results Dropdown */}
                            {showResults && searchResults.length > 0 && (
                                <div className="absolute top-full mt-2 left-0 right-0 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
                                    <div className="p-2 space-y-1">
                                        {searchResults.map(file => (
                                            <button
                                                key={file.id}
                                                onClick={() => handleSelectSong(file)}
                                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                                            >
                                                <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                                                    {file.name.replace(/\.[^/.]+$/, "")}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-px h-6 bg-zinc-800" />

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white rounded-full relative">
                                    <Bell className="w-5 h-5" />
                                    {loading && <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 bg-zinc-900 border-zinc-800 text-white p-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold flex items-center gap-2">
                                            <Cloud className="h-4 w-4 text-zinc-400" /> Sync Status
                                        </h4>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => loadLibrary(true)}
                                            disabled={loading}
                                            className="h-8 text-[11px] border-zinc-800"
                                        >
                                            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                            Force Sync
                                        </Button>
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        {loading ? "Syncing with Google Drive..." : "Library is up to date."}
                                    </p>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        "text-zinc-400 hover:text-white rounded-full overflow-hidden transition-all",
                                        !isOnline ? "ring-2 ring-red-500" : ""
                                    )}
                                >
                                    {user?.photoURL ? (
                                        <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-zinc-800" />
                                    ) : (
                                        <UserCircle className="w-6 h-6" />
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56 bg-zinc-900 border-zinc-800 text-white" align="end">
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">{user?.displayName || "Musician"}</p>
                                        <p className="text-xs leading-none text-zinc-500">{user?.email}</p>
                                        <p className="text-[10px] uppercase font-bold text-blue-400 mt-1">{profile?.role || "Pending"}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-zinc-800" />

                                <DropdownMenuItem
                                    className="hover:bg-white/5 cursor-pointer"
                                    onClick={() => router.push('/settings')}
                                >
                                    <Settings className="mr-2 h-4 w-4" />
                                    <span>Settings</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-zinc-800" />
                                <DropdownMenuItem
                                    className="text-red-400 hover:bg-red-400/10 cursor-pointer"
                                    onClick={() => signOut()}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                ) : (
                    /* Guest View */
                    <Button onClick={() => user ? signOut() : document.getElementById('signin-trigger')?.click()} className="hidden">
                        {/* We rely on the page.tsx Sign In button or handle it here? 
                            Let's add a Sign In button here too.
                         */}
                        {/* Actually we don't have signIn in props? useAuth gives signIn. */}
                    </Button>
                )}
                {!user && (
                    <Button onClick={async () => {
                        try {
                            await signIn()
                        } catch (e) {
                            console.error("Sign in failed", e)
                        }
                    }} variant="outline" className="border-zinc-700 hover:bg-zinc-800 hover:text-white">
                        Sign In
                    </Button>
                )}
            </div>
        </header>
    )
}
