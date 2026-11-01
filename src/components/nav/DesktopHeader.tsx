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

    // UNAUTH-004: on unauth state the Setlists link points at /perform
    // (public gig-discovery surface) instead of /setlists (authed-only,
    // bounces unauth visitors to /login). Server flag prevents FOUC on
    // public routes inside the (main) group (e.g. /changelog).
    const isAuthed = !!user || !!props.serverIsAuthed
    // With Perform off there is no public listing; /setlists sends a visitor to sign in.
    const setlistsHref = isAuthed || !performOn ? "/setlists" : "/perform"

    // Web refresh (blend E): Setlists / Library / Manage tabs in the top bar.
    // Manage stays in the user menu too; Monitor keeps its tab where it shows.
    const navLinks = [
        { label: t("nav.setlists"), href: setlistsHref, show: true },
        { label: t("nav.library"), href: "/library", show: isMember },
        { label: t("nav.manage"), href: "/manage", show: isBandLeader },
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
        <header className="fixed top-0 inset-x-0 h-14 z-50 hidden lg:flex items-center justify-between px-6 bg-shell text-shell-foreground overflow-x-clip">
            {/* Brand + tabs */}
            <div className="flex items-center gap-8 h-full">
                <Link href="/" className="flex items-center gap-2.5 group min-h-11 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shell-foreground">
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
                            <span className="font-extrabold text-[17px] tracking-[-0.01em] text-shell-foreground">{props.serverOrgShortName ?? congregation.shortName}</span>
                        </>
                    )}
                </Link>

                <nav className="flex items-stretch gap-1 h-full">
                    {navLinks.filter(l => l.show).map(link => {
                        const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))
                        return (
                            <Link key={link.href} href={link.href}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    // C10I1-004: ≥44px hit area. The active tab is
                                    // marked by a 3px rule on the bar's bottom edge.
                                    "relative inline-flex items-center min-h-11 px-3.5 text-[15px] font-semibold transition-colors",
                                    "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-shell-foreground rounded-sm",
                                    "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-sm after:transition-colors",
                                    isActive ? "text-shell-active after:bg-shell-active" : "text-shell-muted hover:text-shell-foreground after:bg-transparent"
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
                            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-white/10 text-shell-foreground rounded-full text-xs font-semibold border border-white/25">
                                <CloudOff className="h-3 w-3" /> {t("nav.offline")}
                            </div>
                        )}

                        {/* Search */}
                        <div className="relative group" ref={searchRef}>
                            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-shell-muted group-focus-within:text-foreground transition-colors" />
                            <Input
                                placeholder={t("nav.searchSongsPlaceholder")}
                                aria-label={t("nav.searchSongs")}
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true) }}
                                onFocus={() => setShowResults(true)}
                                className="w-48 xl:w-64 bg-white/10 border-white/15 text-shell-foreground placeholder:text-shell-muted rounded-md ps-9 h-10 text-sm focus:bg-background focus:text-foreground focus:placeholder:text-muted-foreground focus:border-transparent transition-colors"
                            />
                            {showResults && searchResults.length > 0 && (
                                <div className="absolute top-full mt-2 inset-x-0 bg-popover text-popover-foreground rounded-lg overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 border border-border shadow-[0_8px_24px_rgb(24_32_46/0.14)]">
                                    <div className="p-2 space-y-1">
                                        {searchResults.map(file => (
                                            <button key={file.id} onClick={() => handleSelectSong(file)}
                                                className="w-full text-start px-3 min-h-11 rounded-md hover:bg-accent transition-colors group">
                                                <div className="text-sm font-medium text-foreground group-hover:text-foreground truncate">
                                                    {file.name.replace(/\.[^/.]+$/, "")}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-px h-6 bg-white/20" />

                        {/* Notifications */}
                        <NotificationBell />

                        {/* Profile */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"
                                    className={cn("size-11 text-shell-foreground hover:bg-white/10 hover:text-shell-foreground rounded-full overflow-hidden transition-colors", !isOnline && "ring-2 ring-[var(--warning-line)]")}
                                    aria-label={t("nav.userMenu")}>
                                    <Avatar className="h-8 w-8 border border-white/30">
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
                                        <p className="text-xs uppercase font-bold tracking-[0.06em] text-brand mt-1">{roleText}</p>
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
                                <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={() => signOut()}>
                                    <LogOut className="me-2 h-4 w-4" /> {t("nav.logOut")}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                ) : (
                    <Button onClick={async () => { try { await signIn() } catch { } }} variant="outline" className="h-10 border-white/40 bg-transparent text-shell-foreground hover:bg-white/10 hover:text-shell-foreground">
                        {t("nav.signIn")}
                    </Button>
                )}
            </div>
        </header>
    )
}
