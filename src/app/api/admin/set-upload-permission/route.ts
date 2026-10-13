import { getT } from "@/i18n/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { ORGS } from "@/lib/org/registry"
import { listTenantMembers } from "@/lib/org/access"
import { membershipId } from "@/lib/org/membership-types"
import { ensureMembershipsMigrated } from "@/lib/org/memberships-write"

// v4.4 SEC-001: narrow validated body so attackers can't smuggle extra
// fields (e.g., `role: 'admin'`) onto the update.
const setUploadPermissionSchema = z.union([
    z.object({ migrate: z.literal(true) }),
    z.object({ uid: z.string().min(1), canUpload: z.boolean() }),
])

/**
 * POST /api/admin/set-upload-permission
 *
 * Admin-only endpoint for managing upload permissions. `canUpload` stays a
 * global users-doc flag in multi-tenant phase 2; a tenant admin may set it only
 * for someone with a membership in their (host) tenant; the platform owner for
 * anyone.
 *
 * Single user toggle:
 *   Body: { uid: string, canUpload: boolean }
 *
 * Batch migration (platform owner only, it spans tenants): set canUpload=true
 * for every admin and band leader of any tenant.
 *   Body: { migrate: true }
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        if (!initAdmin()) {
            const t = await getT()
            return NextResponse.json(
                { error: t("api-admin.serverNotReady"), code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        const body = ctx.body!

        if ("migrate" in body) {
            if (!ctx.auth.po) {
                return apiError("Only the platform owner can run the upload-permission migration", 403, "PLATFORM_OWNER_ONLY")
            }
            const uids = new Set<string>()
            for (const org of Object.keys(ORGS)) {
                for (const m of await listTenantMembers(org, { roles: ["admin", "band_leader"] })) uids.add(m.uid)
            }
            const batch = db.batch()
            for (const uid of uids) batch.set(db.collection("users").doc(uid), { canUpload: true }, { merge: true })
            await batch.commit()
            return NextResponse.json({ migrated: uids.size })
        }

        // Single user toggle (zod-validated): the target must belong to this tenant.
        if (!ctx.auth.po) {
            await ensureMembershipsMigrated(body.uid)
            const m = await db.collection("memberships").doc(membershipId(ctx.auth.orgId, body.uid)).get()
            if (!m.exists) return apiError("This person is not a member of this tenant", 404, "NOT_A_MEMBER")
        }
        await db.collection("users").doc(body.uid).update({ canUpload: body.canUpload })
        return NextResponse.json({ success: true, uid: body.uid, canUpload: body.canUpload })
    },
    { role: "admin", schema: setUploadPermissionSchema },
)
