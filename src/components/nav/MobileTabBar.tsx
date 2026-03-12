"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, ListMusic, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"
import { Input } from "@/components/ui/input"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "firebase/firestore"
import { useLibraryStore } from "@/lib/library-store"
import Fuse from "fuse.js"
import type { DriveFile } from "@/types/models"

const SESSION_SETLIST_KEY = "lastOpenedSetlistId"

export function MobileTabBar() {
    const pathname = usePathname()
    const router = useRouter()
    const { user, isMember } = useAuth()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const congregation = useCongregation()
    const [keyboardOpen, setKeyboardOpen] = useState(false)
    const [monitorOpen, setMonitorOpen] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    const showMonitor = hasMonitorAccess && congregation.features.monitor

    // Establish monitor connection early so QuickMonitorPanel has data
    useMonitorConnection()

    // Hide when keyboard is open
    useEffect(() => {
        const vv = window.visualViewport
        if (!vv) return
        const handler = () => {
            setKeyboardOpen(vv.height < window.innerHeight * 0.75)
        }
        vv.addEventListener("resize", handler)
        return () => vv.removeEventListener("resize", handler)
    }, [])

    // Hide during PDF chart view (/perform/{fileId} but not /perform/setlist/*)
    const isPdfView = pathname.startsWith("/perform/") && !pathname.startsWith("/perform/setlist/") && pathname !== "/perform"

    // Track session setlist: if we're on a setlist perform page, remember it
    useEffect(() => {
        const match = pathname.match(/^\/perform\/setlist\/(.+)/)
        if (match?.[1]) {
            try { sessionStorage.setItem(SESSION_SETLIST_KEY, match[1]) } catch { /* SSR/private browsing */ }
        }
    }, [pathname])

    // --- Search ---
    const allFiles = useLibraryStore(s => s.allFiles)

    const fuse = useMemo(() => {
        if (allFiles.length === 0) return null
        return new Fuse(allFiles, {
            keys: [{ name: "displayName", weight: 2 }, { name: "name", weight: 1 }],
            threshold: 0.35,
        })
    }, [allFiles])

    const searchResults = useMemo(() => {
        if (!searchQuery || searchQuery.length < 2 || !fuse) return []
        return fuse.search(searchQuery, { limit: 8 }).map(r => r.item)
    }, [searchQuery, fuse])

    const handleSearchSelect = useCallback((file: DriveFile) => {
        setSearchOpen(false)
        setSearchQuery("")
        router.push(`/perform/${file.id}`)
    }, [router])

    // Focus input when search popover opens
    useEffect(() => {
        if (searchOpen) {
            setTimeout(() => inputRef.current?.focus(), 100)
        } else {
            setSearchQuery("")
        }
    }, [searchOpen])

    // --- Setlist navigation ---
    const handleSetlistTap = useCallback(async () => {
        // Priority 1: session-opened setlist
        try {
            const sessionId = sessionStorage.getItem(SESSION_SETLIST_KEY)
            if (sessionId) {
                router.push(`/perform/setlist/${sessionId}`)
                return
            }
        } catch { /* SSR/private browsing */ }

        // Priority 2: nearest future eventDate
        if (!db) {
            router.push("/setlists")
            return
        }
        try {
            const now = new Date()
            const q = query(
                collection(db, "setlists"),
                where("isPublic", "==", true),
                where("eventDate", ">=", Timestamp.fromDate(now)),
                orderBy("eventDate", "asc"),
                limit(1),
            )
            const snap = await getDocs(q)
            if (!snap.empty) {
                router.push(`/perform/setlist/${snap.docs[0].id}`)
                return
            }
        } catch { /* Firestore query failed — fall through */ }

        // Priority 3: fallback
        router.push("/setlists")
    }, [router])

    if (isPdfView) return null

    return (
        <nav className={cn("fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe", keyboardOpen && "hidden")}>
            <div className="absolute inset-0 material-thick border-t border-brand/10" />

            <div className="relative flex items-center justify-around h-16 sm:h-20 px-2">
                {/* Search button */}
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                    <PopoverTrigger asChild>
                        <button
                            aria-label="Search songs"
                            className={cn(
                                "flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group",
                                searchOpen ? "text-brand" : "text-muted-foreground hover:text-brand/70"
                            )}
                        >
                            <div className={cn(
                                "relative flex items-center justify-center w-14 h-10 rounded-2xl transition-all duration-300",
                                searchOpen
                                    ? "bg-brand/15 shadow-[var(--shadow-brand-glow)] scale-100"
                                    : "bg-transparent scale-90"
                            )} style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
                                <Search className={cn(
                                    "w-6 h-6 transition-all duration-300",
                                    searchOpen ? "text-brand stroke-[2.5px]" : "stroke-2"
                                )} />
                            </div>
                            <span className={cn(
                                "text-[11px] font-medium transition-colors",
                                searchOpen ? "text-brand font-bold" : "text-muted-foreground"
                            )}>
                                Search
                            </span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        side="top"
                        align="start"
                        className="w-[min(360px,calc(100vw-2rem))] p-0 bg-popover border-border mb-2"
                    >
                        <Input
                            ref={inputRef}
                            placeholder="Search songs..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="mb-2"
                        />
                        {searchQuery.length >= 2 && searchResults.length === 0 && (
                            <p className="text-sm text-muted-foreground px-1 py-2">No songs found</p>
                        )}
                        {searchResults.length > 0 && (
                            <ul className="max-h-60 overflow-y-auto space-y-0.5">
                                {searchResults.map(file => (
                                    <li key={file.id}>
                                        <button
                                            className="w-full text-left px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors truncate"
                                            onClick={() => handleSearchSelect(file)}
                                        >
                                            {file.displayName || file.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </PopoverContent>
                </Popover>

                {/* Setlist button (center, primary) */}
                <button
                    aria-label="Open setlist"
                    onClick={handleSetlistTap}
                    className="flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 fluid-interaction group text-muted-foreground hover:text-brand/70"
                >
                    <div
                        className="relative flex items-center justify-center w-16 h-11 rounded-2xl transition-all duration-300 bg-brand/10 shadow-[var(--shadow-brand-glow-soft)] scale-100"
                        style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
                    >
                        <ListMusic className="w-7 h-7 text-brand stroke-[2.25px] transition-all duration-300" />
                    </div>
                    <span className="text-[11px] font-bold text-brand transition-colors">
                        Setlist
                    </span>
                </button>

                {/* Monitor button */}
                {showMonitor ? (
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
                                        ? "bg-brand/15 shadow-[var(--shadow-brand-glow)] scale-100"
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
                ) : (
                    /* Placeholder for balanced layout when no monitor */
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 h-full py-2 opacity-0 pointer-events-none">
                        <div className="w-14 h-10" />
                        <span className="text-[11px]">&nbsp;</span>
                    </div>
                )}
            </div>
        </nav>
    )
}
