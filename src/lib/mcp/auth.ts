import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import {
    hashToken,
    PLATFORM_KIND,
    PLATFORM_PREFIX,
    SETLIST_READER_PREFIX,
    VIEW_AS_KIND,
    VIEW_AS_PREFIX,
} from "@/lib/mcp/tokens"
import { logger } from "@/lib/logger"
import { noteRateLimitIdentity } from "@/lib/rate-limit-identity"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import { primeTenantConfig } from "@/lib/org/org-exists"
import type { OrgId } from "@/lib/org/types"

/**
 * MCP bearer-token verifier.
 *
 * MCP tokens are NOT Firebase ID tokens — they are opaque `crl_live_` strings
 * hashed into the `mcpTokens` collection. On success this returns the resolved
 * owner `uid` (plus the verified token's own doc id + `parentTokenId`), the
 * same `uid` shape the `/api/*` routes pass downstream, so MCP tool handlers
 * can reuse the existing data layer unchanged.
 *
 * The `tokenId` + `parentTokenId` additions are ADDITIVE — every existing
 * caller destructures only `{ uid }`, so they keep compiling. The fields exist
 * for `mint_admin_bearer`: it reads `parentTokenId` to enforce root-only
 * minting (depth capped at 1), and the verifier itself does a child-only
 * root-revocation cascade so revoking a root bearer instantly kills every
 * bearer it minted.
 *
 * Never logs the raw token — only token doc ids.
 */

const COLLECTION = "mcpTokens"

export interface VerifiedBearer {
    uid: string
    /** The verified token's own `mcpTokens` doc id. */
    tokenId: string
    /** Parent token doc id for minted children; null for root + test tokens. */
    parentTokenId: string | null
    /**
     * v11-02-01: the tenant this bearer acts in. Resolved from the token doc's
     * `orgId` field; an absent field defaults to DEFAULT_ORG_ID ("crc") — the
     * same backward-compat contract v11-01 used for claims, so every existing
     * (unstamped) prod bearer keeps acting as CRC unchanged.
     */
    orgId: OrgId
    /**
     * Credential kind as stamped on the token doc — e.g. `"minted_admin"`,
     * `"setlist_reader"`. `null` for root + legacy tokens that carry no `kind`.
     * ADDITIVE: every existing caller destructures a subset, so this is
     * behaviour-neutral for the full-access path.
     */
    kind: string | null
    /**
     * Tool allow-list for scoped credentials (`setlist_reader`). `null` means
     * "unscoped" — the token may call every tool its role permits. The route's
     * scoped-bearer gate is the only consumer today.
     */
    allowedTools: string[] | null
    /**
     * Multi-tenant phase 4: a "view as" bearer (kind "view_as") is read-only;
     * write tools refuse it. Absent on every other token.
     */
    readOnly?: true
}

export interface VerifyBearerOptions {
    /**
     * Multi-tenant phase 4: which server is asking. Platform bearers
     * (kind "platform", `crl_plat_`) verify ONLY for "platform"; every other
     * kind verifies only elsewhere. Omitted = a tenant surface or route.
     */
    surface?: "platform"
}

function unauthorized(): Response {
    return new Response("Unauthorized", { status: 401 })
}

/**
 * One verification per request. The rate limiter verifies an MCP bearer to
 * key its bucket on the bearer's uid, and the route then verifies the same
 * bearer to authorise the call; both get the first answer instead of paying
 * a second Firestore lookup. A rejection is replayed as a fresh Response.
 */
type BearerVerdict =
    | { ok: VerifiedBearer }
    | { status: number; body: string; headers: [string, string][] }
const bearerVerdicts = new WeakMap<object, Map<string, Promise<BearerVerdict>>>()

export async function verifyBearer(req: Request, opts: VerifyBearerOptions = {}): Promise<VerifiedBearer | Response> {
    const surfaceKey = `${opts.surface ?? "tenant"}|${req.headers.get("authorization") ?? ""}`
    let perReq = bearerVerdicts.get(req)
    if (!perReq) {
        perReq = new Map()
        bearerVerdicts.set(req, perReq)
    }
    let pending = perReq.get(surfaceKey)
    if (!pending) {
        pending = verifyBearerUncached(req, opts).then(async (r): Promise<BearerVerdict> => {
            if (!(r instanceof Response)) {
                noteRateLimitIdentity(req, r.uid)
                return { ok: r }
            }
            noteRateLimitIdentity(req, null)
            return { status: r.status, body: await r.text(), headers: [...r.headers.entries()] }
        })
        perReq.set(surfaceKey, pending)
        // A thrown verification is not cached: the next call tries again.
        pending.catch(() => perReq!.delete(surfaceKey))
    }
    const verdict = await pending
    if ("ok" in verdict) return verdict.ok
    return new Response(verdict.body, { status: verdict.status, headers: verdict.headers })
}

async function verifyBearerUncached(req: Request, opts: VerifyBearerOptions): Promise<VerifiedBearer | Response> {
    const header = req.headers.get("authorization")
    if (!header?.startsWith("Bearer ")) return unauthorized()
    const raw = header.slice(7).trim()
    if (!raw) return unauthorized()

    if (!initAdmin()) {
        return new Response("Server not ready", { status: 500 })
    }

    const db = getFirestore()
    const snap = await db
        .collection(COLLECTION)
        .where("tokenHash", "==", hashToken(raw))
        .limit(1)
        .get()

    if (snap.empty) {
        // Cycle-7-fixes Lane 4 sub-task C (C7I1-011): every 401 path now
        // logs a structured `[mcp-auth]` warn so the next premature-401
        // repro is diagnosable. We log only the SHA-256 hash prefix of the
        // raw bearer, never the bearer itself — the prefix is enough to
        // correlate with mcpTokens doc ids in audit logs.
        logger.warn("[mcp-auth] bearer rejected: hash not found", {
            tokenHashPrefix: hashToken(raw).slice(0, 8),
        })
        return unauthorized()
    }

    const doc = snap.docs[0]
    const data = doc.data()
    if (data.revokedAt) {
        logger.warn("[mcp-auth] bearer rejected: revokedAt set", {
            tokenId: doc.id,
            revokedAt:
                data.revokedAt instanceof Timestamp
                    ? data.revokedAt.toDate().toISOString()
                    : String(data.revokedAt),
        })
        return unauthorized()
    }

    // Test-token TTL enforcement. Real (non-test) mcpTokens have no
    // `ttlExpiresAt` field, so this is a no-op for the normal Daniel/David
    // bearer path. Test tokens minted by `provisionTestAccount` stamp
    // `ttlExpiresAt` to `now + ttlSec`; once it's in the past we reject the
    // bearer the same way a soft-revoke does. The backing Auth user + owned
    // data are NOT deleted on TTL — `revoke_test_account` /
    // `cleanup_all_test_data` are the explicit cascade-delete paths.
    if (data.ttlExpiresAt instanceof Timestamp && data.ttlExpiresAt.toMillis() <= Date.now()) {
        const expiredMs = data.ttlExpiresAt.toMillis()
        logger.warn("[mcp-auth] bearer rejected: ttlExpiresAt in past", {
            tokenId: doc.id,
            ttlExpiresAt: new Date(expiredMs).toISOString(),
            nowDriftSec: Math.round((Date.now() - expiredMs) / 1000),
            kind: typeof data.kind === "string" ? data.kind : null,
        })
        return unauthorized()
    }

    // Root-revocation cascade. Minted-child bearers (kind: "minted_admin")
    // carry a `parentTokenId`; revoking the root must instantly invalidate
    // every child it minted. Rather than fan-out on revoke, we verify the
    // parent lazily on the child's own request path: one extra read, only
    // when `parentTokenId` is set. Root + test bearers have no
    // `parentTokenId`, so this is zero overhead on every existing path.
    const parentTokenId =
        typeof data.parentTokenId === "string" && data.parentTokenId
            ? data.parentTokenId
            : null
    if (parentTokenId) {
        const parentSnap = await db.collection(COLLECTION).doc(parentTokenId).get()
        const parent = parentSnap.data()
        const parentExpired =
            parent?.ttlExpiresAt instanceof Timestamp &&
            parent.ttlExpiresAt.toMillis() <= Date.now()
        if (!parentSnap.exists || parent?.revokedAt || parentExpired) {
            logger.warn("[mcp-auth] bearer rejected: parent token invalid", {
                tokenId: doc.id,
                parentTokenId,
                parentMissing: !parentSnap.exists,
                parentRevoked: !!parent?.revokedAt,
                parentExpired,
            })
            return unauthorized()
        }
    }

    // Best-effort — a failed lastUsedAt update must not fail the request.
    doc.ref
        .update({ lastUsedAt: FieldValue.serverTimestamp() })
        .catch(() => logger.warn("[mcp] lastUsedAt update failed", { tokenId: doc.id }))

    // v11-02-01: resolve the bearer's tenant from the token doc, default crc.
    const orgId: OrgId =
        typeof data.orgId === "string" && data.orgId ? data.orgId : DEFAULT_ORG_ID
    // Multi-tenant phase 3: prime the token tenant's config so tool handlers'
    // synchronous orgString / getOrgBranding reads see a third tenant's values.
    // Cached 60 s; never throws.
    await primeTenantConfig(orgId)

    // Scoped-credential fields (setlist_reader). Absent on every existing
    // token doc → null, so the full-access path is unchanged.
    const kind = typeof data.kind === "string" && data.kind ? data.kind : null
    const allowedTools = Array.isArray(data.allowedTools)
        ? data.allowedTools.filter((t: unknown): t is string => typeof t === "string")
        : null

    // Kind ⟺ prefix must agree in BOTH directions. A `setlist_reader` doc whose
    // raw string lacks `crl_read_` would otherwise slip past the route's
    // prefix-keyed gate and take the unscoped path; a `crl_read_` string on a
    // doc of any other kind would claim scoped provenance it doesn't have.
    // Either mismatch is a malformed/tampered credential — reject it.
    if ((kind === "setlist_reader") !== raw.startsWith(SETLIST_READER_PREFIX)) {
        logger.warn("[mcp-auth] bearer rejected: kind/prefix mismatch", {
            tokenId: doc.id,
            kind,
        })
        return unauthorized()
    }

    // Multi-tenant phase 4: the same both-directions check for the platform
    // and view-as prefixes, then keep each kind on its own surface.
    if (
        (kind === PLATFORM_KIND) !== raw.startsWith(PLATFORM_PREFIX) ||
        (kind === VIEW_AS_KIND) !== raw.startsWith(VIEW_AS_PREFIX)
    ) {
        logger.warn("[mcp-auth] bearer rejected: kind/prefix mismatch", { tokenId: doc.id, kind })
        return unauthorized()
    }
    if ((kind === PLATFORM_KIND) !== (opts.surface === "platform")) {
        logger.warn("[mcp-auth] bearer rejected: wrong surface for this kind", {
            tokenId: doc.id,
            kind,
            surface: opts.surface ?? "tenant",
        })
        return opts.surface === "platform"
            ? new Response(
                  "This is a tenant connector token. /api/platform/mcp accepts only a platform token (crl_plat_…) minted for the platform owner.",
                  { status: 403 },
              )
            : unauthorized()
    }

    return {
        uid: data.uid as string,
        tokenId: doc.id,
        parentTokenId,
        orgId,
        kind,
        allowedTools,
        // Present only when true, so every existing token's shape is unchanged.
        ...(kind === VIEW_AS_KIND || data.readOnly === true ? { readOnly: true as const } : {}),
    }
}
