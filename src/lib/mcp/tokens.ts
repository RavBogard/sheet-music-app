import { getFirestore } from "@/lib/firebase-admin"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { randomBytes, createHash } from "crypto"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * MCP token storage. Per-user bearer tokens that let Claude (Desktop / web /
 * Code) connect to centralreform.live via the MCP route.
 *
 * The raw token is shown to the user exactly once and is NEVER persisted —
 * only `sha256(rawToken)` is stored. All access here is Admin SDK; the
 * `mcpTokens` collection is server-only (see firestore.rules).
 */

const COLLECTION = "mcpTokens"
const TOKEN_PREFIX = "crl_live_"

export interface McpTokenSummary {
    id: string
    label: string
    createdAt: number | null
    lastUsedAt: number | null
}

/** `crl_live_` + 32 random bytes, hex-encoded. */
export function generateRawToken(): string {
    return TOKEN_PREFIX + randomBytes(32).toString("hex")
}

/** sha256(rawToken), hex — the only form of the token ever persisted. */
export function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex")
}

/**
 * Create a new MCP token for `uid`. Returns the doc id and the raw token.
 * The raw token is the caller's only chance to see it — it is not stored.
 *
 * v11-02-01: `orgId` stamps the tenant this bearer acts in (default crc —
 * trailing-optional so the existing /api/mcp/tokens route stays a 2-arg call).
 * David's brotherslazaroff bearer is minted via a dedicated path in v11-02-04.
 */
export async function createMcpToken(
    uid: string,
    label: string,
    orgId: OrgId = DEFAULT_ORG_ID,
): Promise<{ id: string; rawToken: string }> {
    const db = getFirestore()
    const rawToken = generateRawToken()
    const ref = await db.collection(COLLECTION).add({
        tokenHash: hashToken(rawToken),
        uid,
        label,
        orgId,
        createdAt: FieldValue.serverTimestamp(),
        lastUsedAt: null,
        revokedAt: null,
    })
    logger.info("[mcp] token created", { tokenId: ref.id, uid, orgId })
    return { id: ref.id, rawToken }
}

/** List a user's active (non-revoked) tokens. Never returns the hash. */
export async function listMcpTokens(uid: string): Promise<McpTokenSummary[]> {
    const db = getFirestore()
    const snap = await db.collection(COLLECTION).where("uid", "==", uid).get()
    const out: McpTokenSummary[] = []
    for (const d of snap.docs) {
        const data = d.data()
        if (data.revokedAt) continue
        out.push({
            id: d.id,
            label: (data.label as string) ?? "",
            createdAt: tsToMillis(data.createdAt),
            lastUsedAt: tsToMillis(data.lastUsedAt),
        })
    }
    return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

/**
 * Revoke a token (soft delete — sets `revokedAt`). Verifies the token belongs
 * to `uid` before writing. Returns false if missing or not owned by the caller.
 */
export async function revokeMcpToken(uid: string, tokenId: string): Promise<boolean> {
    const db = getFirestore()
    const ref = db.collection(COLLECTION).doc(tokenId)
    const snap = await ref.get()
    if (!snap.exists) return false
    if (snap.data()?.uid !== uid) return false
    await ref.update({ revokedAt: FieldValue.serverTimestamp() })
    logger.info("[mcp] token revoked", { tokenId, uid })
    return true
}

function tsToMillis(v: unknown): number | null {
    return v instanceof Timestamp ? v.toMillis() : null
}
