import { NextResponse } from "next/server"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * v4.3 Phase 9 — Self-service role-claim sync.
 *
 * The authoritative role lives at users/{uid}.role in Firestore. The auth
 * token's custom claim (`token.role`) is supposed to mirror it, but can
 * drift when a user's role was set only in Firestore (legacy data) or an
 * earlier setCustomUserClaims call silently failed.
 *
 * This route lets any authenticated user ask the server to canonicalize
 * their own claim from their Firestore profile. Idempotent + safe to call
 * on every sign-in.
 *
 * Never accepts a role from the client — the client has no authority over
 * its own role. Never downgrades an existing claim when Firestore says
 * 'pending' (downgrade is an admin action via /api/admin/set-role).
 */

type SyncResponse =
    | { synced: true; role: string }
    | { synced: false; role: string | null; reason?: string }

export const POST = createApiHandler(
    async (ctx): Promise<NextResponse> => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const uid = ctx.auth!.uid
        const db = getFirestore()
        const auth = getAuth()

        const [userSnap, authUser] = await Promise.all([
            db.collection("users").doc(uid).get(),
            auth.getUser(uid),
        ])

        const profileRole: string | undefined = userSnap.data()?.role
        const claimRole: string | undefined = authUser.customClaims?.role as
            | string
            | undefined

        // No Firestore role, or 'pending' — don't touch the claim.
        // Admin-initiated role changes are the only path to set one.
        if (!profileRole || profileRole === "pending") {
            const body: SyncResponse = {
                synced: false,
                role: profileRole ?? null,
                reason: "no_profile_role",
            }
            return NextResponse.json(body)
        }

        // Already in sync — no writes.
        if (profileRole === claimRole) {
            const body: SyncResponse = { synced: false, role: profileRole, reason: "already_synced" }
            return NextResponse.json(body)
        }

        // Drift — write the claim, spreading any existing (soundEngineer etc.)
        // so we don't clobber unrelated claims.
        const { FieldValue } = await import("firebase-admin/firestore")
        try {
            await auth.setCustomUserClaims(uid, {
                ...(authUser.customClaims ?? {}),
                role: profileRole,
            })
            await db
                .collection("users")
                .doc(uid)
                .update({ claimsUpdatedAt: FieldValue.serverTimestamp() })
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[sync-claims] uid=${uid} write failed: ${msg}`)
            return NextResponse.json({ error: "Sync failed" }, { status: 500 })
        }

        logger.info(
            `[sync-claims] uid=${uid} ${claimRole ?? "none"} → ${profileRole}`,
        )

        const body: SyncResponse = { synced: true, role: profileRole }
        return NextResponse.json(body)
    },
    { requireAuth: true },
)
