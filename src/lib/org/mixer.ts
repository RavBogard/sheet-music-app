import "server-only"

import { hasFeature } from "@/lib/org/features"
import { MIXER_ORG_ID } from "@/lib/org/features-client"
import type { OrgId } from "@/lib/org/types"

export { MIXER_ORG_ID } from "@/lib/org/features-client"

/**
 * Multi-tenant phase 6 — the mixer is CRC-only behind its flag.
 *
 * The bare `config/monitor` and `monitor-live/*` documents and the one bridge
 * (the desktop app at CRC's X32) are CRC's. `config/monitor.orgId` names the
 * bridge's tenant; absent means "crc" (every document written before phase 6).
 * Every server path that reads or drives the mixer checks BOTH the caller's
 * tenant has the flag (which effectiveFeatures already limits to crc) AND the
 * bridge config's tenant is the caller's.
 */

/** The tenant a `config/monitor` document belongs to. */
export function bridgeConfigOrg(data: unknown): OrgId {
    const orgId = (data as { orgId?: unknown } | null | undefined)?.orgId
    return typeof orgId === "string" && orgId ? orgId : MIXER_ORG_ID
}

/** The mixer is on for `orgId`: it is crc and crc's `mixer` flag is on. */
export async function mixerOn(orgId: OrgId): Promise<boolean> {
    return orgId === MIXER_ORG_ID && (await hasFeature(orgId, "mixer"))
}
