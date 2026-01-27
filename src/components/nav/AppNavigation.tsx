"use client"

import { MobileTabBar } from "./MobileTabBar"
import { DesktopHeader } from "./DesktopHeader"
import { usePathname } from "next/navigation"

export function AppNavigation() {
    const pathname = usePathname()

    // Don't show navigation on specific routes (like login or active performance view)
    // We might want to keep it on /perform/resume but hide it on actual chart view?
    // User requested "Exit" button in Gig Mode, implying Gig Mode is fullscreen.
    // So if route contains /perform/[id], we might hide this.
    // The previous implementation had /perform/[id] in a separate layout group, so it might not even render this.
    // But let's be safe.

    // Actually, `(main)` layout is only for dashboard/library/setlists. 
    // `/perform` is likely a sibling route group or separate root page.
    // Checking where this component will be mounted... `src/app/(main)/layout.tsx`.
    // So it will AUTOMATICALLY not show up on pages outside (main).
    // Safe to just render.

    return (
        <>
            <DesktopHeader />
            <MobileTabBar />
        </>
    )
}
