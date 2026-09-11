#!/usr/bin/env node
/**
 * upload-batch.mjs — the CLI courier for batch chart intake.
 *
 * The drop zone is the surface Daniel uses from Claude Desktop. This is the
 * same pipeline driven from a terminal (Claude Code on Windows, or by hand)
 * when the files are already on disk and there is no iframe: it opens a batch
 * over MCP, mints signed upload URLs, PUTs the bytes STRAIGHT to storage,
 * commits, and then watches the batch until the importer is done.
 *
 * The bytes never pass through the MCP server and never through a model — the
 * signed URL is handed back as metadata and this process is the only thing that
 * ever reads a chart file.
 *
 *     node scripts/upload-batch.mjs <path>... \
 *       [--collection core|supplemental|uploads|nava] \
 *       [--bearer TOKEN] [--endpoint https://www.centralreform.live/api/mcp] \
 *       [--dry-run]
 *
 * A <path> may be a file or a directory; a directory is expanded ONE level
 * (no recursion — a chart tree is flat, and silently walking a deep tree is
 * how you upload someone's whole Downloads folder).
 *
 *     node scripts/upload-batch.mjs --dry-run e2e/fixtures
 *
 * `--dry-run` resolves and prints the plan — which files would upload, with
 * what mime, and which are rejected and why — and makes NO network calls.
 *
 * Bearer resolution, in order: `--bearer`, `MCP_BEARER` in the environment,
 * `SUPERVISOR_PROD_BEARER` in `.env.local`.
 *
 * Exit codes:
 *   0 — every file imported, parked or skipped; nothing failed.
 *   1 — at least one item failed (or the run could not complete).
 *   2 — bad invocation: no paths, no bearer, nothing acceptable to upload.
 */

import { readFile, readdir, stat } from "node:fs/promises"
import { resolve, dirname, join, basename } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ENV_FILE = resolve(__dirname, "..", ".env.local")
const DEFAULT_ENDPOINT = "https://www.centralreform.live/api/mcp"

/** Max files per `request_batch_upload_urls` call — the tool's own cap. */
const URL_GROUP_SIZE = 50
/** Concurrent PUTs. Three is enough to hide latency without saturating a home link. */
const PUT_CONCURRENCY = 3
/** Poll cadence while the importer works. */
const POLL_INTERVAL_MS = 3000
/** Give up watching after this long — the batch keeps importing server-side. */
const POLL_TIMEOUT_MS = 15 * 60 * 1000
/** `MAX_ITEM_BYTES` in src/lib/intake/batch-types.ts. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

/**
 * Extension → mime.
 *
 * SOURCE OF TRUTH: `src/lib/library/chart-file-types.ts` (`CHART_EXT_TO_MIME`).
 * Duplicated here because this file is plain `.mjs` run by bare `node` with no
 * TypeScript loader in the path. If the table there changes, change it here —
 * the server re-validates every file anyway, so a stale copy here shows up as
 * a `rejected` row from `request_batch_upload_urls`, not as a bad import.
 */
export const EXT_TO_MIME = Object.freeze({
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".xml": "application/xml",
    ".musicxml": "application/vnd.recordare.musicxml+xml",
    ".mxl": "application/vnd.recordare.musicxml",
    ".mscz": "application/x-musescore",
    ".mscx": "application/x-musescore+xml",
    ".txt": "text/plain",
})

export const EXIT_CODES = Object.freeze({
    OK: 0,
    FAILED_ITEMS: 1,
    BAD_INVOCATION: 2,
})

/** Lowercase extension including the dot; "" when there is none. */
export function extOf(fileName) {
    const lower = String(fileName).toLowerCase()
    const idx = lower.lastIndexOf(".")
    if (idx <= 0) return ""
    return lower.slice(idx)
}

// ─── planning ────────────────────────────────────────────────────────────────

/**
 * Turn the paths given on the command line into an upload plan.
 *
 * Directories expand one level (files only — a nested directory is ignored,
 * not descended into). Every resulting file lands in exactly one of:
 *
 *   accepted — `{ path, baseName, fileName, mimeType, sizeBytes }`
 *   rejected — `{ path, baseName, fileName, reason }` where reason is one of
 *              `not_found`, `unsupported_type`, `too_large`, `empty`
 *
 * `baseName` is what the file is actually called on disk. `fileName` is what we
 * send to the server, and it is made UNIQUE across the accepted set: two charts
 * called `Adon Olam.pdf` in two different folders become `Adon Olam.pdf` and
 * `Adon Olam (2).pdf`. That matters for correctness, not tidiness — the server
 * echoes `fileName` back on every minted item and on every rejection, and it is
 * the only handle we have for checking that a signed URL belongs to the file we
 * are about to read. Duplicate names make that check meaningless and can send
 * one file's bytes to another file's URL.
 *
 * Reads the filesystem for sizes but writes nothing and talks to nothing; the
 * unit test drives it straight against `e2e/fixtures`.
 */
export async function planFiles(paths) {
    const accepted = []
    const rejected = []
    /** Lowercased upload names already handed out, for collision suffixing. */
    const taken = new Set()

    /** `Adon Olam.pdf` → `Adon Olam (2).pdf` → `Adon Olam (3).pdf` … */
    function uniqueName(baseName) {
        if (!taken.has(baseName.toLowerCase())) {
            taken.add(baseName.toLowerCase())
            return baseName
        }
        const ext = extOf(baseName)
        const stem = ext ? baseName.slice(0, baseName.length - ext.length) : baseName
        for (let n = 2; ; n += 1) {
            const candidate = `${stem} (${n})${ext}`
            if (!taken.has(candidate.toLowerCase())) {
                taken.add(candidate.toLowerCase())
                return candidate
            }
        }
    }

    /** Classify one concrete file path. */
    async function classify(filePath, sizeBytes) {
        const baseName = basename(filePath)
        const mimeType = EXT_TO_MIME[extOf(baseName)]
        if (!mimeType) {
            rejected.push({
                path: filePath,
                baseName,
                fileName: baseName,
                reason: "unsupported_type",
            })
            return
        }
        if (sizeBytes === 0) {
            rejected.push({ path: filePath, baseName, fileName: baseName, reason: "empty" })
            return
        }
        if (sizeBytes > MAX_FILE_BYTES) {
            rejected.push({
                path: filePath,
                baseName,
                fileName: baseName,
                reason: "too_large",
            })
            return
        }
        // Only accepted files consume an upload name — a rejected file is never
        // sent, so it must not push its siblings' names along.
        accepted.push({
            path: filePath,
            baseName,
            fileName: uniqueName(baseName),
            mimeType,
            sizeBytes,
        })
    }

    for (const raw of paths ?? []) {
        const p = resolve(String(raw))
        let info
        try {
            info = await stat(p)
        } catch {
            rejected.push({
                path: p,
                baseName: basename(p),
                fileName: basename(p),
                reason: "not_found",
            })
            continue
        }

        if (info.isDirectory()) {
            const entries = await readdir(p, { withFileTypes: true })
            for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
                if (!entry.isFile()) continue
                // Dotfiles in an expanded directory are housekeeping (.gitattributes,
                // .DS_Store), never charts — skipping them keeps the rejected list
                // about the user's actual files. A dotfile named explicitly on the
                // command line still gets classified.
                if (entry.name.startsWith(".")) continue
                const child = join(p, entry.name)
                const childInfo = await stat(child)
                await classify(child, childInfo.size)
            }
            continue
        }

        await classify(p, info.size)
    }

    return { accepted, rejected }
}

/**
 * Pair each minted upload URL with the local file it belongs to.
 *
 * `request_batch_upload_urls` walks `files` IN ORDER and pushes each entry to
 * exactly one of `items` (minted) or `rejected` — see `requestBatchUploadUrls`
 * in src/lib/mcp/tools/batch-intake.ts. So both arrays preserve request order
 * over their own subset, and replaying the request in order against the two
 * queues reconstructs the mapping exactly.
 *
 * Matching by name alone is what this replaces: two files called `Adon Olam.pdf`
 * in different folders would both resolve to the first entry, and one signed URL
 * would receive the other file's bytes. `planFiles` now guarantees unique
 * `fileName`s, so the echoed name is a genuine cross-check on the replay rather
 * than the mechanism — if the server ever reordered, this throws instead of
 * uploading the wrong bytes.
 *
 * Returns `[{ item, planned }]` for the minted entries, in request order.
 */
export function zipMintedItems(group, mintedItems, rejectedRows) {
    const minted = [...(mintedItems ?? [])]
    const rejected = [...(rejectedRows ?? [])]
    const pairs = []

    for (const planned of group) {
        if (rejected.length > 0 && rejected[0]?.fileName === planned.fileName) {
            rejected.shift()
            continue
        }
        const item = minted.shift()
        if (!item) {
            throw new Error(
                `request_batch_upload_urls returned fewer items than files (ran out at ${planned.fileName}) — refusing to upload rather than risk sending a file to the wrong URL.`,
            )
        }
        if (item.fileName !== planned.fileName) {
            throw new Error(
                `request_batch_upload_urls returned items out of order (expected ${planned.fileName}, got ${item.fileName}) — refusing to upload rather than risk sending a file to the wrong URL.`,
            )
        }
        pairs.push({ item, planned })
    }

    if (minted.length > 0) {
        throw new Error(
            `request_batch_upload_urls returned ${minted.length} item(s) more than were requested — refusing to upload.`,
        )
    }
    return pairs
}

// ─── argv ────────────────────────────────────────────────────────────────────

/** Parse the command line into `{ paths, collection, bearer, endpoint, dryRun }`. */
export function parseArgs(argv) {
    const out = {
        paths: [],
        collection: undefined,
        bearer: undefined,
        endpoint: DEFAULT_ENDPOINT,
        dryRun: false,
    }
    const args = [...(argv ?? [])]
    while (args.length > 0) {
        const arg = args.shift()
        if (arg === "--dry-run") out.dryRun = true
        else if (arg === "--collection") out.collection = args.shift()
        else if (arg === "--bearer") out.bearer = args.shift()
        else if (arg === "--endpoint") out.endpoint = args.shift() ?? DEFAULT_ENDPOINT
        else if (arg?.startsWith("--collection=")) out.collection = arg.slice(13)
        else if (arg?.startsWith("--bearer=")) out.bearer = arg.slice(9)
        else if (arg?.startsWith("--endpoint=")) out.endpoint = arg.slice(11)
        else if (arg) out.paths.push(arg)
    }
    return out
}

/** Minimal `.env`-style parser: KEY=VALUE, `#` comments, paired quotes stripped. */
export function parseEnvText(text) {
    const out = Object.create(null)
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const eq = line.indexOf("=")
        if (eq < 0) continue
        const key = line.slice(0, eq).trim()
        let val = line.slice(eq + 1).trim()
        const quoted =
            val.length >= 2 &&
            ((val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'")))
        if (quoted) val = val.slice(1, -1)
        out[key] = val
    }
    return out
}

/** `--bearer` → `MCP_BEARER` → `SUPERVISOR_PROD_BEARER` in `.env.local`. */
export async function resolveBearer(flagBearer, opts = {}) {
    if (flagBearer) return flagBearer
    const env = opts.env ?? process.env
    if (env.MCP_BEARER) return env.MCP_BEARER
    const reader = opts.readFile ?? readFile
    try {
        const text = await reader(opts.envPath ?? DEFAULT_ENV_FILE, "utf8")
        return parseEnvText(text).SUPERVISOR_PROD_BEARER
    } catch {
        return undefined
    }
}

// ─── MCP transport ───────────────────────────────────────────────────────────

/**
 * Decode an `/api/mcp` response body — `application/json` (one envelope) or
 * `text/event-stream` (one or more `data:` lines; the last one wins). Same
 * shape as scripts/supervisor-prod-bearer.mjs.
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
 * An MCP tool result carries its payload as JSON in `content[0].text` (and,
 * for the batch tools, again as `structuredContent`). Prefer the structured
 * copy; fall back to parsing the text block.
 */
export function unwrapToolResult(result) {
    if (!result) return null
    if (result.structuredContent) return result.structuredContent
    const text = result.content?.find((c) => c?.type === "text")?.text
    if (typeof text !== "string") return null
    try {
        return JSON.parse(text)
    } catch {
        return { ok: false, error: { message: text } }
    }
}

/** A single JSON-RPC session against the MCP endpoint. */
export class McpSession {
    constructor(endpoint, bearer, fetchFn) {
        this.endpoint = endpoint
        this.bearer = bearer
        this.fetch = fetchFn ?? globalThis.fetch
        this.sessionId = undefined
        this.nextId = 1
    }

    async rpc(method, params) {
        const headers = {
            Authorization: `Bearer ${this.bearer}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        if (this.sessionId) headers["mcp-session-id"] = this.sessionId

        const res = await this.fetch(this.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: this.nextId++,
                method,
                params,
            }),
        })

        const sid = res.headers?.get?.("mcp-session-id")
        if (sid) this.sessionId = sid

        const contentType = res.headers?.get?.("content-type") ?? ""
        const text = typeof res.text === "function" ? await res.text() : ""
        if (res.status !== 200) {
            throw new Error(`HTTP ${res.status} from ${this.endpoint}: ${text.slice(0, 300)}`)
        }
        const envelope = parseMcpResponse(contentType, text)
        if (!envelope) {
            throw new Error(`Unparseable MCP response (${contentType}): ${text.slice(0, 200)}`)
        }
        if (envelope.error) {
            throw new Error(`JSON-RPC error: ${JSON.stringify(envelope.error)}`)
        }
        return envelope.result
    }

    /**
     * Fire-and-forget JSON-RPC notification — no `id`, so there is no response
     * to wait on. A notification answers 202 with an empty body on a compliant
     * transport, and anything else is not worth failing the run over.
     */
    async notify(method, params) {
        const headers = {
            Authorization: `Bearer ${this.bearer}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        if (this.sessionId) headers["mcp-session-id"] = this.sessionId
        try {
            await this.fetch(this.endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({ jsonrpc: "2.0", method, params }),
            })
        } catch {
            // Deliberately swallowed — see the doc comment.
        }
    }

    async initialize() {
        await this.rpc("initialize", {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "upload-batch.mjs", version: "1" },
        })
        // The handshake is not complete until the client acknowledges it. Our
        // own transport does not insist, but a stricter one refuses every later
        // `tools/call` on a session that never sent this.
        await this.notify("notifications/initialized", {})
    }

    /** Call a tool and return its unwrapped payload; throws on a refusal. */
    async call(name, args) {
        const result = await this.rpc("tools/call", { name, arguments: args })
        const payload = unwrapToolResult(result)
        if (result?.isError || payload?.ok === false) {
            const message =
                payload?.error?.message ?? JSON.stringify(payload ?? result).slice(0, 400)
            // Rich envelopes carry a top-level `hint` saying what to do next
            // (e.g. "a cron retries the queue every 10 minutes") — the single
            // most useful sentence in the whole refusal, so never drop it.
            const hint = payload?.hint
            throw new Error(`${name} refused: ${message}${hint ? ` — ${hint}` : ""}`)
        }
        return payload
    }
}

// ─── output ──────────────────────────────────────────────────────────────────

/** Fixed-width table: `[["file","status","detail"], ...]`. */
export function renderTable(rows) {
    if (rows.length === 0) return ""
    const widths = rows[0].map((_, col) =>
        Math.max(...rows.map((r) => String(r[col] ?? "").length)),
    )
    return rows
        .map((r) =>
            r
                .map((cell, col) =>
                    col === r.length - 1
                        ? String(cell ?? "")
                        : String(cell ?? "").padEnd(widths[col]),
                )
                .join("  ")
                .trimEnd(),
        )
        .join("\n")
}

function chunk(list, size) {
    const out = []
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
    return out
}

/** Run `worker` over `items`, at most `limit` in flight. */
async function mapConcurrent(items, limit, worker) {
    const results = new Array(items.length)
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const i = cursor++
            if (i >= items.length) return
            results[i] = await worker(items[i], i)
        }
    })
    await Promise.all(runners)
    return results
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── main ────────────────────────────────────────────────────────────────────

export async function main(argv = []) {
    const stdout = { write: (s) => process.stdout.write(s) }
    const stderr = { write: (s) => process.stderr.write(s) }
    const opts = parseArgs(argv)

    if (opts.paths.length === 0) {
        stderr.write(
            "Usage: node scripts/upload-batch.mjs <path>... [--collection uploads] [--bearer TOKEN] [--endpoint URL] [--dry-run]\n",
        )
        return EXIT_CODES.BAD_INVOCATION
    }

    const plan = await planFiles(opts.paths)

    stdout.write(
        `plan: ${plan.accepted.length} accepted, ${plan.rejected.length} rejected\n`,
    )
    const planRows = [["file", "status", "detail"]]
    for (const f of plan.accepted) {
        // Say so when a name collision renamed the upload, or the table would
        // claim a file is called something it is not called on disk.
        const renamed = f.fileName === f.baseName ? "" : ` — uploads as ${f.fileName}`
        planRows.push([
            f.baseName,
            "accepted",
            `${f.mimeType} (${f.sizeBytes} bytes)${renamed}`,
        ])
    }
    for (const f of plan.rejected) {
        planRows.push([f.baseName, "rejected", f.reason])
    }
    stdout.write(`${renderTable(planRows)}\n`)

    if (opts.dryRun) {
        stdout.write("\nDRY RUN — no network calls made, nothing uploaded.\n")
        return EXIT_CODES.OK
    }

    if (plan.accepted.length === 0) {
        stderr.write("Nothing to upload.\n")
        return EXIT_CODES.BAD_INVOCATION
    }

    const bearer = await resolveBearer(opts.bearer)
    if (!bearer) {
        stderr.write(
            "No MCP bearer. Pass --bearer, set MCP_BEARER, or put SUPERVISOR_PROD_BEARER in .env.local.\n",
        )
        return EXIT_CODES.BAD_INVOCATION
    }

    const session = new McpSession(opts.endpoint, bearer)
    try {
        await session.initialize()

        const opened = await session.call("open_chart_dropzone", {
            source: "cli",
            ...(opts.collection ? { collection: opts.collection } : {}),
        })
        const batchId = opened.batchId
        stdout.write(`batch ${batchId} open (endpoint ${opts.endpoint})\n`)

        // ─── mint URLs, 50 files per call ────────────────────────────────
        const uploads = []
        const serverRejected = []
        for (const group of chunk(plan.accepted, URL_GROUP_SIZE)) {
            const minted = await session.call("request_batch_upload_urls", {
                batchId,
                files: group.map((f) => ({
                    fileName: f.fileName,
                    mimeType: f.mimeType,
                    sizeBytes: f.sizeBytes,
                })),
            })
            // Positional replay, not a name lookup — see zipMintedItems.
            for (const pair of zipMintedItems(group, minted.items, minted.rejected)) {
                uploads.push(pair)
            }
            for (const r of minted.rejected ?? []) serverRejected.push(r)
        }

        for (const r of serverRejected) {
            stderr.write(`rejected by server: ${r.fileName} — ${r.reason ?? "unknown"}\n`)
        }

        // ─── PUT the bytes, 3 at a time ──────────────────────────────────
        //
        // A failed PUT is NOT its own outcome: the item keeps its
        // `awaiting-bytes` status, and commit turns that into a real
        // `failed` / `bytes_missing` row on the server. So we record the HTTP
        // detail against the itemId and later fold it into that one row —
        // reporting it separately would show the same file twice and count it
        // twice.
        /** itemId → the PUT's HTTP detail, for rows that come back failed. */
        const putFailures = new Map()
        await mapConcurrent(uploads, PUT_CONCURRENCY, async ({ item, planned }) => {
            const body = await readFile(planned.path)
            const res = await fetch(item.uploadUrl, {
                method: item.method ?? "PUT",
                headers: item.requiredHeaders ?? { "Content-Type": planned.mimeType },
                body,
            })
            if (!res.ok) {
                const text = await res.text().catch(() => "")
                putFailures.set(item.itemId, `PUT ${res.status} ${text.slice(0, 120)}`)
                stderr.write(`upload failed: ${planned.fileName} — PUT ${res.status}\n`)
                return
            }
            stdout.write(`uploaded ${planned.fileName}\n`)
        })

        // ─── commit and watch ────────────────────────────────────────────
        const committed = await session.call("commit_upload_batch", { batchId })
        stdout.write(
            `committed ${batchId} (queued: ${committed.queued === true})\n`,
        )

        const deadline = Date.now() + POLL_TIMEOUT_MS
        let batch = committed
        for (;;) {
            await sleep(POLL_INTERVAL_MS)
            batch = await session.call("get_upload_batch", {
                batchId,
                includeItems: "all",
            })
            if (batch.status === "done" || batch.status === "expired") break
            if (Date.now() > deadline) {
                stderr.write(
                    `Still ${batch.status} after ${Math.round(POLL_TIMEOUT_MS / 60000)} min — the importer keeps going server-side. Re-check with get_upload_batch ${batchId}.\n`,
                )
                break
            }
        }

        // ─── report ──────────────────────────────────────────────────────
        const rows = [["file", "status", "detail"]]
        /** itemIds the server reported as failed, so PUT detail is not double-counted. */
        const serverFailedItemIds = new Set()
        for (const item of batch.items ?? []) {
            let detail = ""
            if (item.status === "imported") detail = item.resultFileId ?? ""
            else if (item.status === "parked")
                detail = `${item.parked?.reason ?? "duplicate"} → ${item.parked?.matchedTitle ?? item.parked?.matchedFileId ?? ""}`
            else if (item.status === "failed") {
                serverFailedItemIds.add(item.itemId)
                detail = `${item.error?.code ?? "error"}: ${item.error?.message ?? ""}`
                // The server can only say "no bytes arrived". We know WHY.
                const put = putFailures.get(item.itemId)
                if (put) detail = `${detail} (${put})`
            }
            rows.push([item.fileName, item.status, detail])
        }
        // A PUT failure the server did NOT turn into a failed row (commit never
        // ran, or the batch was already sealed) still has to be reported — once.
        for (const [itemId, detail] of putFailures) {
            if (serverFailedItemIds.has(itemId)) continue
            const planned = uploads.find((u) => u.item.itemId === itemId)?.planned
            rows.push([planned?.fileName ?? itemId, "failed", detail])
        }
        for (const r of serverRejected)
            rows.push([r.fileName, "rejected", r.reason ?? "unknown"])
        for (const f of plan.rejected) rows.push([f.baseName, "rejected", f.reason])

        stdout.write(`\n${renderTable(rows)}\n`)
        const counts = batch.counts ?? {}
        stdout.write(
            `\n${batchId}: ${counts.imported ?? 0} imported, ${counts.parked ?? 0} parked, ${counts.failed ?? 0} failed, ${counts.skipped ?? 0} skipped\n`,
        )
        if ((counts.parked ?? 0) > 0) {
            stdout.write(
                "Parked items need a decision — ask Claude to resolve them, or call resolve_upload_item.\n",
            )
        }

        // Every PUT failure the server owns is already inside `counts.failed`;
        // only the ones it never saw are added, so nothing is counted twice.
        const unreportedPutFailures = [...putFailures.keys()].filter(
            (id) => !serverFailedItemIds.has(id),
        ).length
        const failed = (counts.failed ?? 0) + unreportedPutFailures
        return failed === 0 ? EXIT_CODES.OK : EXIT_CODES.FAILED_ITEMS
    } catch (err) {
        stderr.write(`${err?.message ?? String(err)}\n`)
        return EXIT_CODES.FAILED_ITEMS
    }
}

// CLI dispatch — only when invoked directly, never on import.
// `process.exitCode` rather than `process.exit()`: see the note in
// scripts/supervisor-prod-bearer.mjs about Node 24 + undici keep-alive sockets
// on Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code
        })
        .catch((err) => {
            process.stderr.write(`Unexpected error: ${err?.stack ?? String(err)}\n`)
            process.exitCode = EXIT_CODES.FAILED_ITEMS
        })
}
