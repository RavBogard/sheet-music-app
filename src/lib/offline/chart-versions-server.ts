/**
 * PERF-18 (server side): the current version of each chart a setlist bonds,
 * read from `library_index/{fileId}` so Perform can tell a device's cached
 * copy is out of date after a heal in place.
 *
 * Tenant scope: only rows whose `orgId` matches the setlist's org are read
 * into the map. A row from another tenant (or a missing row) simply has no
 * version, which means "never re-fetch" on the device: the safe default.
 *
 * Read-only, one batched `getAll`, and it never throws: any failure returns
 * an empty map so the Perform frame renders exactly as before.
 */
import { rowOrg } from "@/lib/mcp/org-context"
import { logger } from "@/lib/logger"
import { chartVersionOf } from "./chart-version"

/** Firestore `getAll` takes a bounded argument list; stay well inside it. */
const CHUNK = 100

export async function fetchChartVersions(
    db: FirebaseFirestore.Firestore,
    fileIds: readonly string[],
    setlistOrgId: unknown,
): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    const ids = [...new Set(fileIds.filter((id) => typeof id === "string" && id.trim() && !id.startsWith("flow-")))]
    if (ids.length === 0) return out
    const org = rowOrg(setlistOrgId)
    try {
        for (let i = 0; i < ids.length; i += CHUNK) {
            const slice = ids.slice(i, i + CHUNK)
            const docs = await db.getAll(...slice.map((id) => db.collection("library_index").doc(id)))
            docs.forEach((doc, j) => {
                if (!doc.exists) return
                const data = doc.data() as Record<string, unknown> | undefined
                if (!data || rowOrg(data.orgId) !== org) return
                const v = chartVersionOf(data)
                if (v) out[slice[j]] = v
            })
        }
    } catch (err) {
        logger.warn("[chart-versions] library_index read failed; no versions this frame:", err)
        return {}
    }
    return out
}
