import "server-only"

import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { CODE_ORG_IDS } from "@/lib/org/config-code"
import { getOrgConfig, orgConfigSource } from "@/lib/org/get-org-config"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 1 — the tenants a per-tenant cron loops over.
 *
 * Always the code tenants (crc, then brotherslazaroff), in that order. With
 * `ORG_CONFIG_SOURCE=firestore`, also every other `orgs/{id}` document that is
 * not suspended. A failed `orgs` read logs and falls back to the code tenants,
 * so CRC and BL never lose a run to it.
 *
 * Each returned tenant's config is resolved through getOrgConfig, which primes
 * the synchronous cache the locale helpers (orgTimeZone, reminderDue) read.
 */
export async function cronTenantIds(): Promise<OrgId[]> {
    const ids: OrgId[] = [...CODE_ORG_IDS]
    if (orgConfigSource() === "firestore") {
        try {
            const snap = await getFirestore().collection("orgs").get()
            for (const doc of snap.docs) {
                if (ids.includes(doc.id)) continue
                if ((doc.data() as { status?: unknown }).status === "suspended") continue
                ids.push(doc.id)
            }
        } catch (err) {
            logger.error("[cron-tenants] orgs read failed; running the code tenants only", err)
        }
    }
    for (const id of ids) {
        try {
            await getOrgConfig(id)
        } catch (err) {
            logger.error(`[cron-tenants] config for ${id} failed to resolve`, err)
        }
    }
    return ids
}
