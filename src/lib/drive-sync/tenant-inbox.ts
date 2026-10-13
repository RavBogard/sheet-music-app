import "server-only"

import { env } from "@/env.mjs"
import { logger } from "@/lib/logger"
import { getOrgConfig } from "@/lib/org/get-org-config"
import { codeOrgConfig } from "@/lib/org/config-code"
import { hasFeature } from "@/lib/org/features"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { resolveChartInboxFolderId } from "@/lib/drive-sync/inbox"

/**
 * Multi-tenant phase 6: a tenant's Chart Inbox folder.
 *
 *   - `driveInbox` flag off  → { folderId: null, reason: "feature_off" }
 *   - `orgs/{id}.driveInbox.folderId` set → that folder
 *   - crc with none set      → CHART_INBOX_DRIVE_FOLDER_ID (legacy
 *                              DAVID_DRIVE_DROP_FOLDER_ID), CRC's inbox before phase 6
 *   - otherwise              → { folderId: null, reason: "not_configured" }
 *
 * Files imported from a tenant's folder are stamped with that tenant
 * (runDriveSync's `orgId`), so one tenant's inbox never fills another's library.
 */
export type TenantInbox =
    | { folderId: string; reason?: undefined }
    | { folderId: null; reason: "feature_off" | "not_configured" }

export async function tenantInboxFolder(
    orgId: OrgId,
    source: Parameters<typeof resolveChartInboxFolderId>[0] = env,
): Promise<TenantInbox> {
    if (!(await hasFeature(orgId, "driveInbox"))) return { folderId: null, reason: "feature_off" }
    let configured = ""
    try {
        configured = ((await getOrgConfig(orgId)) ?? codeOrgConfig(orgId))?.driveInbox?.folderId?.trim() ?? ""
    } catch (err) {
        logger.warn("[tenant-inbox] config read failed", { orgId, err: String(err) })
        configured = codeOrgConfig(orgId)?.driveInbox?.folderId?.trim() ?? ""
    }
    if (configured) return { folderId: configured }
    if (orgId === DEFAULT_ORG_ID) {
        const fromEnv = resolveChartInboxFolderId(source)
        if (fromEnv) return { folderId: fromEnv }
    }
    return { folderId: null, reason: "not_configured" }
}
