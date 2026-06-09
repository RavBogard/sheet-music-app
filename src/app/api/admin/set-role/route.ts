import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { isKnownOrg } from "@/lib/org/registry"
import { z } from "zod"

const setRoleSchema = z.object({
    targetUserId: z.string().min(1),
    newRole: z.enum(['admin', 'band_leader', 'musician', 'member', 'pending']),
    // v11-01: optional org-membership envelope. When present, written into the
    // user's custom claims alongside `role`. When absent, existing orgIds claim
    // (if any) is preserved via the existingClaims spread below.
    orgIds: z.array(z.string().min(1)).optional()
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { targetUserId, newRole, orgIds } = ctx.body!

        // v11-01: reject unknown org ids before any write (Firestore role + claims).
        if (orgIds && orgIds.some((o) => !isKnownOrg(o))) {
            return NextResponse.json(
                { error: `Unknown orgId in ${JSON.stringify(orgIds)}` },
                { status: 400 }
            )
        }

        const fbAuth = getAuth()
        const { FieldValue } = await import('firebase-admin/firestore')
        const db = getFirestore()

        // Read existing claims before transaction (Auth is external)
        const existingUser = await fbAuth.getUser(targetUserId)
        const existingClaims = existingUser.customClaims || {}

        // Firestore transaction: user doc update + audit log + demotion guard
        await db.runTransaction(async (txn) => {
            const userRef = db.collection("users").doc(targetUserId)

            // Update user role. v11.1-02-02: also mirror orgIds onto the doc when
            // supplied (the claim write below already includes it) so the People
            // list + roster filtering (v11-05-02 rowOrgIds) see membership changes
            // immediately and doc/claim stay in lockstep. Omitted → doc orgIds
            // preserved (mirrors the claim's spread-preserve semantics).
            txn.update(userRef, {
                role: newRole,
                ...(orgIds ? { orgIds } : {}),
                claimsUpdatedAt: FieldValue.serverTimestamp(),
            })

            // Audit log
            txn.create(db.collection("auditLogs").doc(), {
                action: "ROLE_CHANGE",
                targetUserId,
                newRole,
                previousRole: existingClaims.role || "pending",
                actorUid: ctx.auth.uid,
                actorEmail: ctx.auth.email || "unknown",
                timestamp: FieldValue.serverTimestamp()
            })

        })

        // Update Auth custom claims (external service, after Firestore transaction succeeds)
        let claimsUpdated = true
        try {
            // Spread existingClaims first so we never drop other claims (e.g. a
            // prior orgIds when the caller omits it). orgIds is written only when supplied.
            const nextClaims: Record<string, unknown> = { ...existingClaims, role: newRole }
            if (orgIds) nextClaims.orgIds = orgIds
            await fbAuth.setCustomUserClaims(targetUserId, nextClaims)
        } catch (e) {
            logger.error("[Set Role] Auth claims update failed after Firestore commit:", e)
            claimsUpdated = false
        }

        // claimsUpdated=false means role is set in Firestore but the ID token still carries
        // the old claim until the user's next sign-in. Caller should surface a warning.
        return NextResponse.json({ success: true, role: newRole, claimsUpdated })
    },
    { role: 'admin', schema: setRoleSchema }
)
