import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { hashToken } from "@/lib/mcp/tokens"
import { logger } from "@/lib/logger"

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
}

function unauthorized(): Response {
    return new Response("Unauthorized", { status: 401 })
}

export async function verifyBearer(req: Request): Promise<VerifiedBearer | Response> {
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

    return { uid: data.uid as string, tokenId: doc.id, parentTokenId }
}
