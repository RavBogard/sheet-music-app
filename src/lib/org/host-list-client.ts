import { ORG_HOSTS_PATH, sanitizeHostMap, type HostMap } from "@/lib/org/host-resolution"

/**
 * Multi-tenant phase 3 — the proxy's copy of the address list.
 *
 * Fetched from `/api/org-hosts` on the request's own origin (CDN-cached for
 * 60 s there), memoised in module scope for 60 s per instance. A failed or
 * slow fetch keeps the last good list; no request waits more than
 * FETCH_TIMEOUT_MS for it, and after a failure the next attempt waits
 * RETRY_AFTER_FAILURE_MS so an outage does not cost every request the timeout.
 */
export const HOST_LIST_TTL_MS = 60_000
export const FETCH_TIMEOUT_MS = 1_500
export const RETRY_AFTER_FAILURE_MS = 10_000

interface Memo {
    hosts: HostMap | null
    fetchedAt: number
    failedAt: number
    inflight: Promise<HostMap | null> | null
}

const memo: Memo = { hosts: null, fetchedAt: 0, failedAt: 0, inflight: null }

async function fetchList(origin: string, fetchImpl: typeof fetch): Promise<HostMap | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
        const res = await fetchImpl(`${origin}${ORG_HOSTS_PATH}`, {
            signal: controller.signal,
            headers: { accept: "application/json" },
        })
        if (!res.ok) throw new Error(`org-hosts ${res.status}`)
        const body = (await res.json()) as { hosts?: unknown }
        const hosts = sanitizeHostMap(body?.hosts)
        if (!hosts) throw new Error("org-hosts: malformed body")
        return hosts
    } finally {
        clearTimeout(timer)
    }
}

export async function getHostList(
    origin: string,
    opts: { fetchImpl?: typeof fetch } = {},
): Promise<HostMap | null> {
    const now = Date.now()
    if (memo.hosts && now - memo.fetchedAt < HOST_LIST_TTL_MS) return memo.hosts
    if (memo.failedAt && now - memo.failedAt < RETRY_AFTER_FAILURE_MS) return memo.hosts
    if (!memo.inflight) {
        const fetchImpl = opts.fetchImpl ?? fetch
        memo.inflight = fetchList(origin, fetchImpl)
            .then((hosts) => {
                memo.hosts = hosts
                memo.fetchedAt = Date.now()
                memo.failedAt = 0
                return hosts
            })
            .catch(() => {
                memo.failedAt = Date.now()
                return memo.hosts
            })
            .finally(() => {
                memo.inflight = null
            })
    }
    return memo.inflight
}

/** Test seam. */
export function resetHostListMemo(): void {
    memo.hosts = null
    memo.fetchedAt = 0
    memo.failedAt = 0
    memo.inflight = null
}
