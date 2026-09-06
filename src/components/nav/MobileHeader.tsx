"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCongregation } from "@/lib/congregation-store"
import { MobileMenuDrawer } from "@/components/nav/MobileMenuDrawer"
import { OrgLogo } from "@/components/nav/OrgLogo"

export function MobileHeader({
    serverOrgShortName,
    serverLogoUrl,
    serverWordmarkUrl,
}: {
    // v11.1-01: server-resolved host-org branding (from (main)/layout.tsx) so the
    // mobile nav is host-correct on first paint; congregation store is the fallback.
    serverOrgShortName?: string
    serverLogoUrl?: string
    // v11.1-05: when set, render this wordmark lockup instead of monogram+text.
    serverWordmarkUrl?: string
} = {}) {
    const congregation = useCongregation()
    const [drawerOpen, setDrawerOpen] = useState(false)

    return (
        <>
            <header className="fixed top-0 left-0 right-0 h-14 z-50 flex md:hidden items-center justify-between px-3 material-thick border-b border-brand/10">
                {/* Left: Hamburger */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open menu"
                    onClick={() => setDrawerOpen(true)}
                    className={cn(
                        "rounded-full transition-colors",
                        drawerOpen ? "text-brand bg-brand/15" : "text-muted-foreground hover:text-brand hover:bg-brand/5"
                    )}
                >
                    <Menu className={cn("w-6 h-6", drawerOpen && "stroke-[2.5px]")} />
                </Button>

                {/* Center: Logo + Name (v11.1-05: real wordmark image replaces it when set) */}
                <Link href="/" className="flex items-center gap-2 group">
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
                            <span className="font-display font-bold text-sm text-foreground">
                                {serverOrgShortName ?? congregation.shortName}
                            </span>
                        </>
                    )}
                </Link>

                {/* Right: spacer for symmetry */}
                <div className="w-10" />
            </header>

            <MobileMenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        </>
    )
}
