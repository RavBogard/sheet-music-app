import type { PartPreset } from "@/lib/music/part-presets"

const FETCH_TIMEOUT_MS = 3000

/**
 * PERF-15: the signed-in person's and the device instrument's part presets for
 * this tenant. Best effort and offline-safe: any failure, a signed-out device
 * or a timeout yields no presets, so the viewer shows the full score.
 */
export async function loadPartPresets(opts: {
    orgId: string
    uid: string | null
    instrument: string | null
}): Promise<{ userPreset: PartPreset | null; instrumentPreset: PartPreset | null }> {
    const none = { userPreset: null, instrumentPreset: null }
    if (!opts.uid) return none
    try {
        const work = (async () => {
            const { getDb } = await import("@/lib/firebase")
            const { collection, getDocs, query, where } = await import("firebase/firestore")
            const db = await getDb()
            const snap = await getDocs(query(collection(db, "part_presets"), where("orgId", "==", opts.orgId)))
            const { normalizePartName } = await import("@/lib/music/part-presets")
            const wantInstrument = opts.instrument ? normalizePartName(opts.instrument) : null
            let userPreset: PartPreset | null = null
            let instrumentPreset: PartPreset | null = null
            snap.forEach((d) => {
                const data = d.data() as { scope?: { kind?: string; uid?: string; instrument?: string }; patterns?: unknown }
                const patterns = Array.isArray(data.patterns)
                    ? data.patterns.filter((p): p is string => typeof p === "string")
                    : []
                if (patterns.length === 0 || !data.scope) return
                if (data.scope.kind === "user" && data.scope.uid === opts.uid) {
                    userPreset = { scope: { kind: "user", uid: data.scope.uid }, patterns }
                } else if (
                    data.scope.kind === "instrument" &&
                    wantInstrument &&
                    typeof data.scope.instrument === "string" &&
                    normalizePartName(data.scope.instrument) === wantInstrument
                ) {
                    instrumentPreset = { scope: { kind: "instrument", instrument: data.scope.instrument }, patterns }
                }
            })
            return { userPreset, instrumentPreset }
        })()
        const timeout = new Promise<typeof none>((resolve) => setTimeout(() => resolve(none), FETCH_TIMEOUT_MS))
        return await Promise.race([work, timeout])
    } catch {
        return none
    }
}
