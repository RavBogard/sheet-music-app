import { NextResponse } from "next/server"

/**
 * BET-4: map a mixes-server result to an HTTP response for the /api/monitor
 * routes. Success is 200 with the body as is; a refusal keeps its envelope
 * (`{ok:false, error:{machine_code, message}}`) under the status that fits.
 */
const STATUS: Record<string, number> = {
    monitor_access_denied: 403,
    monitor_bus_forbidden: 403,
    monitor_limits_forbidden: 403,
    monitor_unconfigured: 404,
    mix_not_found: 404,
    monitor_no_bus_assigned: 400,
    invalid_bus_index: 400,
    invalid_argument: 400,
    mix_limit_reached: 409,
    monitor_state_unavailable: 503,
}

export function monitorResponse(result: unknown): NextResponse {
    const r = result as { ok?: unknown; error?: { machine_code?: string } }
    if (r && r.ok === false) {
        const code = r.error?.machine_code ?? ""
        return NextResponse.json(result, { status: STATUS[code] ?? 500 })
    }
    return NextResponse.json(result)
}

/** The mixer is CRC's alone (multi-tenant phase 6): every other tenant gets a 404. */
export const mixerFeatureOff = () => NextResponse.json({ error: "feature_off", feature: "mixer" }, { status: 404 })
