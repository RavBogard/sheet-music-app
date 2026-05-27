/**
 * MCP probe — role-gate refusal for `test-musician-*`.
 *
 * Exercises the MCP-side role-gate boundary: a minted `test-musician`
 * bearer MUST refuse an admin/leader-only tool with the documented
 * `isError:true` envelope shape (NOT a JSON-RPC `error.code` —
 * see [[feedback_mcp_validation_shape]]). A regression here means the
 * privilege gate broke — finding-worthy at HIGH severity.
 *
 * Test-account hygiene: every account this probe mints uses the
 * `stress-c7-` uidPrefix and is cascade-revoked by uid in `finally{}` —
 * NEVER `cleanup_all_test_data` (parallel-sweep-isolation-safe per
 * [[feedback_sandbox_test_isolation]]).
 *
 * Tool under test: `archive_nonchart_artifacts` with `dryRun:true`. It is a
 * leader-gated write tool (registered in `registerWriteTools`); with
 * `dryRun:true` it's a no-op even on a successful call, so an accidental
 * gate-bypass-regression here doesn't mutate anything beyond a stale
 * audit-log row. Refusal happens before `dryRun` is consulted.
 */

import { mcpCall, mcpCallOrThrow } from "../lib/mcp-call.mjs"

// No leading/trailing hyphens (verified against UID_PREFIX_RE in
// src/lib/mcp/tools/test-tokens.ts §193). The route appends its own hyphen
// when synthesizing the final uid (`test-<uidPrefix>-<role>-<8hex>`), so
// `stress-c7` here yields `test-stress-c7-musician-<8hex>`.
const UID_PREFIX = "stress-c7"
const PROBE_TTL_SEC = 5 * 60 // 5 min — well under create_test_account's 24h cap

/**
 * @param {{ baseUrl: string, bearer?: string }} args
 */
export default async function probe({ baseUrl, bearer }) {
    if (!bearer) {
        throw new Error(
            "role-gate-musician-refusal: bearer required (admin/leader; pass --bearer=$MCP_BEARER)",
        )
    }

    // 1. Mint a fresh test-musician account under the stress-c7- prefix.
    let mintedUid = null
    try {
        const minted = await mcpCallOrThrow({
            baseUrl,
            bearer,
            tool: "create_test_account",
            args: {
                role: "musician",
                label: `stress-c7 role-gate ${new Date().toISOString()}`,
                ttlSec: PROBE_TTL_SEC,
                uidPrefix: UID_PREFIX,
            },
        })
        if (!minted?.uid || !minted?.token) {
            throw new Error(
                `create_test_account did not return { uid, token } — got keys: ${Object.keys(minted ?? {}).join(",")}`,
            )
        }
        if (!minted.uid.startsWith(`test-`)) {
            throw new Error(
                `minted uid "${minted.uid}" does not start with "test-" — uidPrefix arg may have been ignored`,
            )
        }
        mintedUid = minted.uid

        // 2. With the musician bearer, call an admin/leader-only tool. Expect
        //    isError:true + a structured refusal payload.
        const { payload, isError } = await mcpCall({
            baseUrl,
            bearer: minted.token,
            tool: "archive_nonchart_artifacts",
            args: { dryRun: true },
        })

        if (!isError) {
            throw new Error(
                `role-gate-musician-refusal: archive_nonchart_artifacts was NOT refused for a musician bearer (isError=false). Privilege gate may have broken. Payload keys: ${Object.keys(payload ?? {}).join(",")}`,
            )
        }
        // We only insist on the isError flag — the exact machine_code text is
        // intentionally not pinned (would couple us to copy changes).
        const refusal = payload ?? {}
        return {
            mintedUid,
            mintedRole: minted.role ?? "musician",
            refusalErrorKey: refusal.error ?? null,
            refusalMessageSample: typeof refusal.message === "string"
                ? refusal.message.slice(0, 160)
                : null,
        }
    } finally {
        // 3. Always cascade-revoke by uid (NEVER cleanup_all_test_data).
        if (mintedUid) {
            try {
                await mcpCallOrThrow({
                    baseUrl,
                    bearer,
                    tool: "revoke_test_account",
                    args: { uid: mintedUid },
                })
            } catch (err) {
                // Don't mask the original throw with a teardown error; emit a
                // warning so the human sees the teardown skip.
                console.warn(
                    `[role-gate-musician-refusal] revoke_test_account(${mintedUid}) failed during teardown:`,
                    err?.message ?? err,
                )
            }
        }
    }
}
