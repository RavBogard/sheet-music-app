"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { Search, ListMusic, Radio, Library, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { useFeature } from "@/lib/org/use-feature"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"
import { Input } from "@/components/ui/input"
import { getDb } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "firebase/firestore"
import { useLibraryStore } from "@/lib/library-store"
import Fuse from "fuse.js"
import type { DriveFile } from "@/types/models"
import { useT } from "@/i18n/client"

const SESSION_SETLIST_KEY = "lastOpenedSetlistId"

import { AppNavigationProps } from "./AppNavigation"

export function MobileTabBar(props: AppNavigationProps) {
    const t = useT()
    const pathname = usePathname()
    const router = useRouter()
    const { user, loading: authLoading, cachedUser, isMember: authIsMember, isBandLeader: authIsBandLeader } = useAuth()
    // Server flags first, so the tabs don't flash in after hydration.
    const isMember = !!authIsMember || !!props.serverIsMember
    const isBandLeader = !!authIsBandLeader || !!props.serverIsBandLeader
    const org = useOrg()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess({
        serverIsAdmin: props.serverIsAdmin,
        serverIsSoundEngineer: props.serverIsSoundEngineer
    })
    // Multi-tenant phase 6: the mixer (crc only) and Perform are tenant flags.
    const mixerOn = useFeature("mixer")
    const performOn = useFeature("perform")
    const [keyboardOpen, setKeyboardOpen] = useState(false)
    const [monitorOpen, setMonitorOpen] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    const showMonitor = mixerOn && hasMonitorAccess

    // Establish monitor connection early so QuickMonitorPanel has data
    // (only where the mixer exists).
    useMonitorConnection({ enabled: mixerOn })

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
            const timer = setTimeout(() => inputRef.current?.focus(), 100)
            return () => clearTimeout(timer)
        } else {
            setSearchQuery("")
        }
    }, [searchOpen])

    // UNAUTH-004: on unauth state the Setlists button routes to the
    // public gig-discovery surface instead of /setlists (which would
    // bounce the visitor to /login). Server flag prevents FOUC on
    // public (main) routes; falls back to client `user` after hydration.
    const isAuthed = !!user || !!props.serverIsAuthed

    // --- Setlist navigation ---
    const handleSetlistTap = useCallback(async () => {
        // Without Perform the setlist button opens the setlists page.
        if (!performOn) {
            router.push("/setlists")
            return
        }

        // UNAUTH-004: unauth visitors skip the authed-only Firestore
        // lookup + the /setlists fallback (both bounce to /login). They
        // land on the public /perform discovery surface instead.
        if (!isAuthed) {
            router.push("/perform")
            return
        }

        // Priority 1: session-opened setlist
        try {
            const sessionId = sessionStorage.getItem(SESSION_SETLIST_KEY)
            if (sessionId) {
                router.push(`/perform/setlist/${sessionId}`)
                return
            }
        } catch { /* SSR/private browsing */ }

        // Priority 2: nearest future eventDate
        try {
            const db = await getDb()
            const now = new Date()
            // Multi-tenant phase 2: this tenant's next gig only.
            const q = query(
                collection(db, "setlists"),
                where("orgId", "==", org),
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
    }, [router, isAuthed, org, performOn])

    if (isPdfView) return null
    // Signed-out visitors only get the tabs they can use: Setlist (the public
    // listing). Search reads the library, which needs an account. A
    // remembered user keeps every tab while auth resolves.
    const canSearch = isAuthed || !!(authLoading && cachedUser)

    // Web refresh (blend E): below lg (iPad portrait and phones) the top bar's
    // tabs live here. The Setlist tab keeps its smart target (tonight's setlist
    // in Perform); Search and the wedge mixer stay where they were.
    // Home and the /perform listing belong to the Setlist tab (re-audit 2 V13).
    const setlistActive = pathname === "/" || pathname === "/perform" || pathname.startsWith("/setlists") || pathname.startsWith("/perform/setlist")
    const libraryActive = pathname.startsWith("/library")
    const manageActive = pathname.startsWith("/manage")

    const tabClass = (active: boolean) => cn(
        "relative flex flex-1 flex-col items-center justify-center gap-0.5 h-full min-w-11 transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring rounded-sm",
        "before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-10 before:h-[3px] before:rounded-b-sm",
        active ? "text-brand before:bg-brand" : "text-muted-foreground hover:text-foreground before:bg-transparent",
    )
    const labelClass = (active: boolean) => cn("text-[12px] leading-none", active ? "font-bold" : "font-semibold")

    return (
        <nav className={cn("fixed bottom-0 inset-x-0 z-50 lg:hidden pb-safe bg-card border-t border-rule", keyboardOpen && "hidden")}>
            <div className="flex items-stretch justify-around h-16 px-1 max-w-3xl mx-auto">
                {/* Setlist (tonight's setlist in Perform, else the list) */}
                <button
                    type="button"
                    aria-label={t("nav.openSetlist")}
                    aria-current={setlistActive ? "page" : undefined}
                    onClick={handleSetlistTap}
                    className={tabClass(setlistActive)}
                >
                    <ListMusic aria-hidden className="w-6 h-6" strokeWidth={setlistActive ? 2.4 : 2} />
                    <span className={labelClass(setlistActive)}>{t("nav.setlistTab")}</span>
                </button>

                {isMember && (
                    <Link href="/library" aria-current={libraryActive ? "page" : undefined} className={tabClass(libraryActive)}>
                        <Library aria-hidden className="w-6 h-6" strokeWidth={libraryActive ? 2.4 : 2} />
                        <span className={labelClass(libraryActive)}>{t("nav.library")}</span>
                    </Link>
                )}

                {isBandLeader && (
                    <Link href="/manage" aria-current={manageActive ? "page" : undefined} className={tabClass(manageActive)}>
                        <ShieldAlert aria-hidden className="w-6 h-6" strokeWidth={manageActive ? 2.4 : 2} />
                        <span className={labelClass(manageActive)}>{t("nav.manage")}</span>
                    </Link>
                )}

                {/* Search */}
                {canSearch && (
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                    <PopoverTrigger asChild>
                        <button type="button" aria-label={t("nav.searchSongs")} className={tabClass(searchOpen)}>
                            <Search aria-hidden className="w-6 h-6" strokeWidth={searchOpen ? 2.4 : 2} />
                            <span className={labelClass(searchOpen)}>{t("nav.searchTab")}</span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        side="top"
                        align="center"
                        className="w-[min(360px,calc(100vw-2rem))] p-2 bg-popover border-border mb-2"
                    >
                        <Input
                            ref={inputRef}
                            placeholder={t("nav.searchSongsPlaceholder")}
                            aria-label={t("nav.searchSongs")}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="mb-2 h-11"
                        />
                        {searchQuery.length >= 2 && searchResults.length === 0 && (
                            <p className="text-sm text-muted-foreground px-1 py-2">{t("nav.noSongsFound")}</p>
                        )}
                        {searchResults.length > 0 && (
                            <ul className="max-h-60 overflow-y-auto">
                                {searchResults.map(file => (
                                    <li key={file.id} className="border-b border-rule last:border-b-0">
                                        <button
                                            type="button"
                                            className="w-full text-start px-2 min-h-11 rounded-md text-sm hover:bg-accent transition-colors truncate"
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
                )}

                {/* Wedge mixer */}
                {showMonitor && (
                    <Popover open={monitorOpen} onOpenChange={setMonitorOpen}>
                        <PopoverTrigger asChild>
                            <button type="button" aria-label={t("nav.monitor")} className={tabClass(monitorOpen)}>
                                <Radio aria-hidden className="w-6 h-6" strokeWidth={monitorOpen ? 2.4 : 2} />
                                <span className={labelClass(monitorOpen)}>{t("nav.monitor")}</span>
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
