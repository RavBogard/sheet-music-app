import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    generateRawToken,
    hashToken,
    SETLIST_READER_PREFIX,
} from "@/lib/mcp/tokens"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import {
    richError,
    liftLegacyErrorEnvelope,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import {
    SETLIST_READER_KIND,
    SETLIST_READER_TOOLS,
} from "@/lib/mcp/scoped-bearer"

/**
 * `setlist_reader` — a LONG-LIVED, READ-ONLY service credential.
 *
 * Minted host-side for another product (the CRC Overlays setlist import) that
 * needs to read setlists from centralreform.live on a schedule. A minted admin
 * bearer is the wrong tool for that job: 30-day TTL (the import would die
 * silently), admin scope (the importer could delete a setlist), and the wrong
 * provenance shape (`parentTokenId` makes it cascade-die with its root).
 *
 * So this credential is deliberately different:
 *
 *   - prefix `crl_read_`, so the route gate recognises it before any read;
 *   - `kind: "setlist_reader"` + an explicit `allowedTools` allow-list of
 *     exactly `list_setlists`, `get_setlist`, `get_congregation_context`;
 *   - NO `ttlExpiresAt` — it does not expire. Revocation is explicit
 *     (`revoke_setlist_reader_bearer`), which is the only way it ever dies;
 *   - `parentTokenId: null` — it is NOT a minted child, so the root-revocation
 *     cascade does not reach it. Provenance instead lives on
 *     `mintedFromTokenId` (which root bearer minted it) + `mintedByUid`.
 *
 * Enforcement is at the REQUEST layer (`src/lib/mcp/scoped-bearer-gate.ts`),
 * not inside each tool: anything outside the allow-list is refused before the
 * MCP server dispatches it.
 *
 * Minting itself is ADMIN + ROOT only and shares mint_admin_bearer's
 * 10-per-UTC-day counter (keyed on `mintedByUid`), so a compromised root
 * cannot spray credentials of either kind. The raw bearer is returned ONCE and
 * never logged; only `sha256(raw)` is persisted.
 */

const MCP_TOKENS = "mcpTokens"
const USERS = "users"

const RATE_LIMIT_PER_DAY = 10
const MIN_PURPOSE_LEN = 8

/** Same generic-placeholder refusal set as mint_admin_bearer. */
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

/**
 * Duplicated from mint-admin-bearer.ts rather than exported across module
 * boundaries: the role gate is the security-critical line in both files and a
 * shared helper is a single edit away from silently loosening both.
 */
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

// ─── Tool 1: mint_setlist_reader_bearer ──────────────────────────────────────

export interface SetlistReaderCaller {
    uid: string
    tokenId: string
    parentTokenId: string | null
    orgId: OrgId
}

export interface MintSetlistReaderArgs {
    purpose: string
}

export interface MintSetlistReaderResult {
    ok: true
    bearer: string
    tokenId: string
    purpose: string
    allowedTools: string[]
}

export async function mintSetlistReaderBearerCore(
    caller: SetlistReaderCaller,
    args: MintSetlistReaderArgs,
): Promise<MintSetlistReaderResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()

    // 1. Role gate — admin only.
    const role = await loadCallerRole(caller.uid)
    if (role !== "admin") {
        return richError(
            "forbidden_role",
            "mint_setlist_reader_bearer requires admin role.",
            { callerRole: role ?? null, requiredRoles: ["admin"] },
            "Only an admin can mint service credentials. Ask Daniel/David, or use a root admin bearer.",
        )
    }

    // 2. Root gate — a minted child may not mint service credentials.
    if (caller.parentTokenId != null) {
        return richError(
            "non_root_bearer_cannot_mint",
            "This bearer was itself minted (it has a parent), so it cannot mint further credentials. Minting is root-only.",
            { parentTokenId: caller.parentTokenId, errorCode: 403 },
            "Use a root admin bearer (one Daniel/David handed you directly), not a minted child.",
        )
    }

    // 3. Validation — purpose only (there is no ttl to validate; this
    // credential is long-lived by design).
    const purpose = (args.purpose ?? "").trim()
    const issues: Array<{ path: string; message: string }> = []
    if (purpose.length < MIN_PURPOSE_LEN) {
        issues.push({
            path: "purpose",
            message: `purpose must be at least ${MIN_PURPOSE_LEN} characters describing which service will use the credential`,
        })
    } else if (GENERIC_PURPOSE.has(purpose.toLowerCase())) {
        issues.push({
            path: "purpose",
            message: "purpose must be descriptive, not a generic placeholder like 'test'/'probe'/'tmp'",
        })
    }
    if (issues.length > 0) {
        return richError(
            "validation_error",
            `Invalid arguments — ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
            { issues },
            "Re-call mint_setlist_reader_bearer with corrected arguments (see issues[]).",
        )
    }

    // 4. Rate-limit — SHARED 10 mints/day per uid with mint_admin_bearer
    // (same `mintedByUid` counter), so the daily cap covers both kinds.
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
            `Mint rate limit reached — ${mintsToday}/${RATE_LIMIT_PER_DAY} bearers minted today (shared with mint_admin_bearer).`,
            { mintsToday, resetAtUtc },
            `Wait until ${resetAtUtc}, or free quota by revoking unused bearers.`,
        )
    }

    // 5. Mint. Hashed-only persistence; raw is shown ONCE.
    //
    // NOTE the two deliberate absences: no `ttlExpiresAt` (long-lived by
    // design) and `parentTokenId: null` (not a cascade child). Provenance is
    // `mintedFromTokenId` — which root bearer authorised this mint.
    const rawToken = generateRawToken(SETLIST_READER_PREFIX)
    const allowedTools = [...SETLIST_READER_TOOLS]
    const ref = await db.collection(MCP_TOKENS).add({
        tokenHash: hashToken(rawToken),
        uid: caller.uid,
        orgId: caller.orgId,
        kind: SETLIST_READER_KIND,
        allowedTools,
        purpose,
        label: `setlist_reader: ${purpose}`,
        mintedByUid: caller.uid,
        mintedFromTokenId: caller.tokenId,
        parentTokenId: null,
        mintedAt: FieldValue.serverTimestamp(),
        revokedAt: null,
        lastUsedAt: null,
    })

    // Never log the raw token — only the doc id + provenance.
    logger.info("[mcp-mint] setlist_reader bearer minted", {
        tokenId: ref.id,
        mintedByUid: caller.uid,
        mintedFromTokenId: caller.tokenId,
        purpose,
        allowedTools,
    })

    return {
        ok: true,
        bearer: rawToken,
        tokenId: ref.id,
        purpose,
        allowedTools,
    }
}

// ─── Tool 2: list_setlist_reader_bearers ─────────────────────────────────────

export interface ListSetlistReaderArgs {
    includeRevoked?: boolean
}

export interface SetlistReaderSummary {
    tokenId: string
    purpose: string | null
    label: string | null
    allowedTools: string[]
    orgId: string | null
    mintedByUid: string
    mintedFromTokenId: string | null
    mintedAt: string | null
    revokedAt: string | null
    lastUsedAt: string | null
    status: "active" | "revoked"
}

export interface ListSetlistReaderResult {
    ok: true
    bearers: SetlistReaderSummary[]
}

export async function listSetlistReaderBearersCore(
    callerUid: string,
    args: ListSetlistReaderArgs = {},
): Promise<ListSetlistReaderResult | RichErrorEnvelope> {
    initAdmin()
    const role = await loadCallerRole(callerUid)
    if (role !== "admin") {
        return richError(
            "forbidden_role",
            "list_setlist_reader_bearers requires admin role.",
            { callerRole: role ?? null, requiredRoles: ["admin"] },
            "Sign in as admin or use a root admin bearer.",
        )
    }

    const db = getFirestore()
    const snap = await db
        .collection(MCP_TOKENS)
        .where("kind", "==", SETLIST_READER_KIND)
        .get()

    const bearers: SetlistReaderSummary[] = []
    for (const doc of snap.docs) {
        const d = doc.data() as Record<string, unknown>
        const revokedAt = tsToIso(d.revokedAt)
        const status: SetlistReaderSummary["status"] = revokedAt ? "revoked" : "active"
        if (status === "revoked" && !args.includeRevoked) continue
        // NEVER project tokenHash or any raw secret.
        bearers.push({
            tokenId: doc.id,
            purpose: typeof d.purpose === "string" ? d.purpose : null,
            label: typeof d.label === "string" ? d.label : null,
            allowedTools: Array.isArray(d.allowedTools)
                ? d.allowedTools.filter((t): t is string => typeof t === "string")
                : [],
            orgId: typeof d.orgId === "string" ? d.orgId : null,
            mintedByUid: typeof d.mintedByUid === "string" ? d.mintedByUid : "",
            mintedFromTokenId:
                typeof d.mintedFromTokenId === "string" ? d.mintedFromTokenId : null,
            mintedAt: tsToIso(d.mintedAt),
            revokedAt,
            lastUsedAt: tsToIso(d.lastUsedAt),
            status,
        })
    }
    bearers.sort((a, b) => (b.mintedAt ?? "").localeCompare(a.mintedAt ?? ""))
    return { ok: true, bearers }
}

// ─── Tool 3: revoke_setlist_reader_bearer ────────────────────────────────────

export interface RevokeSetlistReaderArgs {
    tokenId: string
}

export interface RevokeSetlistReaderResult {
    ok: true
    tokenId: string
    revoked: true
}

export async function revokeSetlistReaderBearerCore(
    callerUid: string,
    args: RevokeSetlistReaderArgs,
): Promise<RevokeSetlistReaderResult | RichErrorEnvelope> {
    initAdmin()
    const role = await loadCallerRole(callerUid)
    if (role !== "admin") {
        return richError(
            "forbidden_role",
            "revoke_setlist_reader_bearer requires admin role.",
            { callerRole: role ?? null, requiredRoles: ["admin"] },
            "Sign in as admin or use a root admin bearer.",
        )
    }

    const tokenId = (args.tokenId ?? "").trim()
    if (!tokenId) {
        return richError(
            "not_found",
            "tokenId must be a non-empty setlist_reader token doc id.",
            { tokenId: args.tokenId ?? null },
            "Call list_setlist_reader_bearers to find a valid tokenId.",
        )
    }

    const db = getFirestore()
    const ref = db.collection(MCP_TOKENS).doc(tokenId)
    const snap = await ref.get()
    // Refuse anything that isn't a setlist_reader token — root, minted_admin
    // and test tokens each have their own revoke path.
    if (!snap.exists || snap.data()?.kind !== SETLIST_READER_KIND) {
        return richError(
            "not_found",
            `No setlist_reader bearer with tokenId '${tokenId}'.`,
            { tokenId },
            "Call list_setlist_reader_bearers to find a valid tokenId. This tool only revokes kind:'setlist_reader' tokens — use revoke_minted_bearer for minted admin bearers.",
        )
    }

    // Idempotent — re-revoking an already-revoked token is a no-op success.
    if (!snap.data()?.revokedAt) {
        await ref.update({ revokedAt: FieldValue.serverTimestamp() })
    }
    logger.info("[mcp-mint] setlist_reader bearer revoked", { tokenId, callerUid })

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

function tokenIdentityFrom(extra: AuthExtra): SetlistReaderCaller {
    const e = extra.authInfo?.extra ?? {}
    const uid = e.uid
    const tokenId = e.tokenId
    if (typeof uid !== "string" || !uid || typeof tokenId !== "string" || !tokenId) {
        throw new Error("Unauthenticated MCP request")
    }
    const parentTokenId =
        typeof e.parentTokenId === "string" && e.parentTokenId ? e.parentTokenId : null
    const orgId: OrgId = typeof e.orgId === "string" && e.orgId ? e.orgId : DEFAULT_ORG_ID
    return { uid, tokenId, parentTokenId, orgId }
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

export function registerSetlistReaderBearerTools(server: McpServer): void {
    server.registerTool(
        "mint_setlist_reader_bearer",
        {
            description:
                "ADMIN + ROOT only — mint a LONG-LIVED, READ-ONLY service credential (`crl_read_…`, kind:'setlist_reader') for another system that needs to import setlists from centralreform.live. WHAT IT CAN DO: exactly three tools — list_setlists, get_setlist, get_congregation_context. WHAT IT CANNOT DO: everything else. It cannot create, update, publish or delete a setlist; cannot touch charts, the library, musicians or monitor mixes; cannot mint or revoke any credential; cannot read the admin surface. Any other tool call is refused at the request layer with `forbidden_scope` before the server dispatches it, and tools/list shows it only its three tools. It has NO expiry — unlike mint_admin_bearer's 30-day-max TTL, this credential lives until someone calls revoke_setlist_reader_bearer, so a scheduled import doesn't die silently. It is NOT a minted child: `parentTokenId` is null, so revoking the root bearer that minted it does NOT kill it; provenance is recorded on `mintedFromTokenId`. The raw bearer is returned ONCE (store it in the consuming system's secret store; only the hash is persisted). Shares mint_admin_bearer's 10-mints-per-UTC-day cap. Returns `{ok:true, bearer, tokenId, purpose, allowedTools}`.",
            inputSchema: {
                purpose: z
                    .string()
                    .min(MIN_PURPOSE_LEN)
                    .describe(
                        `Required audit string (≥${MIN_PURPOSE_LEN} chars) naming the system that will hold the credential, e.g. 'crc overlays setlist import'. Generic placeholders ('test'/'probe'/'tmp') are refused.`,
                    ),
            },
        },
        async (args, extra) => {
            const result = await mintSetlistReaderBearerCore(
                tokenIdentityFrom(extra),
                args,
            )
            return jsonResult(result)
        },
    )

    server.registerTool(
        "list_setlist_reader_bearers",
        {
            description:
                "ADMIN only — list every long-lived read-only service credential (kind:'setlist_reader') with provenance. NEVER returns the token hash or any raw secret. Default-hides revoked credentials; pass includeRevoked to surface them. Each row: `{tokenId, purpose, label, allowedTools, orgId, mintedByUid, mintedFromTokenId, mintedAt, revokedAt, lastUsedAt, status:'active'|'revoked'}`. These credentials never expire, so `lastUsedAt` is the signal for whether one is still in service. Use this to audit who holds read access and to find tokenIds for revoke_setlist_reader_bearer.",
            inputSchema: {
                includeRevoked: z
                    .boolean()
                    .optional()
                    .describe("If true, also include revoked credentials. Default false."),
            },
        },
        async (args, extra) => {
            const result = await listSetlistReaderBearersCore(uidFrom(extra), args)
            return jsonResult(result)
        },
    )

    server.registerTool(
        "revoke_setlist_reader_bearer",
        {
            description:
                "ADMIN only — revoke one long-lived read-only service credential by tokenId (soft-delete: stamps revokedAt; verifyBearer rejects it immediately afterwards). This is the ONLY way a setlist_reader credential ever dies — it has no TTL — so revoking it will stop whatever external import is using it. Idempotent. REFUSES (`not_found`) if the tokenId doesn't exist or isn't kind:'setlist_reader' — root, minted-admin and test tokens are NOT revocable through this tool (use revoke_minted_bearer / revoke_test_account). Find tokenIds via list_setlist_reader_bearers.",
            inputSchema: {
                tokenId: z
                    .string()
                    .min(1)
                    .describe(
                        "The setlist_reader token doc id to revoke (from list_setlist_reader_bearers).",
                    ),
            },
        },
        async (args, extra) => {
            const result = await revokeSetlistReaderBearerCore(uidFrom(extra), args)
            return jsonResult(result)
        },
    )
}
