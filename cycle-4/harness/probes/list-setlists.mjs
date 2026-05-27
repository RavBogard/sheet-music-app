/**
 * MCP probe — `list_setlists` read smoke.
 *
 * Read-only catalog smoke. A regression here usually surfaces one of:
 *   - the date-window arg type drift (cf. cowork-2026-05-23 VERIFY-1:
 *     mixed Firestore types on `eventDate` dropping rows at the fetch
 *     layer);
 *   - the SDK envelope-vs-payload shape changing under us
 *     ([[feedback_mcp_validation_shape]]);
 *   - a registry refactor that quietly renamed/removed the tool.
 *
 * Calls `list_setlists` with NO date filter (wide-open) — that exercises the
 * lookup-blind path coder-3's `c71f41bed4` F-016/F-017 catalog dual-read
 * landed against. The probe is finding-worthy if:
 *   - the tool refuses (`isError:true`),
 *   - the payload is not array-shaped, OR
 *   - the array is empty (would mean the prod catalog dropped to zero — a
 *     catastrophic regression even for a stale clone of master).
 *
 * Records the row count + a small sample of titles so a human can eyeball
 * triage without re-running the tool.
 */

import { mcpCallOrThrow } from "../lib/mcp-call.mjs"

/**
 * @param {{ baseUrl: string, bearer?: string }} args
 */
export default async function probe({ baseUrl, bearer }) {
    if (!bearer) {
        throw new Error(
            "list-setlists: bearer required (pass --bearer=$MCP_BEARER to probe-batch / npm run stress)",
        )
    }
    const payload = await mcpCallOrThrow({
        baseUrl,
        bearer,
        tool: "list_setlists",
        args: {},
    })

    // list_setlists returns `{ setlists: [...] }` (verified via `get_song`
    // companion shape) OR a bare array depending on the path. Accept either
    // and fail loud if neither.
    const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.setlists)
          ? payload.setlists
          : null
    if (!Array.isArray(rows)) {
        throw new Error(
            `list-setlists: payload is neither an array nor { setlists: [...] }; keys=${Object.keys(payload ?? {}).join(",")}`,
        )
    }
    if (rows.length === 0) {
        throw new Error(
            "list-setlists: prod catalog returned 0 setlists. Catastrophic regression or auth-scope drift (does the test bearer's uid have list visibility?).",
        )
    }

    return {
        rowCount: rows.length,
        sampleTitles: rows.slice(0, 5).map((r) => r?.title ?? r?.id ?? "(no title)"),
    }
}
