import { NextResponse } from "next/server"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { getOrgIdsFromClaims, orgIdsEqual } from "@/lib/org/membership"

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

        // v11-05-02: mirror the orgIds CLAIM onto users/{uid}.orgIds so roster
        // queries can filter by `where('orgIds','array-contains',org)`. Claims are
        // the source of truth; getOrgIdsFromClaims defaults a claimless user to
        // ['crc'] (the CRC-safety invariant). This runs alongside the role sync
        // and is independent of it — a user whose role is in sync may still need
        // an orgIds mirror (e.g. right after an onboarding claim grant).
        const claimOrgIds = getOrgIdsFromClaims(
            authUser.customClaims as Record<string, unknown> | undefined,
        )
        const docOrgIds = userSnap.data()?.orgIds
        const orgIdsDrift = !orgIdsEqual(
            Array.isArray(docOrgIds) ? (docOrgIds as string[]) : undefined,
            claimOrgIds,
        )

        // Role is settable only from a real (non-pending) Firestore role that
        // differs from the claim. Admin-initiated changes are the only path to
        // set a role; we never downgrade a 'pending'/absent role here.
        const roleSyncable =
            !!profileRole && profileRole !== "pending" && profileRole !== claimRole

        // Nothing to write: role in sync (or unsettable) AND orgIds in sync.
        if (!roleSyncable && !orgIdsDrift) {
            if (!profileRole || profileRole === "pending") {
                const body: SyncResponse = {
                    synced: false,
                    role: profileRole ?? null,
                    reason: "no_profile_role",
                }
                return NextResponse.json(body)
            }
            const body: SyncResponse = { synced: false, role: profileRole, reason: "already_synced" }
            return NextResponse.json(body)
        }

        // Write — spread existing claims (soundEngineer etc.) so role sync never
        // clobbers them; mirror orgIds onto the doc only when it has drifted.
        const { FieldValue } = await import("firebase-admin/firestore")
        const docUpdate: Record<string, unknown> = {
            claimsUpdatedAt: FieldValue.serverTimestamp(),
        }
        if (orgIdsDrift) docUpdate.orgIds = claimOrgIds
        try {
            if (roleSyncable) {
                await auth.setCustomUserClaims(uid, {
                    ...(authUser.customClaims ?? {}),
                    role: profileRole,
                })
            }
            await db.collection("users").doc(uid).update(docUpdate)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[sync-claims] uid=${uid} write failed: ${msg}`)
            return NextResponse.json({ error: "Sync failed" }, { status: 500 })
        }

        logger.info(
            `[sync-claims] uid=${uid} role ${claimRole ?? "none"} → ${roleSyncable ? profileRole : "(unchanged)"}; orgIds ${orgIdsDrift ? `[${claimOrgIds.join(",")}]` : "(in sync)"}`,
        )

        const body: SyncResponse = roleSyncable
            ? { synced: true, role: profileRole! }
            : { synced: false, role: profileRole ?? null, reason: "orgids_synced" }
        return NextResponse.json(body)
    },
    { requireAuth: true },
)
