"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Search, UserCircle, LogOut, Settings, CloudOff, ShieldAlert, Building2 } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-store"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore } from "@/lib/store"
import { useLibrary } from "@/hooks/use-library"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useFeature } from "@/lib/org/use-feature"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { DriveFile } from "@/types/models"
import { NotificationBell } from "@/components/nav/NotificationBell"
import { useT } from "@/i18n/client"
import { OrgLogo } from "@/components/nav/OrgLogo"

import { AppNavigationProps } from "./AppNavigation"

/** The desktop user menu shows the raw role code (CSS-uppercased); keys keep that English. */
const ROLE_CODE = {
    admin: "nav.roleCode.admin",
    band_leader: "nav.roleCode.bandLeader",
    musician: "nav.roleCode.musician",
    member: "nav.roleCode.member",
    pending: "nav.roleCode.pending",
    denied: "nav.roleCode.denied",
} as const

export function DesktopHeader(props: AppNavigationProps) {
    const t = useT()
    const pathname = usePathname()
    const router = useRouter()
    const { user, profile, role, isMember: authIsMember, isBandLeader: authIsBandLeader, isPlatformOwner: authIsPlatformOwner, signIn, signOut } = useAuth()
    
    // Use server overrides to prevent UI flashing
    const isMember = authIsMember || !!props.serverIsMember
    const isBandLeader = authIsBandLeader || !!props.serverIsBandLeader
    // Multi-tenant phase 4: the platform console link, for the platform owner only.
    const isPlatformOwner = !!authIsPlatformOwner || !!props.serverIsPlatformOwner

    const { allFiles } = useLibraryStore()
    // Start background sync if logged in
    useLibrary()
    const { setQueue } = useMusicStore()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess({
        serverIsAdmin: props.serverIsAdmin,
        serverIsSoundEngineer: props.serverIsSoundEngineer
    })
    const congregation = useCongregation()
    // Multi-tenant phase 6: the mixer (crc only) and Perform are tenant flags.
    const mixerOn = useFeature("mixer")
    const performOn = useFeature("perform")

    // Search
    const [searchQuery, setSearchQuery] = useState("")
    const [showResults, setShowResults] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    // Tenant role from useAuth (multi-tenant phase 2); server roles as fallback
    const isMusician = role === 'musician' || role === 'band_leader' || role === 'admin' || isBandLeader || !!props.serverIsAdmin

    // UNAUTH-004: on unauth state the Setlists link points at /perform
    // (public gig-discovery surface) instead of /setlists (authed-only,
    // bounces unauth visitors to /login). Server flag prevents FOUC on
    // public routes inside the (main) group (e.g. /changelog).
    const isAuthed = !!user || !!props.serverIsAuthed
    // With Perform off there is no public listing; /setlists sends a visitor to sign in.
    const setlistsHref = isAuthed || !performOn ? "/setlists" : "/perform"

    const navLinks = [
        { label: t("nav.setlists"), href: setlistsHref, show: true },
        { label: t("nav.schedule"), href: "/schedule", show: isMusician },
        { label: t("nav.library"), href: "/library", show: isMember },
        { label: t("nav.monitor"), href: "/monitor", show: mixerOn && hasMonitorAccess },
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

    const handleSelectSong = (file: DriveFile) => {
        const type = file.name.endsWith(".xml") || file.name.endsWith(".musicxml") ? "musicxml" : "pdf"
        setQueue([{ name: file.name.replace(/\.[^/.]+$/, ""), fileId: file.id, type }], 0, "/library")
        router.push(`/perform/${file.id}`)
        setSearchQuery("")
        setShowResults(false)
    }

    // Known role codes are translated; an unknown code shows as stored (as today).
    const roleText = role
        ? (Object.prototype.hasOwnProperty.call(ROLE_CODE, role) ? t(ROLE_CODE[role as keyof typeof ROLE_CODE]) : role)
        : t("nav.pendingRole")

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
        <header className="fixed top-0 inset-x-0 h-16 z-50 hidden md:flex items-center justify-between px-4 lg:px-6 material-thick border-b border-brand/10 overflow-x-clip">
            {/* Logo + Nav */}
            <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-3 group min-h-11">
                    {/* v11.1-01: server-resolved host-org branding first (flash-free); congregation store is the live-update fallback.
                        v11.1-05: a real wordmark image (broslaz) replaces the monogram+text lockup. */}
                    {props.serverWordmarkUrl ? (

                        <img
                            src={props.serverWordmarkUrl}
                            alt={props.serverOrgShortName ?? congregation.shortName}
                            className="h-7 w-auto transition-opacity group-hover:opacity-80"
                        />
                    ) : (
                        <>
                            <OrgLogo logoUrl={props.serverLogoUrl ?? congregation.logoUrl} shortName={props.serverOrgShortName ?? congregation.shortName} sizeClass="w-8 h-8" />
                            <span className="font-display font-bold text-lg text-foreground group-hover:text-brand transition-colors">{props.serverOrgShortName ?? congregation.shortName}</span>
                        </>
                    )}
                </Link>

                <nav className="flex items-center gap-1">
                    {navLinks.filter(l => l.show).map(link => {
                        const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))
                        return (
                            <Link key={link.href} href={link.href}
                                className={cn(
                                    // C10I1-004: inline-flex + min-h-11 raises the
                                    // nav anchors from 32px to the ≥44px HIG floor
                                    // for thumb-friendly iPad taps (was px-4 py-1.5).
                                    "inline-flex items-center min-h-11 px-4 rounded-full text-sm font-medium transition-all fluid-interaction",
                                    isActive ? "bg-brand/15 text-foreground shadow-[var(--nav-active-glow)] border border-brand/20" : "text-muted-foreground hover:text-brand hover:bg-brand/5"
                                )}>
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            {/* Right Actions */}
            {/*
              * C4-015: gate on `isAuthed` (= !!user || !!props.serverIsAuthed)
              * instead of the client-only `user`. On first paint for a
              * session-cookie-authed visitor, `useAuth()` reports
              * `user === null, loading: true` until Firebase JS SDK
              * initializes — so the prior `{user ? ...}` flashed the
              * "Sign In" button to authed users before settling. With the
              * server-derived flag from `(main)/layout.tsx`'s
              * `serverIsAuthed={!!user}` (UNAUTH-004 plumbing), we render
              * the UserMenu shell immediately and let the Web SDK
              * populate avatar/email/role once it resolves. The Avatar
              * size (h-8 w-8) + `<UserCircle>` fallback keep CLS=0
              * across SSR→hydration.
              */}
            <div className="flex items-center gap-3 lg:gap-4 shrink-0">
                {isAuthed ? (
                    <>
                        {!isOnline && (
                            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-medium border border-red-500/20">
                                <CloudOff className="h-3 w-3" /> {t("nav.offline")}
                            </div>
                        )}

                        {/* Search */}
                        <div className="relative group" ref={searchRef}>
                            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-brand transition-colors" />
                            <Input
                                placeholder={t("nav.searchSongsPlaceholder")}
                                aria-label={t("nav.searchSongs")}
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true) }}
                                onFocus={() => setShowResults(true)}
                                className="w-48 lg:w-64 bg-brand/5 border-border/50 rounded-full ps-9 h-11 text-sm focus:ring-brand/10 focus:bg-background focus:border-brand/30 transition-all fluid-interaction shadow-inner"
                            />
                            {showResults && searchResults.length > 0 && (
                                <div className="absolute top-full mt-2 inset-x-0 material-thin rounded-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 border border-brand/10">
                                    <div className="p-2 space-y-1">
                                        {searchResults.map(file => (
                                            <button key={file.id} onClick={() => handleSelectSong(file)}
                                                className="w-full text-start px-3 py-2 rounded-lg hover:bg-brand/10 transition-colors group">
                                                <div className="text-sm font-medium text-foreground group-hover:text-foreground truncate">
                                                    {file.name.replace(/\.[^/.]+$/, "")}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-px h-6 bg-brand/10" />

                        {/* Notifications */}
                        <NotificationBell />

                        {/* Profile */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"
                                    className={cn("text-muted-foreground hover:text-foreground rounded-full overflow-hidden transition-all", !isOnline && "ring-2 ring-red-500")}
                                    aria-label={t("nav.userMenu")}>
                                    <Avatar className="h-8 w-8 border border-border">
                                        <AvatarImage src={user?.photoURL ?? undefined} alt={t("nav.profilePhotoAlt")} />
                                        <AvatarFallback><UserCircle className="w-5 h-5" /></AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56 bg-popover border-border text-popover-foreground" align="end">
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">{user?.displayName || t("nav.musicianFallback")}</p>
                                        <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                                        <p className="text-[10px] uppercase font-bold text-brand mt-1">{roleText}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem asChild className="hover:bg-accent cursor-pointer">
                                    <Link href="/settings">
                                        <Settings className="me-2 h-4 w-4" /> {t("nav.settings")}
                                    </Link>
                                </DropdownMenuItem>
                                {isBandLeader && (
                                    <>
                                        <DropdownMenuSeparator className="bg-border" />
                                        <DropdownMenuItem asChild className="hover:bg-accent cursor-pointer">
                                            <Link href="/manage">
                                                <ShieldAlert className="me-2 h-4 w-4 text-brand" /> {t("nav.manage")}
                                            </Link>
                                        </DropdownMenuItem>
                                    </>
                                )}
                                {isPlatformOwner && (
                                    <DropdownMenuItem asChild className="hover:bg-accent cursor-pointer">
                                        <Link href="/platform">
                                            <Building2 className="me-2 h-4 w-4 text-brand" /> {t("nav.platform")}
                                        </Link>
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem className="text-red-500 hover:bg-red-500/10 cursor-pointer" onClick={() => signOut()}>
                                    <LogOut className="me-2 h-4 w-4" /> {t("nav.logOut")}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                ) : (
                    <Button onClick={async () => { try { await signIn() } catch { } }} variant="outline" className="border-border hover:bg-accent hover:text-foreground">
                        {t("nav.signIn")}
                    </Button>
                )}
            </div>
        </header>
    )
}
