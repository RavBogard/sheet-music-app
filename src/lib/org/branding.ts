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
    /**
     * v11-04-02: consumer-surface metadata, data-driven so a new tenant is one
     * entry here (no org `if` checks scattered through layout/components). The
     * CRC values below are BYTE-IDENTICAL to the strings previously hardcoded in
     * `src/app/layout.tsx` so CRC head output is unchanged.
     */
    /** Full PWA / web-manifest `name`. */
    appName: string
    /** Root layout `<title>` default (used when a page sets no title). */
    metaTitleDefault: string
    /** Root layout `<title>` template (`%s` = page title). */
    metaTitleTemplate: string
    /** Description for the root layout + openGraph + twitter cards. */
    metaDescription: string
    /** openGraph.title — CRC's differs from `shortName`, so it's its own field. */
    ogTitle: string
    /** Web-manifest theme/background color (hex; manifests don't take oklch). */
    themeColor: string
    /**
     * v11.1-01: authed-nav logo source. A non-empty path renders an <img>;
     * an empty string signals the nav to render a brand-colored initials
     * monogram instead (no shipped asset). CRC keeps "/logo.jpg" — byte-identical
     * to the prior hardcode in DesktopHeader/MobileHeader.
     */
    logoUrl: string
    /** Per-tenant web manifest path served from `public/`. */
    manifestPath: string
    /** metadataBase origin for absolute og/canonical URLs. */
    baseUrl: string
}

const BRANDING: Record<OrgId, OrgBranding> = {
    crc: {
        shortName: "CRC Music",
        tagline: "",
        forceDark: false,
        appName: "Central Reform Congregation Music",
        metaTitleDefault: "CRC Music | Digital Sheet Library",
        metaTitleTemplate: "%s | CRC Music",
        metaDescription: "Digital Sheet Music Library for Central Reform Congregation",
        ogTitle: "Central Reform Congregation — Music",
        themeColor: "#0e0d18",
        logoUrl: "/logo.jpg",
        manifestPath: "/manifest.json",
        // Preserve the prior CRC env override exactly (NEXT_PUBLIC_BASE_URL is
        // inlined at build; unset → centralreform.live). Other tenants pin their
        // canonical host directly — a single global env can't be per-tenant.
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "https://centralreform.live",
    },
    brotherslazaroff: {
        shortName: "Brothers Lazaroff",
        tagline: "Songs & setlists for the band",
        forceDark: true,
        appName: "Brothers Lazaroff",
        metaTitleDefault: "Brothers Lazaroff",
        metaTitleTemplate: "%s | Brothers Lazaroff",
        metaDescription: "Songs & setlists for the band",
        ogTitle: "Brothers Lazaroff",
        // Deep cool-navy ≈ the dark canvas oklch(0.12 0.02 255); distinct from
        // CRC's indigo #0e0d18.
        themeColor: "#0a0e1a",
        // Empty → nav renders a navy "BL" monogram (Daniel 2026-06-09); no
        // shipped asset. Set a path here the day a real BL logo exists.
        logoUrl: "",
        manifestPath: "/manifest-brotherslazaroff.json",
        baseUrl: "https://brotherslazaroff.live",
    },
}

export function getOrgBranding(orgId: OrgId): OrgBranding {
    return BRANDING[orgId] ?? BRANDING.crc
}
