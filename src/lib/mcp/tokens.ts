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
/**
 * Prefix for long-lived, read-only service credentials (`kind:
 * "setlist_reader"`). The prefix is load-bearing: the MCP route's scoped-bearer
 * gate keys off it to decide whether a request needs allow-list enforcement, so
 * non-`crl_read_` bearers take the existing path with zero extra reads.
 */
export const SETLIST_READER_PREFIX = "crl_read_"

export interface McpTokenSummary {
    id: string
    label: string
    createdAt: number | null
    lastUsedAt: number | null
}

/**
 * `<prefix>` + 32 random bytes, hex-encoded. Defaults to `crl_live_` — the
 * existing full-access bearer shape, unchanged. Pass `SETLIST_READER_PREFIX`
 * to mint a read-only service credential.
 */
export function generateRawToken(prefix: string = TOKEN_PREFIX): string {
    return prefix + randomBytes(32).toString("hex")
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

// ── multi-tenant phase 4: platform and view-as credentials ───────────────────

/**
 * `crl_plat_` — the platform owner's bearer for `/api/platform/mcp` only
 * (kind "platform"). verifyBearer refuses it everywhere else, and the
 * platform surface refuses every other kind. The prefix and the kind must
 * agree (checked in verifyBearer), like `crl_read_` / setlist_reader.
 */
export const PLATFORM_PREFIX = "crl_plat_"
export const PLATFORM_KIND = "platform"

/**
 * `crl_view_` — "View as this tenant": a short-lived (≤ 60 min) bearer for the
 * authoring surface, owned by the platform owner, acting in one tenant, and
 * read-only (kind "view_as", `readOnly: true`, `viewAs: true`). Write tools
 * refuse it (src/lib/mcp/surfaces.ts, isReadOnlyToken).
 */
export const VIEW_AS_PREFIX = "crl_view_"
export const VIEW_AS_KIND = "view_as"

export async function createPlatformToken(
    uid: string,
    label: string,
    opts: { expiresAtMs?: number | null; db?: FirebaseFirestore.Firestore } = {},
): Promise<{ id: string; rawToken: string }> {
    const db = opts.db ?? getFirestore()
    const rawToken = generateRawToken(PLATFORM_PREFIX)
    const ref = await db.collection(COLLECTION).add({
        tokenHash: hashToken(rawToken),
        uid,
        label,
        kind: PLATFORM_KIND,
        // A platform bearer acts in no tenant; tools take the tenant as an argument.
        orgId: null,
        createdAt: FieldValue.serverTimestamp(),
        lastUsedAt: null,
        revokedAt: null,
        ...(opts.expiresAtMs ? { ttlExpiresAt: Timestamp.fromMillis(opts.expiresAtMs) } : {}),
    })
    logger.info("[mcp] platform token created", { tokenId: ref.id, uid })
    return { id: ref.id, rawToken }
}

export async function createViewAsToken(
    uid: string,
    orgId: OrgId,
    expiresAtMs: number,
    label: string,
    db: FirebaseFirestore.Firestore = getFirestore(),
): Promise<{ id: string; rawToken: string }> {
    const rawToken = generateRawToken(VIEW_AS_PREFIX)
    const ref = await db.collection(COLLECTION).add({
        tokenHash: hashToken(rawToken),
        uid,
        label,
        orgId,
        kind: VIEW_AS_KIND,
        readOnly: true,
        viewAs: true,
        createdAt: FieldValue.serverTimestamp(),
        lastUsedAt: null,
        revokedAt: null,
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
    })
    logger.info("[mcp] view-as token created", { tokenId: ref.id, uid, orgId })
    return { id: ref.id, rawToken }
}

/** A user's active platform bearers (never the hash). */
export async function listPlatformTokens(uid: string, db: FirebaseFirestore.Firestore = getFirestore()): Promise<Array<McpTokenSummary & { expiresAt: number | null }>> {
    const snap = await db.collection(COLLECTION).where("uid", "==", uid).where("kind", "==", PLATFORM_KIND).get()
    return snap.docs
        .filter((d) => !d.data().revokedAt)
        .map((d) => {
            const x = d.data()
            return {
                id: d.id,
                label: (x.label as string) ?? "",
                createdAt: tsToMillis(x.createdAt),
                lastUsedAt: tsToMillis(x.lastUsedAt),
                expiresAt: tsToMillis(x.ttlExpiresAt),
            }
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}
