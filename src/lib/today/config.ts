import type { CongregationServiceTimes, CongregationStream } from "./types"

/**
 * The ONE reader for the two congregation-config values `today.json` depends
 * on: per-serviceType start times and the stream.
 *
 * Three surfaces read them — the emitter, `get_congregation_context` (so Claude
 * can see them) and `update_congregation_services` (so its diff is against the
 * same view it will write). Hand-maintained twins of a normalizer like this are
 * how `liturgyRef` once fell off every clone; one module, three importers.
 *
 * Both readers are defensive by design. The congregation doc is hand-edited
 * config, not a validated write path, so a half-typed row must degrade to "no
 * start time" — which the emitter handles — rather than throw during a publish.
 */

export function readServicesFromConfig(
    config: Record<string, unknown> | null | undefined,
): Record<string, CongregationServiceTimes> | null {
    const raw = config?.services
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const out: Record<string, CongregationServiceTimes> = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== "object") continue
        const row = value as Record<string, unknown>
        if (typeof row.defaultStartLocal !== "string") continue
        out[key] = {
            label: typeof row.label === "string" ? row.label : key,
            defaultStartLocal: row.defaultStartLocal,
        }
    }
    return Object.keys(out).length ? out : null
}

export function readStreamFromConfig(
    config: Record<string, unknown> | null | undefined,
): CongregationStream | null {
    const raw = config?.stream
    if (!raw || typeof raw !== "object") return null
    const row = raw as Record<string, unknown>
    if (typeof row.url !== "string" || !row.url.trim()) return null
    const out: CongregationStream = { url: row.url.trim() }
    if (typeof row.leadMinutes === "number" && row.leadMinutes >= 0) {
        out.leadMinutes = row.leadMinutes
    }
    return out
}
