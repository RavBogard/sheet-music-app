import type { OrgId } from "@/lib/org/types"

/**
 * v11-03-02: per-tenant chrome metadata for the BROWSER surface. Pure (no
 * React, no Firestore) so it is usable from server components, the layout, and
 * unit tests. The visual theme itself lives in globals.css keyed off
 * `[data-org="…"]`; this carries the textual brand + the forced-theme flag.
 *
 * CRC intentionally keeps `forceDark: false` and an empty tagline — the CRC
 * login path stays driven by getServerCongregationConfig, so CRC behavior is
 * unchanged. `shortName` for crc is a fallback only.
 */
export type OrgBranding = {
    shortName: string
    tagline: string
    forceDark: boolean
}

const BRANDING: Record<OrgId, OrgBranding> = {
    crc: {
        shortName: "CRC Music",
        tagline: "",
        forceDark: false,
    },
    brotherslazaroff: {
        shortName: "Brothers Lazaroff",
        tagline: "Songs & setlists for the band",
        forceDark: true,
    },
}

export function getOrgBranding(orgId: OrgId): OrgBranding {
    return BRANDING[orgId] ?? BRANDING.crc
}
