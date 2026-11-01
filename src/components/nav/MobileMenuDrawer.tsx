"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    Home, Library, ListMusic, Radio, Settings,
    ShieldAlert, FileText, LogOut, User, Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useCongregation } from "@/lib/congregation-store"
import { useFeature } from "@/lib/org/use-feature"
import {
    Sheet, SheetContent, SheetTitle,
} from "@/components/ui/sheet"
import buildInfo from "@/build-info.json"
import { useI18n } from "@/i18n/client"

interface MobileMenuDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface MenuItem {
    label: string
    href: string
    icon: typeof Home
    show: boolean
}

export function MobileMenuDrawer({ open, onOpenChange }: MobileMenuDrawerProps) {
    const { t, isRtl } = useI18n()
    const pathname = usePathname()
    const { user, profile, role, isMember, isBandLeader, isPlatformOwner, signOut } = useAuth()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const congregation = useCongregation()
    // Multi-tenant phase 6: the mixer (crc only) and Perform are tenant flags.
    const mixerOn = useFeature("mixer")
    const performOn = useFeature("perform")

    // Tenant role from useAuth (multi-tenant phase 2)

    // UNAUTH-004: route Setlists → /perform on unauth (matches DesktopHeader
    // behavior). The drawer is hidden until the user taps the hamburger,
    // by which point client-side auth has resolved — no FOUC budget needed.
    const setlistsHref = user || !performOn ? "/setlists" : "/perform"

    // Kept local (not @/lib/roles ROLE_LABELS) because this surface wants
    // ALL-CAPS stencil styling baked in — can be swapped to a `uppercase`
    // CSS util plus the shared label if that styling changes.
    const roleLabels: Record<string, string> = {
        admin: t("nav.roleBadge.admin"),
        band_leader: t("nav.roleBadge.bandLeader"),
        musician: t("nav.roleBadge.musician"),
        member: t("nav.roleBadge.member"),
        leader: t("nav.roleBadge.bandLeader"),
        pending: t("nav.roleBadge.pending"),
    }

    // Primary nav items — things in the tab bar get listed here too for completeness
    const primaryItems: MenuItem[] = [
        { label: t("nav.dashboard"), href: "/", icon: Home, show: true },
        { label: t("nav.setlists"), href: setlistsHref, icon: ListMusic, show: true },
        { label: t("nav.library"), href: "/library", icon: Library, show: isMember },
        { label: t("nav.monitor"), href: "/monitor", icon: Radio, show: mixerOn && hasMonitorAccess },
    ]

    const secondaryItems: MenuItem[] = [
        { label: t("nav.settings"), href: "/settings", icon: Settings, show: !!user },
        { label: t("nav.manage"), href: "/manage", icon: ShieldAlert, show: isBandLeader },
        // Multi-tenant phase 4: platform owner only.
        { label: t("nav.platform"), href: "/platform", icon: Building2, show: !!isPlatformOwner },
    ]

    const tertiaryItems: MenuItem[] = [
        { label: t("nav.changelog"), href: "/changelog", icon: FileText, show: true },
    ]

    const renderItem = (item: MenuItem) => {
        if (!item.show) return null
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
            <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                        ? "bg-brand/10 text-foreground border-s-2 border-brand"
                        : "text-muted-foreground hover:bg-brand/5 hover:text-foreground"
                )}
            >
                <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-brand")} />
                {item.label}
            </Link>
        )
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {/* Phase 7: the drawer slides in from the start side (the right on an rtl page). */}
            <SheetContent side={isRtl ? "right" : "left"} className="w-[280px] p-0 bg-background/95 backdrop-blur-xl border-border" aria-describedby="menu-drawer-desc">
                <SheetTitle className="sr-only">{t("nav.drawerTitle")}</SheetTitle>
                <span id="menu-drawer-desc" className="sr-only">{t("nav.drawerDescription")}</span>

                <div className="flex flex-col h-full">
                    {/* User Header */}
                    {user ? (
                        <div className="p-5 pb-4 border-b border-brand/10 bg-brand/5">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border border-border">
                                    <AvatarImage src={user.photoURL ?? undefined} alt={t("nav.profilePhotoAlt")} />
                                    <AvatarFallback className="bg-muted">
                                        <User className="w-5 h-5 text-muted-foreground" />
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground truncate">
                                        {profile?.displayName || user.displayName || t("nav.musicianFallback")}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                </div>
                            </div>
                            <div className="mt-2">
                                <span className="inline-block text-[10px] font-bold text-foreground uppercase tracking-wider bg-brand/10 px-2 py-0.5 rounded-md">
                                    {roleLabels[role ?? 'pending'] || t("nav.roleBadge.member")}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="p-5 pb-4 border-b border-brand/10 bg-brand/5">
                            <p className="text-sm font-semibold text-foreground">{congregation.shortName}</p>
                        </div>
                    )}

                    {/* Navigation Items */}
                    <div className="flex-1 overflow-y-auto py-2">
                        {/* Primary */}
                        <div className="px-2 space-y-0.5">
                            {primaryItems.map(renderItem)}
                        </div>

                        {/* Divider */}
                        <div className="my-2 mx-4 border-t border-brand/10" />

                        {/* Secondary */}
                        <div className="px-2 space-y-0.5">
                            {secondaryItems.map(renderItem)}
                        </div>

                        {/* Divider */}
                        <div className="my-2 mx-4 border-t border-brand/10" />

                        {/* Tertiary */}
                        <div className="px-2 space-y-0.5">
                            {tertiaryItems.map(renderItem)}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-brand/10 p-3">
                        {user && (
                            <Button
                                variant="ghost"
                                onClick={() => { signOut(); onOpenChange(false) }}
                                className="w-full justify-start gap-3 px-4 py-3 h-auto rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                <LogOut className="w-5 h-5 shrink-0" />
                                {t("nav.logOutDrawer")}
                            </Button>
                        )}
                        <p className="text-center text-[10px] text-muted-foreground/40 mt-2">
                            {t("nav.versionLine", { version: buildInfo.version, commit: buildInfo.commit?.slice(0, 7) })}
                        </p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
