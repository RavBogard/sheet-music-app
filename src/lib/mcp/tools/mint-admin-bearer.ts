import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { generateRawToken, hashToken } from "@/lib/mcp/tokens"
import { logger } from "@/lib/logger"
import {
    richError,
    liftLegacyErrorEnvelope,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"

/**
 * Programmatic admin-bearer minting for Claude Code agents.
 *
 * Lets an admin agent running with a ROOT admin bearer mint fresh short-lived
 * admin bearers on demand — eliminating the Daniel-action latency on pool
 * refill — without opening a runaway-credential hole. Three tools:
 *
 *  - `mint_admin_bearer({purpose, ttlSec?})` — root-only; mints a child bearer
 *    that shares the caller's uid (inherits admin role via `users/{uid}.role`).
 *  - `list_minted_bearers({includeRevoked?, includeExpired?})` — audit surface;
 *    never returns the token hash.
 *  - `revoke_minted_bearer({tokenId})` — soft-delete (stamps `revokedAt`).
 *
 * ── Security model ──────────────────────────────────────────────────────────
 *
 * Depth capped at 1. Only a *root* bearer (no `parentTokenId`) may mint; a
 * minted child calling `mint_admin_bearer` is refused. The token graph is
 * exactly root → direct children — no chains, no grandchildren.
 *
 * Root-revocation cascade lives in `verifyBearer` (auth.ts): a child carries
 * `parentTokenId`, and the verifier does one extra parent read on the child's
 * request path, rejecting the child if the parent is missing / revoked /
 * TTL-expired. Net effect: revoking a root bearer instantly kills every child
 * it minted. Zero overhead on the root path (no `parentTokenId`).
 *
 * The raw token is returned ONCE at mint time and is never retrievable again —
 * only `sha256(rawToken)` is persisted (same contract as the test-token mint).
 */

const MCP_TOKENS = "mcpTokens"
const USERS = "users"

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60 // 604800 = 7d
const MIN_TTL_SEC = 60 * 60 // 3600 = 1h
const MAX_TTL_SEC = 30 * 24 * 60 * 60 // 2592000 = 30d
const RATE_LIMIT_PER_DAY = 10
const MIN_PURPOSE_LEN = 8

/**
 * Generic placeholder purposes we refuse — the audit field is worthless if it's
 * "test"/"probe"/"tmp". Most are already excluded by the ≥8-char rule; this set
 * also catches the longer generic words that slip past the length check.
 */
const GENERIC_PURPOSE = new Set([
    "test",
    "testing",
    "probe",
    "tmp",
    "temp",
    "debug",
    "debugging",
    "placeholder",
    "example",
    "sample",
    "misc",
    "stuff",
    "whatever",
])

const TOKEN_KIND = "minted_admin"

async function loadCallerRole(uid: string): Promise<string | undefined> {
    const db = getFirestore()
    const snap = await db.collection(USERS).doc(uid).get()
    if (!snap.exists) return undefined
    const data = snap.data() as Record<string, unknown> | undefined
    return typeof data?.role === "string" ? data.role : undefined
}

/** Midnight-UTC (start of the current UTC day) in epoch millis. */
function startOfUtcDayMillis(ms: number): number {
    const d = new Date(ms)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function tsToIso(v: unknown): string | null {
    return v instanceof Timestamp ? v.toDate().toISOString() : null
}

// ─── Tool 1: mint_admin_bearer ───────────────────────────────────────────────

export interface MintAdminBearerCaller {
    uid: string
    tokenId: string
    parentTokenId: string | null
}

export interface MintAdminBearerArgs {
    purpose: string
    ttlSec?: number
}

export interface MintAdminBearerResult {
    ok: true
    bearer: string
    tokenId: string
    ttlExpiresAt: string
    purpose: string
}

export async function mintAdminBearerCore(
    caller: MintAdminBearerCaller,
    args: MintAdminBearerArgs,
): Promise<MintAdminBearerResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()

    // 1. Role gate — admin only (NOT band_leader; minting admin credentials is
    // a strictly-admin capability).
    const role = await loadCallerRole(caller.uid)
    if (role !== "admin") {
        return richError(
            "forbidden_role",
            "mint_admin_bearer requires admin role.",
            { callerRole: role ?? null, requiredRoles: ["admin"] },
            "Only an admin can mint admin bearers. Ask Daniel/David, or use a root admin bearer.",
        )
    }

    // 2. Root gate — depth capped at 1. A minted child cannot mint.
    if (caller.parentTokenId != null) {
        return richError(
            "non_root_bearer_cannot_mint",
            "This bearer was itself minted (it has a parent), so it cannot mint further bearers. Minting is root-only (depth capped at 1).",
            { parentTokenId: caller.parentTokenId, errorCode: 403 },
            "Use a root admin bearer (one Daniel/David handed you directly), not a minted child.",
        )
    }

    // 3. Validation — purpose + ttlSec.
    const issues: Array<{ path: string; message: string }> = []
    const purpose = (args.purpose ?? "").trim()
    if (purpose.length < MIN_PURPOSE_LEN) {
        issues.push({
            path: "purpose",
            message: `purpose must be at least ${MIN_PURPOSE_LEN} characters describing why the bearer is needed`,
        })
    } else if (GENERIC_PURPOSE.has(purpose.toLowerCase())) {
        issues.push({
            path: "purpose",
            message: "purpose must be descriptive, not a generic placeholder like 'test'/'probe'/'tmp'",
        })
    }
    const ttlSec = args.ttlSec ?? DEFAULT_TTL_SEC
    if (!Number.isFinite(ttlSec) || ttlSec < MIN_TTL_SEC || ttlSec > MAX_TTL_SEC) {
        issues.push({
            path: "ttlSec",
            message: `ttlSec must be an integer in [${MIN_TTL_SEC}, ${MAX_TTL_SEC}] seconds (1h–30d)`,
        })
    }
    if (issues.length > 0) {
        return richError(
            "validation_error",
            `Invalid arguments — ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
            { issues },
            "Re-call mint_admin_bearer with corrected arguments (see issues[]).",
        )
    }

    // 4. Rate-limit — 10 mints/day per uid (UTC day). Equality-only query on
    // `mintedByUid` (auto single-field index, no composite index needed) +
    // in-memory count of today's mints. Minted-token volume per uid is tiny
    // (≤10/day), so the in-memory filter stays cheap.
    const startOfTodayUtc = startOfUtcDayMillis(Date.now())
    const mintedSnap = await db
        .collection(MCP_TOKENS)
        .where("mintedByUid", "==", caller.uid)
        .get()
    let mintsToday = 0
    for (const d of mintedSnap.docs) {
        const m = d.data().mintedAt
        if (m instanceof Timestamp && m.toMillis() >= startOfTodayUtc) mintsToday++
    }
    if (mintsToday >= RATE_LIMIT_PER_DAY) {
        const resetAtUtc = new Date(startOfTodayUtc + 24 * 60 * 60 * 1000).toISOString()
        return richError(
            "rate_limited",
            `Mint rate limit reached — ${mintsToday}/${RATE_LIMIT_PER_DAY} bearers minted today.`,
            { mintsToday, resetAtUtc },
            `Wait until ${resetAtUtc}, or free quota by revoking unused bearers with revoke_minted_bearer.`,
        )
    }

    // 5. Mint. Hashed-only persistence; raw is shown ONCE.
    const rawToken = generateRawToken()
    const nowMs = Date.now()
    const ttlExpiresAtMs = nowMs + ttlSec * 1000
    const ref = await db.collection(MCP_TOKENS).add({
        tokenHash: hashToken(rawToken),
        uid: caller.uid,
        parentTokenId: caller.tokenId,
        purpose,
        mintedByUid: caller.uid,
        mintedAt: FieldValue.serverTimestamp(),
        kind: TOKEN_KIND,
        ttlExpiresAt: Timestamp.fromMillis(ttlExpiresAtMs),
        revokedAt: null,
        lastUsedAt: null,
    })

    // Never log the raw token — only the doc id + provenance.
    logger.info("[mcp-mint] admin bearer minted", {
        tokenId: ref.id,
        mintedByUid: caller.uid,
        parentTokenId: caller.tokenId,
        purpose,
        ttlExpiresAt: new Date(ttlExpiresAtMs).toISOString(),
    })

    return {
        ok: true,
        bearer: rawToken,
        tokenId: ref.id,
        ttlExpiresAt: new Date(ttlExpiresAtMs).toISOString(),
        purpose,
    }
}

// ─── Tool 2: list_minted_bearers ─────────────────────────────────────────────

export interface ListMintedBearersArgs {
    includeRevoked?: boolean
    includeExpired?: boolean
}

export interface MintedBearerSummary {
    tokenId: string
    parentTokenId: string | null
    purpose: string | null
    mintedByUid: string
    mintedAt: string | null
    ttlExpiresAt: string | null
    revokedAt: string | null
    lastUsedAt: string | null
    status: "active" | "revoked" | "expired"
}

export interface ListMintedBearersResult {
    ok: true
    bearers: MintedBearerSummary[]
}

export async function listMintedBearersCore(
    callerUid: string,
    args: ListMintedBearersArgs = {},
): Promise<ListMintedBearersResult | RichErrorEnvelope> {
    initAdmin()
    const role = await loadCallerRole(callerUid)
    if (role !== "admin") {
        return richError(
            "forbidden_role",
            "list_minted_bearers requires admin role.",
            { callerRole: role ?? null, requiredRoles: ["admin"] },
            "Sign in as admin or use a root admin bearer.",
        )
    }

    const db = getFirestore()
    const snap = await db.collection(MCP_TOKENS).where("kind", "==", TOKEN_KIND).get()
    const now = Date.now()
    const bearers: MintedBearerSummary[] = []
    for (const doc of snap.docs) {
        const d = doc.data() as Record<string, unknown>
        const revokedAt = tsToIso(d.revokedAt)
        const ttlMs = d.ttlExpiresAt instanceof Timestamp ? d.ttlExpiresAt.toMillis() : null
        const expired = ttlMs !== null && ttlMs <= now
        const status: MintedBearerSummary["status"] = revokedAt
            ? "revoked"
            : expired
              ? "expired"
              : "active"
        if (status === "revoked" && !args.includeRevoked) continue
        if (status === "expired" && !args.includeExpired) continue
        // NEVER project tokenHash or any raw secret.
        bearers.push({
            tokenId: doc.id,
            parentTokenId: typeof d.parentTokenId === "string" ? d.parentTokenId : null,
            purpose: typeof d.purpose === "string" ? d.purpose : null,
            mintedByUid: typeof d.mintedByUid === "string" ? d.mintedByUid : "",
            mintedAt: tsToIso(d.mintedAt),
            ttlExpiresAt: ttlMs !== null ? new Date(ttlMs).toISOString() : null,
            revokedAt,
            lastUsedAt: tsToIso(d.lastUsedAt),
            status,
        })
    }
    bearers.sort((a, b) => (b.mintedAt ?? "").localeCompare(a.mintedAt ?? ""))
    return { ok: true, bearers }
}

// ─── Tool 3: revoke_minted_bearer ────────────────────────────────────────────

export interface RevokeMintedBearerArgs {
    tokenId: string
}

export interface RevokeMintedBearerResult {
    ok: true
    tokenId: string
    revoked: true
}

export async function revokeMintedBearerCore(
    callerUid: string,
    args: RevokeMintedBearerArgs,
): Promise<RevokeMintedBearerResult | RichErrorEnvelope> {
    initAdmin()
    const role = await loadCallerRole(callerUid)
    if (role !== "admin") {
        return richError(
            "forbidden_role",
            "revoke_minted_bearer requires admin role.",
            { callerRole: role ?? null, requiredRoles: ["admin"] },
            "Sign in as admin or use a root admin bearer.",
        )
    }

    const tokenId = (args.tokenId ?? "").trim()
    if (!tokenId) {
        return richError(
            "not_found",
            "tokenId must be a non-empty minted_admin token doc id.",
            { tokenId: args.tokenId ?? null },
            "Call list_minted_bearers to find a valid tokenId.",
        )
    }

    const db = getFirestore()
    const ref = db.collection(MCP_TOKENS).doc(tokenId)
    const snap = await ref.get()
    // Refuse anything that isn't a minted_admin token — root + test tokens have
    // their own revoke paths and must not be reachable through this tool.
    if (!snap.exists || snap.data()?.kind !== TOKEN_KIND) {
        return richError(
            "not_found",
            `No minted_admin bearer with tokenId '${tokenId}'.`,
            { tokenId },
            "Call list_minted_bearers to find a valid minted tokenId. This tool only revokes kind:'minted_admin' tokens — use revoke_test_account for test tokens.",
        )
    }

    // Idempotent — re-revoking an already-revoked token is a no-op success.
    if (!snap.data()?.revokedAt) {
        await ref.update({ revokedAt: FieldValue.serverTimestamp() })
    }
    logger.info("[mcp-mint] minted bearer revoked", { tokenId, callerUid })

    return { ok: true, tokenId, revoked: true }
}

// ─── MCP tool registration ───────────────────────────────────────────────────

type AuthExtra = { authInfo?: { extra?: Record<string, unknown> } }

function uidFrom(extra: AuthExtra): string {
    const uid = extra.authInfo?.extra?.uid
    if (typeof uid !== "string" || !uid) {
        throw new Error("Unauthenticated MCP request")
    }
    return uid
}

/**
 * Resolve the caller's full token identity (uid + own tokenId + parentTokenId)
 * from the AuthInfo extras the MCP route plumbs through `verifyBearer`. Required
 * by mint_admin_bearer to enforce root-only minting.
 */
function tokenIdentityFrom(extra: AuthExtra): MintAdminBearerCaller {
    const e = extra.authInfo?.extra ?? {}
    const uid = e.uid
    const tokenId = e.tokenId
    if (typeof uid !== "string" || !uid || typeof tokenId !== "string" || !tokenId) {
        throw new Error("Unauthenticated MCP request")
    }
    const parentTokenId =
        typeof e.parentTokenId === "string" && e.parentTokenId ? e.parentTokenId : null
    return { uid, tokenId, parentTokenId }
}

function jsonResult(data: unknown) {
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(liftLegacyErrorEnvelope(data), null, 2),
            },
        ],
    }
}

export function registerMintAdminBearerTools(server: McpServer): void {
    server.registerTool(
        "mint_admin_bearer",
        {
            description:
                "ADMIN + ROOT only — mint a fresh short-lived admin bearer on demand (eliminates pool-refill latency for Claude Code agents). The minted child shares the caller's uid, so it inherits admin role naturally. **Root-only (depth capped at 1):** a bearer that was itself minted cannot mint further bearers — use a root bearer Daniel/David handed you directly. The raw bearer is returned ONCE (store it; only the hash is persisted). Revoking the ROOT bearer instantly invalidates every child it minted (lazy parent-check in verifyBearer). Caps: ttlSec default 7d, min 1h, max 30d; rate-limited to 10 mints/day per uid. Returns `{ok:true, bearer, tokenId, ttlExpiresAt, purpose}`.",
            inputSchema: {
                purpose: z
                    .string()
                    .min(MIN_PURPOSE_LEN)
                    .describe(
                        `Required audit string (≥${MIN_PURPOSE_LEN} chars) describing why the bearer is needed, e.g. 'cycle-8 coder probe bearer'. Generic placeholders ('test'/'probe'/'tmp') are refused.`,
                    ),
                ttlSec: z
                    .number()
                    .int()
                    .min(MIN_TTL_SEC)
                    .max(MAX_TTL_SEC)
                    .optional()
                    .describe(
                        `Time-to-live in seconds. Default ${DEFAULT_TTL_SEC} (7d); min ${MIN_TTL_SEC} (1h); max ${MAX_TTL_SEC} (30d). Enforced by verifyBearer's ttlExpiresAt check.`,
                    ),
            },
        },
        async (args, extra) => {
            const result = await mintAdminBearerCore(tokenIdentityFrom(extra), args)
            return jsonResult(result)
        },
    )

    server.registerTool(
        "list_minted_bearers",
        {
            description:
                "ADMIN only — list every programmatically-minted admin bearer (kind:'minted_admin') with provenance + lifecycle status. NEVER returns the token hash or any raw secret. Default-hides revoked + expired; pass includeRevoked/includeExpired to surface them. Each row: `{tokenId, parentTokenId, purpose, mintedByUid, mintedAt, ttlExpiresAt, revokedAt, lastUsedAt, status:'active'|'revoked'|'expired'}`. Use this to audit the pool + find tokenIds for revoke_minted_bearer.",
            inputSchema: {
                includeRevoked: z
                    .boolean()
                    .optional()
                    .describe("If true, also include revoked bearers. Default false."),
                includeExpired: z
                    .boolean()
                    .optional()
                    .describe("If true, also include TTL-expired bearers. Default false."),
            },
        },
        async (args, extra) => {
            const result = await listMintedBearersCore(uidFrom(extra), args)
            return jsonResult(result)
        },
    )

    server.registerTool(
        "revoke_minted_bearer",
        {
            description:
                "ADMIN only — revoke one programmatically-minted admin bearer by tokenId (soft-delete: stamps revokedAt; verifyBearer rejects it immediately afterwards). Idempotent. REFUSES (`not_found`) if the tokenId doesn't exist or isn't kind:'minted_admin' — root + test tokens are NOT revocable through this tool (use revoke_test_account for test tokens). Find tokenIds via list_minted_bearers.",
            inputSchema: {
                tokenId: z
                    .string()
                    .min(1)
                    .describe(
                        "The minted_admin token doc id to revoke (from list_minted_bearers).",
                    ),
            },
        },
        async (args, extra) => {
            const result = await revokeMintedBearerCore(uidFrom(extra), args)
            return jsonResult(result)
        },
    )
}
