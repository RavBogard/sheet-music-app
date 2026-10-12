import { revalidateHostList as revalidate } from "@/lib/org/hosts"

/**
 * Multi-tenant phase 3 — tell the Edge address list that `orgs/{id}.domains`
 * changed. Best effort: the list also refreshes on its own 60 s cache.
 */
export async function revalidateHostList(): Promise<void> {
    try {
        await revalidate()
    } catch {
        // best effort
    }
}
