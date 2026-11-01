"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCongregation } from "@/lib/congregation-store"
import { MobileMenuDrawer } from "@/components/nav/MobileMenuDrawer"
import { OrgLogo } from "@/components/nav/OrgLogo"
import { useT } from "@/i18n/client"
import { useAuth } from "@/lib/auth-context"

export function MobileHeader({
    serverOrgShortName,
    serverLogoUrl,
    serverWordmarkUrl,
    serverIsAuthed,
}: {
    // v11.1-01: server-resolved host-org branding (from (main)/layout.tsx) so the
    // mobile nav is host-correct on first paint; congregation store is the fallback.
    serverOrgShortName?: string
    serverLogoUrl?: string
    // v11.1-05: when set, render this wordmark lockup instead of monogram+text.
    serverWordmarkUrl?: string
    serverIsAuthed?: boolean
} = {}) {
    const t = useT()
    const congregation = useCongregation()
    const [drawerOpen, setDrawerOpen] = useState(false)
    // Signed-out visitors (the public Perform pages) get a Sign in button on
    // the bar's end, as on desktop; during auth loading a remembered user is
    // treated as signed in so the button never flashes for them.
    const { user, loading, cachedUser, signIn } = useAuth()
    const showSignIn = !user && !serverIsAuthed && !(loading && cachedUser) && !loading

    return (
        <>
            <header className="fixed top-0 inset-x-0 h-14 z-50 flex lg:hidden items-center justify-between px-3 bg-shell text-shell-foreground">
                {/* Start: Hamburger */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("nav.openMenu")}
                    onClick={() => setDrawerOpen(true)}
                    className={cn(
                        "size-11 rounded-full transition-colors text-shell-foreground hover:text-shell-foreground",
                        drawerOpen ? "bg-white/15" : "hover:bg-white/10"
                    )}
                >
                    <Menu className={cn("w-6 h-6", drawerOpen && "stroke-[2.5px]")} />
                </Button>

                {/* Center: Logo + Name (v11.1-05: real wordmark image replaces it when set) */}
                <Link href="/" className="flex items-center gap-2 group min-h-11 rounded-md focus-visible:outline-2 focus-visible:outline-shell-foreground">
                    {serverWordmarkUrl ? (

                        <img
                            src={serverWordmarkUrl}
                            alt={serverOrgShortName ?? congregation.shortName}
                            className="h-6 w-auto"
                        />
                    ) : (
                        <>
                            <OrgLogo
                                logoUrl={serverLogoUrl ?? congregation.logoUrl}
                                shortName={serverOrgShortName ?? congregation.shortName}
                                sizeClass="w-7 h-7"
                            />
                            <span className="font-extrabold text-base tracking-[-0.01em] text-shell-foreground">
                                {serverOrgShortName ?? congregation.shortName}
                            </span>
                        </>
                    )}
                </Link>

                {/* End: Sign in when signed out, else a spacer for symmetry */}
                {showSignIn ? (
                    <Button
                        onClick={async () => { try { await signIn() } catch { } }}
                        variant="outline"
                        data-testid="mobile-header-sign-in"
                        className="h-10 px-3 border-white/40 bg-transparent text-shell-foreground hover:bg-white/10 hover:text-shell-foreground"
                    >
                        {t("nav.signIn")}
                    </Button>
                ) : (
                    <div className="w-11" />
                )}
            </header>

            <MobileMenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        </>
    )
}
