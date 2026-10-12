import type { MetadataRoute } from "next"
import { requestOrg } from "@/lib/org/request-org"
import { orgString } from "@/lib/org/strings"

// Public, unauthenticated surfaces. The rest of the app gates behind
// auth and is intentionally absent from the sitemap. `/perform` is the
// public gig-discovery landing for unauth visitors (UNAUTH-001 redirect
// destination) and was previously missing here (C5B-005).
//
// Multi-tenant phase 1: the origin is the request tenant's `seo.baseUrl`
// (https://{host}); Brothers Lazaroff is frozen to https://centralreform.live.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const BASE_URL = orgString((await requestOrg()).orgId, "seo.baseUrl")
    const now = new Date()
    return [
        { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1.0 },
        { url: `${BASE_URL}/perform`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
        { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
        { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
        { url: `${BASE_URL}/sms-consent`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
        { url: `${BASE_URL}/changelog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    ]
}
