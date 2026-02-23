"use client"

import { MobileTabBar } from "./MobileTabBar"
import { DesktopHeader } from "./DesktopHeader"
import { GlobalAlertBanner } from "@/components/layout/GlobalAlertBanner"

import { usePathname } from "next/navigation"

export function AppNavigation() {
    const pathname = usePathname()

    // Navigation is automatically hidden for /perform routes because they are outside the (main) layout group.
    // The Setlist Editor (/setlists/[id]) is inside (main) and should show navigation.

    return (
        <div className="z-40 w-full relative">
            <GlobalAlertBanner />
            <DesktopHeader />
            <MobileTabBar />
        </div>
    )
}
