/**
 * Where the Upstash REST credentials come from.
 *
 * Two names for one thing. `.env.example` documents
 * `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, which is what
 * `@upstash/redis` calls them and what a hand-set variable would be called.
 * The Vercel marketplace integration ("Upstash for Redis", provisioned
 * 2026-09-15 as `upstash-kv-cyclamen-fence`) provisions the identical REST url
 * and token under Vercel's own KV naming: `KV_REST_API_URL` /
 * `KV_REST_API_TOKEN`. Same store, same protocol, different label.
 *
 * Reading both is better than copying one pair into the other. A copy is a
 * second place to rotate, and a rotation that misses it fails closed on the
 * public chart path — which is exactly the outage this store was provisioned
 * to prevent. The platform-managed variables stay the single source of truth.
 *
 * RESOLVED AS A PAIR, deliberately. A url from one source with a token from
 * the other is not a configuration, it is two half-configurations, and it
 * would authenticate against nothing while looking present. Each candidate
 * must supply both halves or it does not count.
 */

const SOURCES = [
    { url: "UPSTASH_REDIS_REST_URL", token: "UPSTASH_REDIS_REST_TOKEN" },
    { url: "KV_REST_API_URL", token: "KV_REST_API_TOKEN" },
] as const

export type UpstashRestCredentials = {
    url: string
    token: string
    /** Which variable the url came from — for diagnostics, never logged with the token. */
    source: string
}

export function upstashRestCredentials(
    env: Readonly<Record<string, string | undefined>> = process.env,
): UpstashRestCredentials | null {
    for (const s of SOURCES) {
        const url = env[s.url]?.trim()
        const token = env[s.token]?.trim()
        if (url && token) return { url, token, source: s.url }
    }
    return null
}
