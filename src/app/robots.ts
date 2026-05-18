import { MetadataRoute } from 'next'

const BASE_URL = "https://centralreform.live"

// C5D-007: the prior `disallow: '/'` blanket-blocked every URL, including
// the 5 legal/marketing pages we explicitly list in sitemap.ts and which
// carriers (A2P SMS), Privacy auditors, and end users may legitimately
// need to discover via search. Cycle-5 ratified intent: whitelist the
// public surface, disallow everything else. Per-page `noindex` meta is
// scoped to authed routes by removing it from the global metadata in
// layout.tsx and re-adding it on the auth-gated route groups.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: [
                '/',
                '/perform',
                '/privacy',
                '/terms',
                '/sms-consent',
                '/changelog',
            ],
            disallow: '/',
        },
        sitemap: `${BASE_URL}/sitemap.xml`,
    }
}
