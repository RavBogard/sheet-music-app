import type { PartPreset } from "@/lib/music/part-presets"

const FETCH_TIMEOUT_MS = 3000

/**
 * PERF-15: this tenant's part presets, for the viewer to cache per org.
 * Best effort and offline-safe: a signed-out device, any failure or a timeout
 * yields null (keep whatever is cached), never an error.
 */
export async function fetchPartPresets(orgId: string, signedIn: boolean): Promise<PartPreset[] | null> {
    if (!signedIn) return null
    try {
        const work = (async () => {
            const { getDb } = await import("@/lib/firebase")
            const { collection, getDocs, query, where } = await import("firebase/firestore")
            const db = await getDb()
            const snap = await getDocs(query(collection(db, "part_presets"), where("orgId", "==", orgId)))
            const out: PartPreset[] = []
            snap.forEach((d) => {
                const data = d.data() as { scope?: { kind?: string; uid?: string; instrument?: string }; patterns?: unknown }
                const patterns = Array.isArray(data.patterns)
                    ? data.patterns.filter((p): p is string => typeof p === "string")
                    : []
                const sc = data.scope
                if (patterns.length === 0 || !sc) return
                if (sc.kind === "user" && typeof sc.uid === "string") {
                    out.push({ scope: { kind: "user", uid: sc.uid }, patterns })
                } else if (sc.kind === "instrument" && typeof sc.instrument === "string") {
                    out.push({ scope: { kind: "instrument", instrument: sc.instrument }, patterns })
                }
            })
            return out
        })()
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS))
        return await Promise.race([work, timeout])
    } catch {
        return null
    }
}
