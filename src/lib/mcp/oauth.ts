import { getFirestore } from "@/lib/firebase-admin"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { randomBytes, createHash, timingSafeEqual } from "crypto"
import { logger } from "@/lib/logger"

/**
 * OAuth 2.1 front door for the MCP server.
 *
 * Claude Desktop / Claude.ai web only offer an OAuth connector dialog (no
 * bearer-token field), so this module implements the minimum OAuth surface a
 * public PKCE client needs: Dynamic Client Registration (RFC 7591),
 * authorization-code grant with PKCE S256, and AS metadata (RFC 8414).
 *
 * Key design point: OAuth issues NOTHING new. The `/token` endpoint mints an
 * ordinary `crl_live_` token via the existing `createMcpToken` — so
 * `verifyBearer` on `/api/mcp` is unchanged. OAuth is purely a front door.
 *
 * All storage is Admin SDK. `mcpOAuthClients` + `mcpOAuthCodes` are server-only
 * (see firestore.rules). Auth codes are stored hashed and are single-use.
 */

const CLIENTS = "mcpOAuthClients"
const CODES = "mcpOAuthCodes"

/** Auth codes are short-lived and single-use. */
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000

// ── PKCE ────────────────────────────────────────────────────────────────────

/** RFC 7636 S256: code_challenge === base64url(sha256(code_verifier)). */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
    if (!verifier || !challenge) return false
    const computed = createHash("sha256").update(verifier).digest("base64url")
    const a = Buffer.from(computed)
    const b = Buffer.from(challenge)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

// ── Origin helper ───────────────────────────────────────────────────────────

/**
 * Public origin of the request, honoring Vercel's proxy headers. Falls back to
 * the canonical production host so metadata is never served with a bad issuer.
 */
export function originFromRequest(req: Request): string {
    const h = req.headers
    const proto = h.get("x-forwarded-proto") ?? "https"
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.centralreform.live"
    return `${proto}://${host}`
}

// ── Client store (Dynamic Client Registration) ──────────────────────────────

export interface OAuthClient {
    clientId: string
    redirectUris: string[]
    clientName: string | null
    createdAt: number | null
}

function isHttpsOrLoopback(uri: string): boolean {
    try {
        const u = new URL(uri)
        if (u.protocol === "https:") return true
        // Native clients commonly register a loopback redirect.
        if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) {
            return true
        }
        return false
    } catch {
        return false
    }
}

/**
 * Register a public PKCE client. Returns the stored client (no secret — public
 * clients authenticate with PKCE, not a secret). Throws on invalid input.
 */
export async function registerClient(input: {
    redirectUris: unknown
    clientName?: unknown
}): Promise<OAuthClient> {
    const uris = input.redirectUris
    if (!Array.isArray(uris) || uris.length === 0) {
        throw new Error("redirect_uris must be a non-empty array")
    }
    const redirectUris: string[] = []
    for (const u of uris) {
        if (typeof u !== "string" || !isHttpsOrLoopback(u)) {
            throw new Error(`invalid redirect_uri: ${String(u)}`)
        }
        redirectUris.push(u)
    }
    const clientName =
        typeof input.clientName === "string" && input.clientName.trim()
            ? input.clientName.trim().slice(0, 120)
            : null

    const clientId = "crl_client_" + randomBytes(16).toString("hex")
    const db = getFirestore()
    await db.collection(CLIENTS).doc(clientId).set({
        clientId,
        redirectUris,
        clientName,
        createdAt: FieldValue.serverTimestamp(),
    })
    logger.info("[mcp-oauth] client registered", { clientId, clientName })
    return { clientId, redirectUris, clientName, createdAt: null }
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
    if (!clientId) return null
    const db = getFirestore()
    const snap = await db.collection(CLIENTS).doc(clientId).get()
    if (!snap.exists) return null
    const d = snap.data()!
    return {
        clientId,
        redirectUris: Array.isArray(d.redirectUris) ? (d.redirectUris as string[]) : [],
        clientName: (d.clientName as string) ?? null,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : null,
    }
}

// ── Authorization-code store ────────────────────────────────────────────────

export interface AuthCodeData {
    clientId: string
    uid: string
    codeChallenge: string
    redirectUri: string
    scope: string | null
}

/** sha256(code), hex — codes are never stored in plaintext. */
function hashCode(code: string): string {
    return createHash("sha256").update(code).digest("hex")
}

/**
 * Mint a single-use authorization code. Returns the raw code (the only time
 * it exists in plaintext); only its hash is persisted.
 */
export async function createAuthCode(data: AuthCodeData): Promise<string> {
    const code = randomBytes(32).toString("hex")
    const db = getFirestore()
    await db
        .collection(CODES)
        .doc(hashCode(code))
        .set({
            ...data,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + AUTH_CODE_TTL_MS),
        })
    return code
}

/**
 * Consume an authorization code: validates existence + expiry, then deletes it
 * (single-use). Returns the stored data, or null if missing/expired.
 */
export async function consumeAuthCode(code: string): Promise<AuthCodeData | null> {
    if (!code) return null
    const db = getFirestore()
    const ref = db.collection(CODES).doc(hashCode(code))
    const snap = await ref.get()
    if (!snap.exists) return null

    // Single-use: delete immediately, before any other validation can fail and
    // leave a replayable code behind.
    await ref.delete()

    const d = snap.data()!
    const expiresAt = d.expiresAt instanceof Timestamp ? d.expiresAt.toMillis() : 0
    if (Date.now() > expiresAt) return null

    return {
        clientId: d.clientId as string,
        uid: d.uid as string,
        codeChallenge: d.codeChallenge as string,
        redirectUri: d.redirectUri as string,
        scope: (d.scope as string) ?? null,
    }
}

// ── Authorization-server metadata (RFC 8414) ────────────────────────────────

export function authorizationServerMetadata(origin: string) {
    return {
        issuer: origin,
        authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
        token_endpoint: `${origin}/api/mcp/oauth/token`,
        registration_endpoint: `${origin}/api/mcp/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
    }
}
