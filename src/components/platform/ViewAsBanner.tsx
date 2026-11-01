"use client"

import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { getOrgBranding } from "@/lib/org/branding"

/** Multi-tenant phase 4: shown while the platform owner views a tenant read-only. */
export function ViewAsBanner() {
    const { readOnlyView } = useAuth()
    const org = useOrg()
    if (!readOnlyView) return null
    return (
        <div role="status" className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-caution px-4 py-1.5 text-sm font-medium text-black">
            <span>Viewing {getOrgBranding(org).shortName} as a member. Read-only.</span>
            <a href="?viewAs=0" className="underline underline-offset-2">Stop viewing</a>
        </div>
    )
}
