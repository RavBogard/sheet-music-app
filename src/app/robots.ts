import { MetadataRoute } from 'next'
import { requestOrg } from '@/lib/org/request-org'
import { orgString } from '@/lib/org/strings'

// C5D-007: the prior `disallow: '/'` blanket-blocked every URL, including
// the 5 legal/marketing pages we explicitly list in sitemap.ts and which
// carriers (A2P SMS), Privacy auditors, and end users may legitimately
// need to discover via search. Cycle-5 ratified intent: whitelist the
// public surface, disallow everything else. Per-page `noindex` meta is
// scoped to authed routes by removing it from the global metadata in
// layout.tsx and re-adding it on the auth-gated route groups.
//
// Multi-tenant phase 1: the origin is the request tenant's `seo.baseUrl`
// (https://{host}). Brothers Lazaroff is frozen to https://centralreform.live,
// which is what both hosts served before.
export default async function robots(): Promise<MetadataRoute.Robots> {
    const BASE_URL = orgString((await requestOrg()).orgId, 'seo.baseUrl')
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
