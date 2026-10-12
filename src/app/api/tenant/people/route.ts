import { NextResponse } from "next/server"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin } from "@/lib/firebase-admin"
import { coerceOrgId } from "@/lib/org/registry"
import { orgExists } from "@/lib/org/org-exists"
import { listTenantMembers } from "@/lib/org/access"

/**
 * GET /api/tenant/people — multi-tenant phase 2 (design §5.3).
 *
 * The host tenant's people (memberships joined with their users/{uid}
 * profile), replacing the browser's cross-tenant `users` listeners. Requires
 * band leader or above IN THE HOST TENANT (requireAuth is per-tenant); the
 * platform owner may pass `?tenant=<orgId>`. `denied` people are included.
 *
 * 200 {tenant, people: TenantPerson[], pendingCount}
 */
export interface TenantPerson {
    uid: string
    displayName: string | null
    email: string | null
    photoURL: string | null
    role: string
    soundEngineer: boolean
    canUpload: boolean
    musicianProfile: Record<string, unknown> | null
    createdAt: string | null
    lastLoginAt: string | null
    addedAt: string | null
    requestedAt: string | null
}

function iso(v: unknown): string | null {
    if (v == null) return null
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null
    if (typeof v === "string") return v
    if (typeof v === "number") return new Date(v).toISOString()
    if (typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
        try {
            return (v as { toDate: () => Date }).toDate().toISOString()
        } catch {
            return null
        }
    }
    return null
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null
}

export const GET = createApiHandler(
    async (ctx): Promise<NextResponse> => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        let tenant = ctx.auth.orgId ?? coerceOrgId(ctx.req.headers.get("x-org-id"))
        const asked = new URL(ctx.req.url).searchParams.get("tenant")
        if (asked && asked !== tenant) {
            if (!ctx.auth.po) return apiError("Only the platform owner may read another tenant's people", 403, "FORBIDDEN_TENANT")
            if (!(await orgExists(asked))) return apiError(`Unknown tenant '${asked}'`, 400, "UNKNOWN_TENANT")
            tenant = asked
        }

        const members = await listTenantMembers(tenant)
        const people: TenantPerson[] = members.map((m) => {
            const p = m.profile ?? {}
            const mp = p.musicianProfile
            return {
                uid: m.uid,
                displayName: str(p.displayName),
                email: str(p.email),
                photoURL: str(p.photoURL),
                role: m.role,
                soundEngineer: m.soundEngineer === true,
                canUpload: p.canUpload === true,
                musicianProfile: mp && typeof mp === "object" ? (mp as Record<string, unknown>) : null,
                createdAt: iso(p.createdAt),
                lastLoginAt: iso(p.lastLoginAt),
                addedAt: iso(m.addedAt),
                requestedAt: iso(m.requestedAt),
            }
        })
        people.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        const pendingCount = people.filter((p) => p.role === "pending").length
        return NextResponse.json({ tenant, people, pendingCount })
    },
    { role: "band_leader" },
)
