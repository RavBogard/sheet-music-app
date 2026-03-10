"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    Home, Library, ListMusic, ListTodo, Radio, Settings,
    ShieldAlert, FileText, LogOut, User, CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useCongregation } from "@/lib/congregation-store"
import {
    Sheet, SheetContent, SheetTitle,
} from "@/components/ui/sheet"
import buildInfo from "@/build-info.json"

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
    const pathname = usePathname()
    const { user, profile, isMember, isBandLeader, signOut } = useAuth()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const congregation = useCongregation()

    const isMusician = profile?.role === 'musician' || profile?.role === 'band_leader' || profile?.role === 'admin'

    const roleLabels: Record<string, string> = {
        admin: 'ADMIN',
        band_leader: 'BAND LEADER',
        musician: 'MUSICIAN',
        member: 'MEMBER',
        leader: 'BAND LEADER',
        pending: 'PENDING',
    }

    // Primary nav items — things in the tab bar get listed here too for completeness
    const primaryItems: MenuItem[] = [
        { label: "Dashboard", href: "/", icon: Home, show: true },
        { label: "Setlists", href: "/setlists", icon: ListMusic, show: true },
        { label: "Schedule", href: "/schedule", icon: CalendarDays, show: isMusician },
        { label: "Library", href: "/library", icon: Library, show: isMember },
        { label: "Tasks", href: "/tasks", icon: ListTodo, show: !!user },
        { label: "Monitor", href: "/monitor", icon: Radio, show: hasMonitorAccess && congregation.features.monitor },
    ]

    const secondaryItems: MenuItem[] = [
        { label: "Settings", href: "/settings", icon: Settings, show: !!user },
        { label: "Manage", href: "/manage", icon: ShieldAlert, show: isBandLeader },
    ]

    const tertiaryItems: MenuItem[] = [
        { label: "Changelog", href: "/changelog", icon: FileText, show: true },
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
                    "flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors",
                    isActive
                        ? "bg-brand/10 text-foreground border-l-2 border-brand"
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
            <SheetContent side="left" className="w-[280px] p-0 bg-background/95 backdrop-blur-xl border-border" aria-describedby="menu-drawer-desc">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <span id="menu-drawer-desc" className="sr-only">Main navigation menu for the application</span>

                <div className="flex flex-col h-full">
                    {/* User Header */}
                    {user ? (
                        <div className="p-5 pb-4 border-b border-brand/10 bg-brand/5">
                            <div className="flex items-center gap-3">
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-border" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border">
                                        <User className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground truncate">
                                        {profile?.displayName || user.displayName || "Musician"}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                </div>
                            </div>
                            <div className="mt-2">
                                <span className="inline-block text-[10px] font-bold text-foreground uppercase tracking-wider bg-brand/10 px-2 py-0.5 rounded-md">
                                    {roleLabels[profile?.role || ''] || 'MEMBER'}
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
                                className="w-full justify-start gap-3 px-4 py-3 h-auto rounded-xl text-red-500 hover:bg-red-500/10 hover:text-red-500"
                            >
                                <LogOut className="w-5 h-5 shrink-0" />
                                Log Out
                            </Button>
                        )}
                        <p className="text-center text-[10px] text-muted-foreground/40 mt-2">
                            v{buildInfo.version} &middot; {buildInfo.commit?.slice(0, 7)}
                        </p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
