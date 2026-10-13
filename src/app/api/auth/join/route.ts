import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { coerceOrgId } from "@/lib/org/registry"
import { membershipId, type TenantRole } from "@/lib/org/membership-types"
import { ensureMembershipsMigrated, setMembership } from "@/lib/org/memberships-write"
import { canonicalClaims } from "@/lib/org/claims"

/**
 * POST /api/auth/join — multi-tenant phase 2 (design §5.1).
 *
 * Called by the browser once per (host, uid) per session after sign-in. The
 * tenant is the HOST's (`x-org-id`, set by the proxy); the body is ignored —
 * no tenant or role input is accepted. Creates a `pending` membership in that
 * tenant if the person has none there (any role, incl. denied, is left alone).
 * Never touches another tenant.
 *
 * 200 {tenant, role, created, claimsChanged}
 */
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
        const tenant = coerceOrgId(ctx.req.headers.get("x-org-id"))
        const uid = ctx.auth.uid
        // Multi-tenant phase 4: the platform owner is admin everywhere already;
        // visiting a tenant's address must not file a join request there.
        if (ctx.auth.po) {
            return NextResponse.json({ tenant, role: "admin", created: false, claimsChanged: false })
        }
        const db = getFirestore()
        const claimsBefore = canonicalClaims(ctx.auth.token ? stripTokenFields(ctx.auth.token as unknown as Record<string, unknown>) : {})

        await ensureMembershipsMigrated(uid)
        const snap = await db.collection("memberships").doc(membershipId(tenant, uid)).get()
        if (snap.exists) {
            const role = (snap.data()?.role ?? null) as TenantRole | null
            const claimsNow = await currentClaims(uid)
            return NextResponse.json({
                tenant,
                role,
                created: false,
                claimsChanged: canonicalClaims(claimsNow) !== claimsBefore,
            })
        }

        const { after, claims } = await setMembership({
            orgId: tenant,
            uid,
            role: "pending",
            actorUid: uid,
            actorEmail: ctx.auth.email,
            reason: "join",
        })
        return NextResponse.json({
            tenant,
            role: after?.role ?? "pending",
            created: true,
            claimsChanged: canonicalClaims(claims) !== claimsBefore,
        })
    },
    { requireAuth: true },
)

/** Decoded ID token → just the custom claims (drop the standard JWT fields). */
const TOKEN_FIELDS = new Set([
    "aud", "auth_time", "exp", "firebase", "iat", "iss", "sub", "uid", "email", "email_verified",
    "name", "picture", "phone_number", "user_id",
])
function stripTokenFields(t: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(t)) if (!TOKEN_FIELDS.has(k)) out[k] = v
    return out
}

async function currentClaims(uid: string): Promise<Record<string, unknown>> {
    return ((await getAuth().getUser(uid)).customClaims ?? {}) as Record<string, unknown>
}
