import type { MetadataRoute } from "next"

const BASE_URL = "https://centralreform.live"

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date()
    return [
        { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1.0 },
        { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
        { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
        { url: `${BASE_URL}/sms-consent`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
        { url: `${BASE_URL}/changelog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    ]
}
