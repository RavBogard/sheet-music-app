"use client"

import { MobileTabBar } from "./MobileTabBar"
import { MobileHeader } from "./MobileHeader"
import { DesktopHeader } from "./DesktopHeader"
import { GlobalAlertBanner } from "@/components/layout/GlobalAlertBanner"

export interface AppNavigationProps {
    serverIsAdmin?: boolean
    serverIsSoundEngineer?: boolean
    serverIsMember?: boolean
    serverIsBandLeader?: boolean
}

export function AppNavigation(props: AppNavigationProps) {
    // Navigation is automatically hidden for /perform routes because they are outside the (main) layout group.
    // The Setlist Editor (/setlists/[id]) is inside (main) and should show navigation.

    return (
        <div className="z-40 w-full relative print:hidden">
            <GlobalAlertBanner />
            <DesktopHeader {...props} />
            <MobileHeader />
            <MobileTabBar {...props} />
        </div>
    )
}
