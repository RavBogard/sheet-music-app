import { NextResponse } from "next/server"
import { initAdmin, getAuth } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { ensureMembershipsMigrated } from "@/lib/org/memberships-write"
import { canonicalClaims, rebuildClaims } from "@/lib/org/claims"

/**
 * POST /api/auth/sync-claims — "rebuild my claims" (multi-tenant phase 2,
 * design §3.4).
 *
 * Any signed-in user may ask the server to recompute their own custom claims
 * from their server-written memberships (migrating them on first touch). It
 * cannot raise anything: claims are derived only from memberships and
 * platform/owners, neither of which the browser can write. Idempotent; called
 * by the client drift repair (src/lib/drift-repair.ts).
 *
 * Response shape kept from v4.3: { synced: true, role } when claims changed,
 * { synced: false, role, reason: "already_synced" } otherwise. `role` is the
 * legacy highest-role mirror (null when the account holds no role).
 */

type SyncResponse =
    | { synced: true; role: string | null }
    | { synced: false; role: string | null; reason?: string }

export const POST = createApiHandler(
    async (ctx): Promise<NextResponse> => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        if (!initAdmin()) {
            return NextResponse.json(
                // i18n-ignore: background auth call (auth-context / drift repair); the response is logged, never shown
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const uid = ctx.auth!.uid

        let result: Awaited<ReturnType<typeof rebuildClaims>>
        let changed: boolean
        try {
            const before = canonicalClaims((await getAuth().getUser(uid)).customClaims ?? {})
            await ensureMembershipsMigrated(uid)
            result = await rebuildClaims(uid)
            changed = canonicalClaims(result.claims) !== before
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[sync-claims] uid=${uid} rebuild failed: ${msg}`)
            // i18n-ignore: background auth call (auth-context / drift repair); the response is logged, never shown
            return NextResponse.json({ error: "Sync failed" }, { status: 500 })
        }

        const role = typeof result.claims.role === "string" ? result.claims.role : null
        logger.info(`[sync-claims] uid=${uid} claims ${changed ? "rebuilt" : "already in sync"} (${result.bytes} bytes)`)
        const body: SyncResponse = changed
            ? { synced: true, role }
            : { synced: false, role, reason: "already_synced" }
        return NextResponse.json(body)
    },
    { requireAuth: true },
)
