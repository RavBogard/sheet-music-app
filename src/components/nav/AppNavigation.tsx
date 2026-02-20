"use client"

import { MobileTabBar } from "./MobileTabBar"
import { DesktopHeader } from "./DesktopHeader"
import { GlobalAlertBanner } from "@/components/layout/GlobalAlertBanner"

import { usePathname } from "next/navigation"

export function AppNavigation() {
    const pathname = usePathname()

    // Hide navigation inside the Setlist Editor views
    if (pathname?.startsWith("/setlists/") && pathname !== "/setlists/new") {
        return null
    }

    return (
        <div className="z-40 w-full relative">
            <GlobalAlertBanner />
            <DesktopHeader />
            <MobileTabBar />
        </div>
    )
}
