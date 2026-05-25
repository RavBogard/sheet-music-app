#!/usr/bin/env node
/**
 * supervisor-prod-bearer.mjs (v1)
 *
 * The supervisor + auditor Claude sessions need a root MCP bearer to probe
 * deployed surface for cowork pre-flight (`.coord/SUPERVISOR.md §"Cowork prompt
 * pre-flight"`). Every `/clear` wipes the bearer from conversation context and
 * Daniel has had to re-paste a fresh one — every cycle. The MCP root bearer is
 * actually long-lived (Daniel mints it, default 7d TTL); what gets lost on
 * `/clear` is the supervisor's in-context COPY of it, not the credential
 * itself. So:
 *
 *  1. Daniel keeps the live root bearer in `sheet-music-app/.env.local` under
 *     `SUPERVISOR_PROD_BEARER=crl_live_*` (gitignored).
 *  2. Every supervisor / auditor session, on first action, sources this helper:
 *
 *       BEARER=$(node scripts/supervisor-prod-bearer.mjs)
 *
 *     Bash captures the bearer on stdout, the helper logs diagnostics on
 *     stderr, and the next prod probe uses `Authorization: Bearer $BEARER`.
 *
 *  3. The helper first verifies the bearer is healthy by calling
 *     `list_minted_bearers` on the live MCP endpoint. If the bearer is
 *     revoked / expired / network-broken / missing, it exits with a non-zero
 *     code AND a one-line stderr message explaining exactly what Daniel
 *     needs to do.
 *
 * v1 contract (intentionally narrow per supervisor dispatch
 * `msg-supervisor-bearer-persistence-001` 2026-05-26T01:50Z):
 *
 *   - READ-only on `.env.local`. No filesystem mutation. No bearer rotation.
 *   - No child-bearer minting. Future v1.1 may auto-mint a short-TTL child
 *     and persist it to limit root-bearer exposure, but v1 just echoes the
 *     root bearer to stdout once the health probe passes.
 *   - The raw bearer is written to stdout WITHOUT a trailing newline so
 *     `BEARER=$(node ...)` captures the value exactly as minted.
 *
 * Exit codes:
 *   0  — healthy bearer; written to stdout.
 *   2  — `.env.local` unreadable OR `SUPERVISOR_PROD_BEARER` missing /
 *        malformed (no `crl_live_` prefix). Ask Daniel to mint + paste.
 *   3  — bearer rejected by the live MCP route (HTTP 401 OR rich-envelope
 *        refusal). Ask Daniel for a fresh root.
 *   4  — network error / unexpected HTTP / unparseable response.
 *
 * Anti-leak rule (per dispatch §"Out of scope"): the bearer is NEVER written
 * to stderr, NEVER logged, NEVER captured in Sentry. Stdout is the single
 * exit channel for the secret. Diagnostics on stderr describe what happened
 * but never include the bearer text.
 */

import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DEFAULT_ENDPOINT = "https://www.centralreform.live/api/mcp"
const DEFAULT_ENV_FILE = resolve(__dirname, "..", ".env.local")
const ENV_KEY = "SUPERVISOR_PROD_BEARER"
const BEARER_PREFIX = "crl_live_"

export const EXIT_CODES = Object.freeze({
    OK: 0,
    MISSING_ENV: 2,
    REVOKED: 3,
    NETWORK: 4,
})

/**
 * Parse a `.env`-style file body. Minimal subset — KEY=VALUE per line,
 * `#`-prefixed comments + blank lines ignored, paired surrounding `"` or `'`
 * stripped. No multi-line values, no `$VAR` substitution (dotenv-like behavior
 * isn't needed for a single opaque token).
 */
export function parseEnvText(text) {
    const out = Object.create(null)
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const eq = line.indexOf("=")
        if (eq < 0) continue
        const key = line.slice(0, eq).trim()
        let val = line.slice(eq + 1).trim()
        if (
            val.length >= 2 &&
            ((val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'")))
        ) {
            val = val.slice(1, -1)
        }
        out[key] = val
    }
    return out
}

/**
 * Decode an MCP `/api/mcp` response body. The MCP HTTP transport ships either
 * `application/json` (single envelope) or `text/event-stream` (one or more
 * `data:`-prefixed JSON-RPC envelopes); we want the last one in either case.
 * Returns the parsed envelope, or `null` on parse failure.
 */
export function parseMcpResponse(contentType, bodyText) {
    const ct = String(contentType || "")
    const text = String(bodyText || "")
    if (ct.includes("text/event-stream")) {
        const objs = text
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => {
                try {
                    return JSON.parse(l.slice(5).trim())
                } catch {
                    return null
                }
            })
            .filter(Boolean)
        return objs.length === 0 ? null : objs[objs.length - 1]
    }
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

/**
 * Read the bearer from `.env.local`. Returns `{ bearer }` on success or
 * `{ error, exitCode }` on failure. `opts.readFile` is dependency-injected
 * for tests.
 */
export async function readBearerFromEnv(envPath, opts = {}) {
    const reader = opts.readFile ?? readFile
    let text
    try {
        text = await reader(envPath, "utf8")
    } catch (err) {
        const msg = err && err.message ? err.message : String(err)
        return {
            error: `Cannot read ${envPath}: ${msg}. Ask Daniel to mint a root bearer (mcp__claude_ai_CRC_Music__mint_admin_bearer or web /admin) + paste it into ${envPath} as ${ENV_KEY}=crl_live_..., then re-run.`,
            exitCode: EXIT_CODES.MISSING_ENV,
        }
    }
    const env = parseEnvText(text)
    const bearer = env[ENV_KEY]
    if (typeof bearer !== "string" || !bearer.startsWith(BEARER_PREFIX)) {
        return {
            error: `No ${ENV_KEY} in ${envPath} — ask Daniel to mint one + paste it (must start with ${BEARER_PREFIX}), then re-run.`,
            exitCode: EXIT_CODES.MISSING_ENV,
        }
    }
    return { bearer }
}

/**
 * Probe the bearer via `list_minted_bearers`. Returns `{ healthy: true }` on
 * pass or `{ error, exitCode }` on failure. `opts.fetch` is dependency-injected
 * for tests. `opts.endpoint` overrides the production MCP URL.
 *
 * Three outcome buckets (per dispatch §1 step 2):
 *   - HTTP 200 + `result.isError !== true`           → healthy
 *   - HTTP 401 OR `result.isError === true`          → bearer revoked (exit 3)
 *   - everything else (network throw, !=200, !=401)  → network error (exit 4)
 */
export async function probeBearer(bearer, opts = {}) {
    const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT
    const fetchFn = opts.fetch ?? globalThis.fetch
    if (typeof fetchFn !== "function") {
        return {
            error: "global fetch is unavailable (need Node 18+) and no opts.fetch was supplied",
            exitCode: EXIT_CODES.NETWORK,
        }
    }

    let res
    try {
        res = await fetchFn(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${bearer}`,
                Accept: "application/json, text/event-stream",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name: "list_minted_bearers", arguments: {} },
            }),
        })
    } catch (err) {
        const msg = err && err.message ? err.message : String(err)
        return {
            error: `Network error contacting ${endpoint}: ${msg}`,
            exitCode: EXIT_CODES.NETWORK,
        }
    }

    const contentType =
        (res && res.headers && typeof res.headers.get === "function"
            ? res.headers.get("content-type")
            : null) || ""
    const text = typeof res.text === "function" ? await res.text() : ""

    if (res.status === 401) {
        return {
            error: `Root bearer rejected by ${endpoint} (HTTP 401) — ask Daniel to mint a fresh root bearer + paste into .env.local as ${ENV_KEY}=crl_live_..., then re-run.`,
            exitCode: EXIT_CODES.REVOKED,
        }
    }
    if (res.status !== 200) {
        return {
            error: `Unexpected HTTP ${res.status} from ${endpoint}: ${text.slice(0, 400)}`,
            exitCode: EXIT_CODES.NETWORK,
        }
    }

    const parsed = parseMcpResponse(contentType, text)
    if (!parsed) {
        return {
            error: `Could not parse MCP response from ${endpoint} (content-type=${contentType}): ${text.slice(0, 200)}`,
            exitCode: EXIT_CODES.NETWORK,
        }
    }
    if (parsed.error) {
        return {
            error: `JSON-RPC error from ${endpoint}: ${JSON.stringify(parsed.error)}`,
            exitCode: EXIT_CODES.NETWORK,
        }
    }
    const result = parsed.result
    if (!result || result.isError === true) {
        const detail = JSON.stringify(result?.content ?? result ?? null).slice(0, 400)
        return {
            error: `MCP refused list_minted_bearers (bearer likely revoked or wrong-role): ${detail} — ask Daniel to mint a fresh root bearer + paste into .env.local, then re-run.`,
            exitCode: EXIT_CODES.REVOKED,
        }
    }
    return { healthy: true }
}

/**
 * Entrypoint. Returns the resolved exit code. `opts` injects test doubles
 * (stdout/stderr streams, fetch, readFile, envPath).
 *
 * Stdout contract: ON SUCCESS, exactly the bearer string is written — no
 * trailing newline, no extra characters. Bash `$()` strips trailing newlines
 * anyway, but PowerShell `$(node ...)` callers do too — keeping the contract
 * tight removes ambiguity if a non-bash shell ever wraps this.
 */
export async function main(opts = {}) {
    const stdout = opts.stdout ?? process.stdout
    const stderr = opts.stderr ?? process.stderr
    const envPath = opts.envPath ?? DEFAULT_ENV_FILE

    const readResult = await readBearerFromEnv(envPath, opts)
    if ("error" in readResult) {
        stderr.write(`${readResult.error}\n`)
        return readResult.exitCode
    }
    const probeResult = await probeBearer(readResult.bearer, opts)
    if ("error" in probeResult) {
        stderr.write(`${probeResult.error}\n`)
        return probeResult.exitCode
    }
    stdout.write(readResult.bearer)
    return EXIT_CODES.OK
}

// CLI dispatch — only runs when invoked directly, not when imported by tests.
//
// We deliberately set `process.exitCode` rather than calling `process.exit()`:
// Node 24 on Windows ships a libuv regression where calling `process.exit()`
// while undici's global HTTPS Agent still has keep-alive sockets in its pool
// triggers `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exits
// with a libuv-assigned 127 instead of our intended code (observed against
// `https://www.centralreform.live/api/mcp`). Setting exitCode and letting the
// event loop drain naturally lets undici close its sockets cleanly, which is
// what `BEARER=$(node scripts/supervisor-prod-bearer.mjs)` callers depend on
// for a real exit-0. See Node #56432.
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main()
        .then((code) => {
            process.exitCode = code
        })
        .catch((err) => {
            process.stderr.write(
                `Unexpected error: ${err && err.stack ? err.stack : String(err)}\n`,
            )
            process.exitCode = EXIT_CODES.NETWORK
        })
}
