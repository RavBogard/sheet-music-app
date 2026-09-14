#!/usr/bin/env node
/**
 * mint-setlist-reader.mjs (v1)
 *
 * Mint ONE long-lived, read-only `setlist_reader` credential against the live
 * MCP endpoint, host-side, and emit the raw bearer on stdout.
 *
 * Usage:
 *
 *   node scripts/mint-setlist-reader.mjs --purpose "crc overlays setlist import"
 *   node scripts/mint-setlist-reader.mjs --purpose "..." --dry-run
 *
 * The root bearer comes from `sheet-music-app/.env.local` under
 * `SUPERVISOR_PROD_BEARER` (gitignored) — the same key + parser
 * `supervisor-prod-bearer.mjs` uses; `parseEnvText` is imported from there
 * rather than re-implemented.
 *
 * Anti-leak rule (same contract as supervisor-prod-bearer.mjs): the minted
 * bearer is written to STDOUT ONLY, with no trailing newline, and never to
 * stderr, never to a file, never to a log. Diagnostics (tokenId, purpose,
 * allowedTools) go to stderr and never include either bearer.
 *
 * Exit codes:
 *   0  — credential minted; raw bearer written to stdout.
 *   2  — `.env.local` unreadable OR SUPERVISOR_PROD_BEARER missing/malformed,
 *        or `--purpose` missing/too short.
 *   3  — refused by the live MCP route (HTTP 401 or a rich-envelope refusal).
 *   4  — network error / unexpected HTTP / unparseable response.
 */

import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { parseEnvText } from "./supervisor-prod-bearer.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DEFAULT_ENDPOINT = "https://www.centralreform.live/api/mcp"
const DEFAULT_ENV_FILE = resolve(__dirname, "..", ".env.local")
const ENV_KEY = "SUPERVISOR_PROD_BEARER"
const ROOT_BEARER_PREFIX = "crl_live_"
const TOOL_NAME = "mint_setlist_reader_bearer"
const MIN_PURPOSE_LEN = 8

export const EXIT_CODES = Object.freeze({
    OK: 0,
    MISSING_ENV: 2,
    REFUSED: 3,
    NETWORK: 4,
})

/** Parse `--purpose "<text>"` / `--purpose=<text>` / `--dry-run`. */
export function parseArgs(argv) {
    const out = { purpose: "", dryRun: false }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === "--dry-run") out.dryRun = true
        else if (a === "--purpose") out.purpose = String(argv[++i] ?? "")
        else if (a.startsWith("--purpose=")) out.purpose = a.slice("--purpose=".length)
    }
    out.purpose = out.purpose.trim()
    return out
}

/**
 * Decode an MCP `/api/mcp` response body — `application/json` (one envelope)
 * or `text/event-stream` (one or more `data:`-prefixed JSON-RPC envelopes).
 * Returns the LAST envelope, or `null` on parse failure.
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

/** Read the ROOT bearer from `.env.local`. `opts.readFile` is injectable. */
export async function readRootBearer(envPath, opts = {}) {
    const reader = opts.readFile ?? readFile
    let text
    try {
        text = await reader(envPath, "utf8")
    } catch (err) {
        const msg = err && err.message ? err.message : String(err)
        return {
            error: `Cannot read ${envPath}: ${msg}. Ask Daniel to paste a root bearer as ${ENV_KEY}=${ROOT_BEARER_PREFIX}..., then re-run.`,
            exitCode: EXIT_CODES.MISSING_ENV,
        }
    }
    const env = parseEnvText(text)
    const bearer = env[ENV_KEY]
    if (typeof bearer !== "string" || !bearer.startsWith(ROOT_BEARER_PREFIX)) {
        return {
            error: `No usable ${ENV_KEY} in ${envPath} — it must be a root bearer starting with ${ROOT_BEARER_PREFIX}.`,
            exitCode: EXIT_CODES.MISSING_ENV,
        }
    }
    return { bearer }
}

/** The JSON-RPC request body this script sends. */
export function buildRequestBody(purpose) {
    return {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: TOOL_NAME, arguments: { purpose } },
    }
}

/**
 * Pull the tool's JSON payload out of a CallToolResult envelope. Returns the
 * parsed object, or `null` when the shape isn't what we expect.
 */
export function extractToolPayload(envelope) {
    const text = envelope?.result?.content?.[0]?.text
    if (typeof text !== "string") return null
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

/**
 * Entrypoint. Returns the resolved exit code. `opts` injects test doubles
 * (stdout/stderr, fetch, readFile, envPath, endpoint, argv).
 */
export async function main(opts = {}) {
    const stdout = opts.stdout ?? process.stdout
    const stderr = opts.stderr ?? process.stderr
    const envPath = opts.envPath ?? DEFAULT_ENV_FILE
    const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT
    const argv = opts.argv ?? process.argv.slice(2)

    const { purpose, dryRun } = parseArgs(argv)
    if (purpose.length < MIN_PURPOSE_LEN) {
        stderr.write(
            `--purpose is required and must be at least ${MIN_PURPOSE_LEN} characters, e.g. --purpose "crc overlays setlist import".\n`,
        )
        return EXIT_CODES.MISSING_ENV
    }

    const rootResult = await readRootBearer(envPath, opts)
    if ("error" in rootResult) {
        stderr.write(`${rootResult.error}\n`)
        return rootResult.exitCode
    }

    const body = buildRequestBody(purpose)

    if (dryRun) {
        // Validate-only. Print the request WITHOUT the Authorization header —
        // and call nothing.
        stderr.write(
            [
                `DRY RUN — nothing was sent.`,
                `  env:      ${envPath} (${ENV_KEY} present, ${ROOT_BEARER_PREFIX}… — value not shown)`,
                `  endpoint: POST ${endpoint}`,
                `  headers:  Content-Type: application/json; Accept: application/json, text/event-stream; Authorization: <redacted>`,
                `  body:     ${JSON.stringify(body)}`,
                ``,
            ].join("\n"),
        )
        return EXIT_CODES.OK
    }

    const fetchFn = opts.fetch ?? globalThis.fetch
    if (typeof fetchFn !== "function") {
        stderr.write("global fetch is unavailable (need Node 18+) and no opts.fetch was supplied\n")
        return EXIT_CODES.NETWORK
    }

    let res
    try {
        res = await fetchFn(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${rootResult.bearer}`,
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify(body),
        })
    } catch (err) {
        const msg = err && err.message ? err.message : String(err)
        stderr.write(`Network error contacting ${endpoint}: ${msg}\n`)
        return EXIT_CODES.NETWORK
    }

    const contentType =
        (res && res.headers && typeof res.headers.get === "function"
            ? res.headers.get("content-type")
            : null) || ""
    const text = typeof res.text === "function" ? await res.text() : ""

    if (res.status === 401) {
        stderr.write(
            `Root bearer rejected by ${endpoint} (HTTP 401) — ask Daniel for a fresh root bearer in .env.local as ${ENV_KEY}.\n`,
        )
        return EXIT_CODES.REFUSED
    }
    if (res.status !== 200) {
        stderr.write(`Unexpected HTTP ${res.status} from ${endpoint}: ${text.slice(0, 400)}\n`)
        return EXIT_CODES.NETWORK
    }

    const parsed = parseMcpResponse(contentType, text)
    if (!parsed) {
        stderr.write(
            `Could not parse MCP response from ${endpoint} (content-type=${contentType}): ${text.slice(0, 200)}\n`,
        )
        return EXIT_CODES.NETWORK
    }
    if (parsed.error) {
        stderr.write(`JSON-RPC error from ${endpoint}: ${JSON.stringify(parsed.error)}\n`)
        return EXIT_CODES.NETWORK
    }

    const payload = extractToolPayload(parsed)
    if (!payload) {
        stderr.write(
            `Unexpected ${TOOL_NAME} result shape from ${endpoint} — no JSON tool payload found.\n`,
        )
        return EXIT_CODES.NETWORK
    }
    if (payload.ok !== true || typeof payload.bearer !== "string" || !payload.bearer) {
        const machine = payload?.error?.machine_code ?? "unknown"
        const message = payload?.error?.message ?? "no message"
        stderr.write(`${TOOL_NAME} refused (${machine}): ${message}\n`)
        return EXIT_CODES.REFUSED
    }

    // Diagnostics on stderr — never the bearer.
    stderr.write(
        `Minted setlist_reader credential: tokenId=${payload.tokenId} purpose=${JSON.stringify(
            payload.purpose,
        )} allowedTools=${JSON.stringify(payload.allowedTools)}\n`,
    )
    // The secret's single exit channel: stdout, no trailing newline.
    stdout.write(payload.bearer)
    return EXIT_CODES.OK
}

// CLI dispatch — only when invoked directly, not when imported by tests.
//
// `process.exitCode` rather than `process.exit()`: see the Node 24 / undici
// keep-alive note in supervisor-prod-bearer.mjs (Node #56432).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
