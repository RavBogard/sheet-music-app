import { NextResponse, type NextRequest } from "next/server"
import { coerceOrgId } from "@/lib/org/registry"
import { getOrgConfig } from "@/lib/org/get-org-config"
import { getOrgBranding } from "@/lib/org/branding"
import { getOrgIdentity } from "@/lib/org/identity"

/**
 * Multi-tenant: the PWA manifest for tenants created through config. crc and
 * Brothers Lazaroff keep their static files (`/manifest.json`,
 * `/manifest-brotherslazaroff.json`); a new tenant's `branding.manifestPath`
 * is `/site.webmanifest`, which names that tenant instead of CRC.
 */
export async function GET(req: NextRequest) {
    const orgId = coerceOrgId(req.headers.get("x-org-id"))
    await getOrgConfig(orgId).catch(() => null)
    const b = getOrgBranding(orgId)
    const id = getOrgIdentity(orgId)
    const manifest = {
        name: b.appName,
        short_name: b.shortName,
        description: b.metaDescription,
        start_url: "/",
        display: "standalone",
        // The splash paints the page ground, so it does not flash dark before a light app.
        background_color: id.ground,
        theme_color: b.themeColor || id.shell,
        orientation: "any",
        categories: ["music", "productivity"],
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
    }
    return NextResponse.json(manifest, {
        headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300, s-maxage=300", Vary: "Host" },
    })
}
