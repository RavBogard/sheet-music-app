import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"

/**
 * Daniel-ratified default — kept in sync with `DEFAULT_CONFIDENCE_THRESHOLD`
 * in `src/lib/library/ai-enrichment.ts` (a3 NEW-3, master @ 0cf194841).
 * Duplicated here as a literal — NOT imported — because that module pulls in
 * `@anthropic-ai/sdk`, and this tool surface needs to stay importable from
 * test contexts that don't have the Anthropic client installed. If the
 * default ever changes, update both call sites.
 */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7

/**
 * Cycle-3 c2 — admin MCP tools for the AI enrichment config doc shipped by a3
 * (NEW-3). Lets Daniel flip `autoApplyEnabled` + tune `threshold` from Claude
 * Desktop without opening Firebase Console.
 *
 * Doc shape (single doc, `aiConfig/autoApplyEnabled`):
 *   - `enabled: boolean` — the auto-apply gate read by
 *     `defaultLoadConfig` in `src/lib/library/ai-enrichment.ts` as
 *     `data.enabled === true`. Default false (calibration phase) until
 *     Daniel sees enough good calls in the /manage/library-review queue.
 *   - `threshold: number` — confidence floor for the AI's per-row
 *     `confidence` field. Below threshold → row enters review_pending
 *     regardless of autoApplyEnabled. Validated `0 < value <= 1` on read;
 *     defaults to {@link DEFAULT_CONFIDENCE_THRESHOLD} (0.7) when missing
 *     or out of range.
 *
 * Auth: admin-only. ANTHROPIC_API_KEY is environment-level activation; this
 * surface intentionally does NOT expose it as a tunable (rotating a secret
 * key through an MCP tool would be the wrong surface — that's Vercel env).
 *
 * Write contract: dryRun-default + force-gated per the F-05 standing rule
 * ([[feedback_dryrun_is_observability]]). dryRun returns the would-be state
 * with no writes. A real-run without `force: true` returns the same plan
 * with `refused: true` and still no writes. Pair `dryRun: false, force: true`
 * for the actual flip — mirrors `reconcile_library`, `backfill_setlist_test_flag`,
 * and `backfill_library_index`.
 *
 * Idempotence: writes use Firestore merge-update, so re-running `set_*` with
 * the same value on an already-current doc returns `{ok: true, previous: X,
 * new: X, changed: false}`.
 */

const AI_CONFIG_DOC = "autoApplyEnabled"

export interface AiConfigState {
    autoApplyEnabled: boolean
    threshold: number
}

export interface GetAiConfigResult extends AiConfigState {
    ok: true
    /**
     * Cycle-3 AI-002 — true when the AI enrichment subscriber is configured
     * to call the model (i.e. `GEMINI_API_KEY` is present in the environment;
     * post-a3-gemini-swap rename). Cleanly distinguishes "dormant by config"
     * (subscriberActive: false, the queue piles up at status:'pending') from
     * "broken in code" (subscriberActive: true but no rows ever flip to
     * 'enriched'/'review_pending'). Mirrors the activation check in
     * `defaultLoadConfig` (src/lib/library/ai-enrichment.ts) — single source
     * of truth re-evaluated per call so a Vercel env update flips this
     * without a process restart.
     */
    subscriberActive: boolean
}

export interface SetAiAutoApplyArgs {
    enabled: boolean
    dryRun?: boolean
    force?: boolean
}

export interface SetAiThresholdArgs {
    value: number
    dryRun?: boolean
    force?: boolean
}

export interface SetAiAutoApplyResult {
    ok: true
    previous: boolean
    new: boolean
    /** False when the requested value already matched the stored value. */
    changed: boolean
    dryRun: boolean
    /** Set true when a real-run was attempted without `force: true`. No write occurred. */
    refused?: true
}

export interface SetAiThresholdResult {
    ok: true
    previous: number
    new: number
    changed: boolean
    dryRun: boolean
    refused?: true
}

/**
 * Admin-only gate shared by all three tools. Returns the rich
 * `forbidden_role` envelope on refusal so the wire envelope is uniform.
 */
async function assertAdmin(
    uid: string,
): Promise<{ ok: true } | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const role = await readUserRole(db, uid)
    if (role === "admin") return { ok: true }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin"],
        message: "AI config tools require an admin account.",
        hint: "Ask an admin to elevate your account, or use the read-only tools.",
    })
}

/**
 * Read the live `aiConfig/autoApplyEnabled` doc. Mirrors
 * `defaultLoadConfig` in `ai-enrichment.ts` so the values surfaced here
 * are the same values the subscriber consumes — no second source of truth.
 */
async function readAiConfig(
    db: FirebaseFirestore.Firestore,
): Promise<AiConfigState> {
    const snap = await db.collection("aiConfig").doc(AI_CONFIG_DOC).get()
    const data = snap.data() ?? {}
    const rawThreshold =
        typeof data.threshold === "number" &&
        data.threshold > 0 &&
        data.threshold <= 1
            ? data.threshold
            : DEFAULT_CONFIDENCE_THRESHOLD
    return {
        autoApplyEnabled: data.enabled === true,
        threshold: rawThreshold,
    }
}

/**
 * Cycle-3 AI-002 — derive subscriber-active state from the Vercel env. Kept
 * inline as a literal rather than imported from `ai-enrichment.ts` so this
 * tool stays importable from contexts that don't have `@google/genai`
 * loaded (mirrors the {@link DEFAULT_CONFIDENCE_THRESHOLD} duplication). Re-
 * evaluated per call so a Vercel env update flips the flag without a process
 * restart.
 */
function isSubscriberActive(): boolean {
    const apiKey = process.env.GEMINI_API_KEY
    return typeof apiKey === "string" && apiKey.length > 0
}

export async function getAiConfig(
    uid: string,
): Promise<GetAiConfigResult | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate
    try {
        const db = getFirestore()
        const state = await readAiConfig(db)
        return { ok: true, ...state, subscriberActive: isSubscriberActive() }
    } catch (err) {
        return richError(
            "ai_config_read_failed",
            `Failed to read aiConfig: ${err instanceof Error ? err.message : String(err)}`,
            {},
            "Check Firestore connectivity; the document path is aiConfig/autoApplyEnabled.",
        )
    }
}

export async function setAiAutoApply(
    uid: string,
    args: SetAiAutoApplyArgs,
): Promise<SetAiAutoApplyResult | RichErrorEnvelope> {
    if (typeof args?.enabled !== "boolean") {
        return richError(
            "invalid_argument",
            "`enabled` must be a boolean.",
            { enabled: args?.enabled ?? null },
            "Pass `enabled: true` to enable auto-apply or `enabled: false` to force every row into review.",
        )
    }
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate

    const dryRun = args.dryRun !== false
    const force = args.force === true

    try {
        const db = getFirestore()
        const state = await readAiConfig(db)
        const previous = state.autoApplyEnabled
        const next = args.enabled
        const changed = previous !== next

        if (dryRun) {
            return {
                ok: true,
                previous,
                new: next,
                changed,
                dryRun: true,
            }
        }

        if (!force) {
            return {
                ok: true,
                previous,
                new: next,
                changed,
                dryRun: false,
                refused: true,
            }
        }

        await db
            .collection("aiConfig")
            .doc(AI_CONFIG_DOC)
            .set(
                { enabled: next, updatedAt: new Date().toISOString() },
                { merge: true },
            )
        logger.info("[mcp] set_ai_auto_apply committed", {
            uid,
            previous,
            new: next,
            changed,
        })
        return {
            ok: true,
            previous,
            new: next,
            changed,
            dryRun: false,
        }
    } catch (err) {
        return richError(
            "ai_config_write_failed",
            `Failed to update aiConfig.enabled: ${err instanceof Error ? err.message : String(err)}`,
            {},
            "Check Firestore connectivity; the document path is aiConfig/autoApplyEnabled.",
        )
    }
}

export async function setAiThreshold(
    uid: string,
    args: SetAiThresholdArgs,
): Promise<SetAiThresholdResult | RichErrorEnvelope> {
    if (typeof args?.value !== "number" || !Number.isFinite(args.value)) {
        return richError(
            "invalid_argument",
            "`value` must be a finite number in [0, 1].",
            { value: args?.value ?? null },
            "Pass a confidence floor like 0.7 (Daniel-ratified default) or 0.5 for looser auto-apply.",
        )
    }
    if (args.value < 0 || args.value > 1) {
        return richError(
            "invalid_argument",
            `\`value\` must be in [0, 1] (got ${args.value}).`,
            { value: args.value },
            "Confidence thresholds are normalized — a Sonnet self-assessed confidence of 0.7 means 70%.",
        )
    }
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate

    const dryRun = args.dryRun !== false
    const force = args.force === true

    try {
        const db = getFirestore()
        const state = await readAiConfig(db)
        const previous = state.threshold
        const next = args.value
        const changed = previous !== next

        if (dryRun) {
            return {
                ok: true,
                previous,
                new: next,
                changed,
                dryRun: true,
            }
        }

        if (!force) {
            return {
                ok: true,
                previous,
                new: next,
                changed,
                dryRun: false,
                refused: true,
            }
        }

        await db
            .collection("aiConfig")
            .doc(AI_CONFIG_DOC)
            .set(
                { threshold: next, updatedAt: new Date().toISOString() },
                { merge: true },
            )
        logger.info("[mcp] set_ai_threshold committed", {
            uid,
            previous,
            new: next,
            changed,
        })
        return {
            ok: true,
            previous,
            new: next,
            changed,
            dryRun: false,
        }
    } catch (err) {
        return richError(
            "ai_config_write_failed",
            `Failed to update aiConfig.threshold: ${err instanceof Error ? err.message : String(err)}`,
            {},
            "Check Firestore connectivity; the document path is aiConfig/autoApplyEnabled.",
        )
    }
}
