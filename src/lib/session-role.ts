import { logger } from "@/lib/logger"

// v4.3 Phase 9-02 — server-minted companion cookie that carries an
// HMAC-signed role claim derived from Firestore users/{uid}.role at
// mint/refresh time. This gives the proxy an authoritative role
// source independent of Firebase's __session cookie (which reflects
// whatever the client's ID token carried at sign-in, and can lag
// behind Firestore after admin-initiated role promotion).

export const SESSION_ROLE_COOKIE = "__session_role"
export const SESSION_ROLE_MAX_AGE = 60 * 60 * 24 * 14 // 14 days, matches Firebase session

interface RolePayload {
    uid: string
    role: string | null
    iat: number
    exp: number
}

export interface VerifiedRole {
    uid: string
    role: string | null
}

// --- base64url helpers (Edge-compatible: no Buffer) ---

function b64urlEncodeString(s: string): string {
    return b64urlEncodeBytes(new TextEncoder().encode(s))
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
    let binary = ""
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecodeToString(s: string): string {
    return new TextDecoder().decode(b64urlToBytes(s))
}

function b64urlToBytes(s: string): Uint8Array {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
    const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + pad
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

async function getKey(): Promise<CryptoKey | null> {
    const secret = process.env.SESSION_ROLE_SECRET
    if (!secret) return null
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    )
}

/**
 * Sign a compact { uid, role, iat, exp } payload for the companion cookie.
 * Returns null if SESSION_ROLE_SECRET is missing — caller should degrade
 * gracefully (skip setting the cookie) rather than fail the whole request.
 */
export async function signRoleCookie(
    uid: string,
    role: string | null,
): Promise<string | null> {
    // v4.3 P10-01: fail loud on Vercel Production, graceful elsewhere.
    // Silent-null-in-prod was the footgun that caused the 2026-04-15 lockout.
    // Key on VERCEL_ENV (set only on Vercel) rather than NODE_ENV (which
    // is "production" during any local `next build`).
    if (!process.env.SESSION_ROLE_SECRET) {
        if (process.env.VERCEL_ENV === "production") {
            throw new Error(
                "SESSION_ROLE_SECRET is required on Vercel Production (see docs/DEPLOY-CHECKLIST.md)",
            )
        }
        logger.warn(
            "[session-role] SESSION_ROLE_SECRET missing — companion cookie disabled",
        )
        return null
    }
    const key = await getKey()
    if (!key) return null
    const iat = Math.floor(Date.now() / 1000)
    const payload: RolePayload = { uid, role, iat, exp: iat + SESSION_ROLE_MAX_AGE }
    const payloadB64 = b64urlEncodeString(JSON.stringify(payload))
    const sigBuf = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(payloadB64),
    )
    const sigB64 = b64urlEncodeBytes(new Uint8Array(sigBuf))
    return `${payloadB64}.${sigB64}`
}

/**
 * Verify the companion cookie. Returns null for any failure mode
 * (bad format, bad signature, expired, missing secret). Callers
 * MUST compare the returned uid against the Firebase session uid
 * before trusting the role — an attacker could otherwise replay
 * another user's valid cookie.
 */
export async function verifyRoleCookie(
    raw: string | undefined | null,
): Promise<VerifiedRole | null> {
    if (!raw || typeof raw !== "string") return null
    const parts = raw.split(".")
    if (parts.length !== 2) return null
    const [payloadB64, sigB64] = parts

    const key = await getKey()
    if (!key) return null

    let sigBuffer: ArrayBuffer
    try {
        const bytes = b64urlToBytes(sigB64)
        sigBuffer = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(sigBuffer).set(bytes)
    } catch {
        return null
    }

    let ok = false
    try {
        ok = await crypto.subtle.verify(
            "HMAC",
            key,
            sigBuffer,
            new TextEncoder().encode(payloadB64),
        )
    } catch {
        return null
    }
    if (!ok) return null

    let payload: RolePayload
    try {
        payload = JSON.parse(b64urlDecodeToString(payloadB64)) as RolePayload
    } catch {
        return null
    }
    if (!payload || typeof payload.uid !== "string") return null
    if (typeof payload.exp !== "number") return null
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) return null
    const role = typeof payload.role === "string" ? payload.role : null
    return { uid: payload.uid, role }
}
