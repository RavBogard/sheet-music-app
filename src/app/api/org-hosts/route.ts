import { getHostList } from "@/lib/org/hosts"

/**
 * Multi-tenant phase 3 — the public address list: `{ hosts: { host: orgId },
 * generatedAt }`. Read by the proxy (on the request's own origin) to resolve
 * hosts outside the compiled CRC/BL map. Public by design: it names which
 * addresses this app serves and nothing else. Cached at the CDN for 60 s and
 * served stale for up to 5 minutes while it refreshes.
 */
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
    const list = await getHostList()
    return Response.json(list, {
        headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
    })
}
