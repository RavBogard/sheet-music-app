"use client"

import { MobileTabBar } from "./MobileTabBar"
import { MobileHeader } from "./MobileHeader"
import { DesktopHeader } from "./DesktopHeader"
import { GlobalAlertBanner } from "@/components/layout/GlobalAlertBanner"

export function AppNavigation() {
    // Navigation is automatically hidden for /perform routes because they are outside the (main) layout group.
    // The Setlist Editor (/setlists/[id]) is inside (main) and should show navigation.

    return (
        <div className="z-40 w-full relative print:hidden">
            <GlobalAlertBanner />
            <DesktopHeader />
            <MobileHeader />
            <MobileTabBar />
        </div>
    )
}
