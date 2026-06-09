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
    // UNAUTH-004: server-derived auth boolean so first paint on unauth
    // public routes (e.g. /changelog under (main)) routes Setlists →
    // /perform without an authed-link FOUC.
    serverIsAuthed?: boolean
    // v11.1-01: server-resolved host-org branding so the authed nav wordmark +
    // logo are correct on first paint (no CRC-default flash before the
    // congregation store syncs). Resolved from x-org-id in (main)/layout.tsx.
    serverOrgShortName?: string
    serverLogoUrl?: string
    // v11.1-05: optional horizontal brand wordmark. When set, the nav renders
    // this lockup image instead of the OrgLogo monogram + short-name text.
    serverWordmarkUrl?: string
}

export function AppNavigation(props: AppNavigationProps) {
    // Navigation is automatically hidden for /perform routes because they are outside the (main) layout group.
    // The Setlist Editor (/setlists/[id]) is inside (main) and should show navigation.

    return (
        <div className="z-40 w-full relative print:hidden">
            <GlobalAlertBanner />
            <DesktopHeader {...props} />
            <MobileHeader serverOrgShortName={props.serverOrgShortName} serverLogoUrl={props.serverLogoUrl} serverWordmarkUrl={props.serverWordmarkUrl} />
            <MobileTabBar {...props} />
        </div>
    )
}
