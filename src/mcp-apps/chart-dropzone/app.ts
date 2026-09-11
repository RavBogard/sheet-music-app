/**
 * Chart drop-zone — the MCP App rendered inside Claude's sandboxed iframe
 * when `open_chart_dropzone` returns `_meta.ui.resourceUri`.
 *
 * The whole point of this bundle is that FILE BYTES NEVER REACH THE MODEL:
 * the user drops files here, the app mints signed Storage URLs through
 * `request_batch_upload_urls` and PUTs each file straight from the device,
 * then drives commit / poll / resolve through `callServerTool` and hands the
 * model a short text summary via `updateModelContext`.
 *
 * Constraints that shape the code:
 * - Zero server imports. Only pure shared modules (`chart-file-types`) and
 *   TYPE-only imports from `wire-types` — anything else would drag
 *   firebase-admin into a browser bundle.
 * - Zero external URLs (script/style/font/image). The sandbox CSP is
 *   deny-by-default; one external reference renders as a silent blank frame.
 * - `window.__DROPZONE_TEST_HOST__` is the e2e seam: when present it is used
 *   INSTEAD of the real `App`, so Playwright can drive the whole flow without
 *   an MCP host.
 */

import "./styles.css"
import { App } from "@modelcontextprotocol/ext-apps/app-with-deps"
import {
    ACCEPTED_CHART_EXTENSIONS,
    isAcceptedChartFile,
} from "@/lib/library/chart-file-types"
import type {
    AppendChunkResult,
    CommitBatchResult,
    GetBatchResult,
    OpenDropzoneResult,
    RequestUrlsResult,
    ResolveItemResult,
} from "@/lib/intake/wire-types"

/* ------------------------------------------------------------------ host */

/** The bits of an MCP `CallToolResult` this app reads. */
interface ToolResultLike {
    content?: Array<{ type: string; text?: string }>
    structuredContent?: unknown
    isError?: boolean
}

interface ToolCall {
    name: string
    arguments?: Record<string, unknown>
}

/**
 * The host surface the app talks to — satisfied either by the real
 * `@modelcontextprotocol/ext-apps` `App` or by the Playwright test seam.
 */
export interface DropzoneHost {
    onToolResult(cb: (result: ToolResultLike) => void): void
    callServerTool(req: ToolCall): Promise<ToolResultLike>
    updateModelContext(params: {
        content: Array<{ type: "text"; text: string }>
    }): Promise<unknown>
}

declare global {
    interface Window {
        __DROPZONE_TEST_HOST__?: DropzoneHost
    }
}

/** Connect to the real host (or return the injected test seam). */
async function resolveHost(): Promise<DropzoneHost> {
    const seam = window.__DROPZONE_TEST_HOST__
    if (seam) return seam

    // autoResize is opt-IN despite the docs calling it the default: the
    // implementation reads `this.options?.autoResize`, so omitting the options
    // object leaves the host with no size-changed notifications at all.
    const app = new App({ name: "chart-dropzone", version: "1.0.0" }, {}, { autoResize: true })
    let deliver: ((r: ToolResultLike) => void) | null = null
    const buffered: ToolResultLike[] = []
    // Registered BEFORE connect(): the host may push the tool result as soon
    // as the handshake completes, and a late listener would miss it.
    app.ontoolresult = (params) => {
        const result = params as ToolResultLike
        if (deliver) deliver(result)
        else buffered.push(result)
    }
    await app.connect()
    return {
        onToolResult(cb) {
            deliver = cb
            while (buffered.length) cb(buffered.shift() as ToolResultLike)
        },
        callServerTool: (req) =>
            app.callServerTool(req) as unknown as Promise<ToolResultLike>,
        updateModelContext: (params) => app.updateModelContext(params),
    }
}

/** `structuredContent` when the host provides it, else the first text block parsed as JSON. */
function unwrap<T>(result: ToolResultLike | null | undefined): T | null {
    if (!result) return null
    if (result.structuredContent && typeof result.structuredContent === "object") {
        return result.structuredContent as T
    }
    const text = result.content?.find((c) => c.type === "text" && c.text)?.text
    if (!text) return null
    try {
        return JSON.parse(text) as T
    } catch {
        return null
    }
}

/* ----------------------------------------------------------------- state */

type RowStatus =
    | "queued"
    | "rejected"
    | "uploading"
    | "staged"
    | "pending"
    | "imported"
    | "parked"
    | "failed"
    | "skipped"

interface Row {
    rowId: string
    file: File | null
    fileName: string
    sizeBytes: number
    status: RowStatus
    detail: string
    itemId?: string
    title?: string
    parked?: { matchedTitle: string; matchedFileId: string }
    errorCode?: string
    resolving?: boolean
}

/**
 * Caps handed down by `open_chart_dropzone`. The UI is not interactive until
 * that result lands, so there is no "default caps" fallback to get wrong.
 */
interface Caps {
    batchId: string
    expiresAt: string
    maxFileBytes: number
    acceptedExtensions: string[]
    maxFilesPerRequest: number
}

const POLL_INTERVAL_MS = 2_000
const POLL_DEADLINE_MS = 10 * 60 * 1_000
const UPLOAD_CONCURRENCY = 3
/** Server caps a chunk at 3 MB of base64; 1 MB of raw bytes stays well under. */
const CHUNK_BYTES = 1024 * 1024
const MODEL_CONTEXT_LIMIT = 1_500

let host: DropzoneHost | null = null
let caps: Caps | null = null
const rows: Row[] = []
let phase: "waiting" | "collecting" | "uploading" | "processing" | "done" = "waiting"
let banner = ""
let rowSeq = 0
let committed = false

const root = document.getElementById("root") as HTMLElement

/* ------------------------------------------------------------- rendering */

function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function queuedRows(): Row[] {
    return rows.filter((r) => r.status === "queued")
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    if (text !== undefined) node.textContent = text
    return node
}

function render(): void {
    root.dataset.state = phase
    root.textContent = ""

    if (phase === "waiting" || !caps) {
        root.appendChild(
            el("p", { class: "waiting", id: "waiting" }, "Waiting for Claude…"),
        )
        if (banner) {
            root.appendChild(
                el("div", { class: "dz-error", "data-testid": "banner" }, banner),
            )
        }
        return
    }

    const header = el("div", { class: "dz-header" })
    header.appendChild(el("h1", { class: "dz-title" }, "Chart drop-zone"))
    header.appendChild(
        el("span", { class: "dz-batch", "data-testid": "batch-id" }, caps.batchId),
    )
    root.appendChild(header)

    if (banner) {
        root.appendChild(el("div", { class: "dz-error", "data-testid": "banner" }, banner))
    }

    const input = el("input", {
        type: "file",
        multiple: "",
        id: "dz-file-input",
        "data-testid": "file-input",
        accept: caps.acceptedExtensions.join(","),
    }) as HTMLInputElement
    input.addEventListener("change", () => {
        if (input.files) addFiles(Array.from(input.files))
        input.value = ""
    })
    root.appendChild(input)

    if (phase === "collecting") {
        const drop = el(
            "button",
            { type: "button", class: "dz-drop", "data-testid": "drop-target" },
            "Drop chart files here, or choose files",
        )
        drop.appendChild(
            el(
                "span",
                { class: "dz-drop-hint" },
                `${caps.acceptedExtensions.join(" ")} · up to ${fmtSize(caps.maxFileBytes)} each`,
            ),
        )
        drop.addEventListener("click", () => input.click())
        drop.addEventListener("dragover", (e) => {
            e.preventDefault()
            drop.dataset.over = "1"
        })
        drop.addEventListener("dragleave", () => {
            delete drop.dataset.over
        })
        drop.addEventListener("drop", (e) => {
            e.preventDefault()
            delete drop.dataset.over
            const dropped = (e as DragEvent).dataTransfer?.files
            if (dropped) addFiles(Array.from(dropped))
        })
        root.appendChild(drop)
    }

    if (rows.length) {
        const table = el("table", { class: "dz-table", "data-testid": "rows" })
        const thead = el("thead")
        const hr = el("tr")
        for (const [label, cls] of [
            ["File", ""],
            ["Size", "dz-col-size"],
            ["Status", "dz-col-status"],
            ["Detail", ""],
        ] as const) {
            hr.appendChild(el("th", cls ? { class: cls } : {}, label))
        }
        thead.appendChild(hr)
        table.appendChild(thead)

        const tbody = el("tbody")
        for (const row of rows) tbody.appendChild(renderRow(row))
        table.appendChild(tbody)
        root.appendChild(table)
    }

    const footer = el("div", { class: "dz-footer" })
    footer.appendChild(
        el("span", { class: "dz-totals", "data-testid": "totals" }, totalsText()),
    )

    const primary = el("button", {
        type: "button",
        class: "dz-primary",
        "data-testid": "upload-button",
    }) as HTMLButtonElement
    const n = queuedRows().length
    // One primary button. It only becomes a "Retry commit" in the dead-end
    // state where bytes are staged but commit_upload_batch failed.
    const staged = rows.filter((r) => r.status === "staged").length
    primary.textContent =
        n === 0 && staged > 0
            ? `Retry commit (${staged} staged)`
            : `Upload ${n} file${n === 1 ? "" : "s"}`
    primary.disabled = (n === 0 && staged === 0) || phase !== "collecting"
    primary.hidden = committed
    primary.addEventListener("click", () => {
        void startUpload()
    })
    footer.appendChild(primary)
    root.appendChild(footer)
}

function renderRow(row: Row): HTMLTableRowElement {
    const tr = el("tr", { "data-status": row.status, "data-row": row.rowId })
    tr.appendChild(el("td", { title: row.fileName }, row.fileName))
    tr.appendChild(el("td", { class: "dz-col-size" }, fmtSize(row.sizeBytes)))

    const statusCell = el("td", { class: "dz-col-status" })
    statusCell.appendChild(
        el("span", { class: "dz-status", "data-status": row.status }, row.status),
    )
    tr.appendChild(statusCell)

    const detail = el("td", { class: "dz-detail", title: row.detail }, row.detail)
    if (row.status === "parked") {
        const group = el("span", { class: "dz-resolve" })
        for (const [label, action] of [
            ["Keep both", "force"],
            ["Skip", "skip"],
        ] as const) {
            const btn = el(
                "button",
                { type: "button", class: "dz-chip", "data-action": action },
                label,
            ) as HTMLButtonElement
            btn.disabled = !!row.resolving
            btn.addEventListener("click", () => {
                void resolveRow(row, action)
            })
            group.appendChild(btn)
        }
        detail.appendChild(group)
    }
    tr.appendChild(detail)
    return tr
}

function totalsText(): string {
    const c = tally()
    const parts = [`${rows.length} file${rows.length === 1 ? "" : "s"}`]
    if (c.imported) parts.push(`${c.imported} imported`)
    if (c.parked) parts.push(`${c.parked} parked`)
    if (c.failed) parts.push(`${c.failed} failed`)
    if (c.skipped) parts.push(`${c.skipped} skipped`)
    if (phase === "processing") parts.push("processing…")
    return parts.join(" · ")
}

function tally(): { imported: number; parked: number; failed: number; skipped: number } {
    let imported = 0
    let parked = 0
    let failed = 0
    let skipped = 0
    for (const r of rows) {
        if (r.status === "imported") imported++
        else if (r.status === "parked") parked++
        else if (r.status === "failed" || r.status === "rejected") failed++
        else if (r.status === "skipped") skipped++
    }
    return { imported, parked, failed, skipped }
}

/* --------------------------------------------------------------- queuing */

function addFiles(files: File[]): void {
    if (!caps || phase !== "collecting") return
    for (const file of files) {
        const row: Row = {
            rowId: `r${++rowSeq}`,
            file,
            fileName: file.name,
            sizeBytes: file.size,
            status: "queued",
            detail: "",
        }
        if (!isAcceptedChartFile(file.name, file.type)) {
            row.status = "rejected"
            row.file = null
            row.errorCode = "unsupported_type"
            row.detail = `unsupported file type (accepted: ${caps.acceptedExtensions.join(" ")})`
        } else if (file.size > caps.maxFileBytes) {
            row.status = "rejected"
            row.file = null
            row.errorCode = "too_large"
            row.detail = `too large — ${fmtSize(file.size)}, max ${fmtSize(caps.maxFileBytes)}`
        }
        rows.push(row)
    }
    render()
}

/* -------------------------------------------------------------- uploading */

async function startUpload(): Promise<void> {
    if (!host || !caps || phase !== "collecting") return
    const pending = queuedRows()
    if (!pending.length) {
        // Nothing new to send, but bytes are already staged — this is the
        // retry path after a failed commit.
        if (rows.some((r) => r.status === "staged")) await commitBatch()
        return
    }
    phase = "uploading"
    banner = ""
    render()

    for (let i = 0; i < pending.length; i += caps.maxFilesPerRequest) {
        const group = pending.slice(i, i + caps.maxFilesPerRequest)
        try {
            await uploadGroup(group)
        } catch (err) {
            for (const row of group) {
                if (row.status === "queued" || row.status === "uploading") {
                    row.status = "failed"
                    row.errorCode = "url_request_failed"
                    row.detail = `failed (could not get an upload URL: ${message(err)})`
                }
            }
            render()
        }
    }

    if (rows.some((r) => r.status === "staged")) {
        await commitBatch()
    } else {
        phase = "collecting"
        banner = "Nothing was uploaded — every file failed or was rejected."
        render()
    }
}

async function uploadGroup(group: Row[]): Promise<void> {
    const result = unwrap<RequestUrlsResult>(
        await callTool("request_batch_upload_urls", {
            batchId: caps!.batchId,
            files: group.map((r) => ({
                fileName: r.fileName,
                mimeType: r.file?.type || undefined,
                sizeBytes: r.sizeBytes,
            })),
        }),
    )
    if (!result || !result.ok) throw new Error("request_batch_upload_urls returned no result")

    // Duplicate file names within one batch are legal (the server dedupes by
    // title), so pair responses to rows by consuming same-named rows in order
    // rather than by a name -> row map.
    const byName = new Map<string, Row[]>()
    for (const row of group) {
        const list = byName.get(row.fileName)
        if (list) list.push(row)
        else byName.set(row.fileName, [row])
    }
    const take = (fileName: string): Row | undefined => byName.get(fileName)?.shift()

    for (const rejected of result.rejected ?? []) {
        const row = take(rejected.fileName)
        if (!row) continue
        row.status = "rejected"
        row.file = null
        row.errorCode = rejected.reason
        row.detail = `rejected by server (${rejected.reason})`
    }

    const jobs: Array<() => Promise<void>> = []
    for (const item of result.items ?? []) {
        const row = take(item.fileName)
        if (!row) continue
        row.itemId = item.itemId
        row.status = "uploading"
        row.detail = "uploading…"
        jobs.push(() => uploadOne(row, item))
    }
    render()
    await runPool(jobs, UPLOAD_CONCURRENCY)
}

/** Run `jobs` with at most `limit` in flight. Jobs never reject. */
async function runPool(jobs: Array<() => Promise<void>>, limit: number): Promise<void> {
    let next = 0
    const worker = async (): Promise<void> => {
        while (next < jobs.length) {
            const job = jobs[next++]
            await job()
        }
    }
    const workers: Array<Promise<void>> = []
    for (let i = 0; i < Math.min(limit, jobs.length); i++) workers.push(worker())
    await Promise.all(workers)
}

type UrlItem = RequestUrlsResult["items"][number]

async function uploadOne(row: Row, item: UrlItem): Promise<void> {
    const file = row.file
    if (!file) return
    // One retry, because a signed PUT most often fails on a transient network
    // blip; only after that do we pay the base64 tax of the chunk fallback.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(item.uploadUrl, {
                method: "PUT",
                headers: item.requiredHeaders ?? {},
                body: file,
            })
            if (!res.ok) throw new Error(`PUT ${res.status}`)
            markStaged(row)
            return
        } catch (err) {
            row.detail =
                attempt === 0
                    ? `retrying upload (${message(err)})`
                    : `direct upload blocked (${message(err)}) — sending in chunks`
            render()
        }
    }

    try {
        await uploadInChunks(row, file)
        markStaged(row)
    } catch (err) {
        row.status = "failed"
        row.errorCode = "upload_failed"
        row.detail = `failed (could not upload: ${message(err)})`
        render()
    }
}

function markStaged(row: Row): void {
    row.status = "staged"
    row.detail = "staged"
    render()
}

/** Base64 of one slice, via `readAsDataURL` (no `btoa` + binary-string dance). */
function sliceToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error ?? new Error("read failed"))
        reader.onload = () => {
            const url = String(reader.result)
            const comma = url.indexOf(",")
            resolve(comma >= 0 ? url.slice(comma + 1) : "")
        }
        reader.readAsDataURL(blob)
    })
}

async function uploadInChunks(row: Row, file: File): Promise<void> {
    if (!row.itemId) throw new Error("no itemId")
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_BYTES))
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const slice = file.slice(chunkIndex * CHUNK_BYTES, (chunkIndex + 1) * CHUNK_BYTES)
        const dataBase64 = await sliceToBase64(slice)
        const res = unwrap<AppendChunkResult>(
            await callTool("append_batch_item_chunk", {
                batchId: caps!.batchId,
                itemId: row.itemId,
                chunkIndex,
                totalChunks,
                dataBase64,
            }),
        )
        if (!res || !res.ok) throw new Error(`chunk ${chunkIndex + 1}/${totalChunks} rejected`)
        row.detail = `sending in chunks ${chunkIndex + 1}/${totalChunks}`
        render()
    }
}

/* ------------------------------------------------------- commit + polling */

async function commitBatch(): Promise<void> {
    committed = true
    phase = "processing"
    render()
    const result = unwrap<CommitBatchResult>(
        await callTool("commit_upload_batch", { batchId: caps!.batchId }),
    )
    if (!result || !result.ok) {
        banner = "Commit failed — the batch was not queued."
        phase = "collecting"
        committed = false
        render()
        return
    }
    for (const row of rows) {
        if (row.status === "staged") {
            row.status = "pending"
            row.detail = "queued for import"
        }
    }
    render()
    await pollUntilDone()
}

async function pollUntilDone(): Promise<void> {
    const deadline = Date.now() + POLL_DEADLINE_MS
    for (;;) {
        await sleep(POLL_INTERVAL_MS)
        let batch: GetBatchResult | null = null
        try {
            batch = unwrap<GetBatchResult>(
                await callTool("get_upload_batch", { batchId: caps!.batchId }),
            )
        } catch (err) {
            banner = `Could not read batch status: ${message(err)}`
        }
        if (batch && batch.ok) {
            banner = ""
            applyBatch(batch)
            if (batch.status === "done") {
                phase = "done"
                render()
                await publishSummary()
                return
            }
        }
        render()
        if (Date.now() > deadline) {
            phase = "done"
            banner =
                "Still processing after 10 minutes — ask Claude to run get_upload_batch for the final state."
            render()
            await publishSummary()
            return
        }
    }
}

function applyBatch(batch: GetBatchResult): void {
    const byItemId = new Map<string, Row>()
    for (const row of rows) if (row.itemId) byItemId.set(row.itemId, row)

    for (const imported of batch.imported ?? []) {
        const row = byItemId.get(imported.itemId)
        if (!row) continue
        row.status = "imported"
        row.title = imported.title
        row.parked = undefined
        row.detail = `imported as “${imported.title}”`
    }
    for (const att of batch.attention ?? []) {
        const row = byItemId.get(att.itemId)
        if (!row) continue
        row.title = att.title
        if (att.status === "parked" && att.parked) {
            row.status = "parked"
            row.parked = {
                matchedTitle: att.parked.matchedTitle,
                matchedFileId: att.parked.matchedFileId,
            }
            row.detail = `looks like “${att.parked.matchedTitle}” is already in the library`
        } else if (att.status === "failed") {
            row.status = "failed"
            row.errorCode = att.error?.code ?? "failed"
            row.detail = att.error?.message ?? "failed"
        } else if (att.status === "skipped") {
            row.status = "skipped"
            row.detail = "skipped"
        }
    }
}

/* -------------------------------------------------------------- resolving */

async function resolveRow(row: Row, action: "force" | "skip"): Promise<void> {
    if (!row.itemId || row.resolving) return
    row.resolving = true
    row.detail = action === "force" ? "keeping both…" : "skipping…"
    render()
    try {
        const res = unwrap<ResolveItemResult>(
            await callTool("resolve_upload_item", {
                batchId: caps!.batchId,
                itemId: row.itemId,
                action,
            }),
        )
        if (!res || !res.ok) throw new Error("resolve_upload_item returned no result")
        row.status = res.status as RowStatus
        row.parked = undefined
        row.detail =
            res.status === "imported"
                ? `imported as a second copy${res.resultFileId ? ` (${res.resultFileId})` : ""}`
                : `skipped (${action})`
    } catch (err) {
        row.detail = `could not resolve: ${message(err)}`
    } finally {
        row.resolving = false
        render()
    }
    await publishSummary()
}

/* ---------------------------------------------------------- model context */

type SummaryRow = Pick<Row, "status" | "fileName" | "title" | "parked" | "errorCode">

/** The text handed back to Claude. Kept well under 1,500 characters. */
export function buildSummary(batchId: string, summaryRows: SummaryRow[]): string {
    let imported = 0
    let parked = 0
    let failed = 0
    const parkedBits: string[] = []
    const failedBits: string[] = []
    for (const r of summaryRows) {
        if (r.status === "imported") imported++
        else if (r.status === "parked") {
            parked++
            parkedBits.push(
                `${r.title ?? r.fileName} ↔ existing "${r.parked?.matchedTitle ?? "?"}" (${r.parked?.matchedFileId ?? "?"})`,
            )
        } else if (r.status === "failed" || r.status === "rejected") {
            failed++
            failedBits.push(`${r.fileName}: ${r.errorCode ?? "failed"}`)
        }
    }

    const head = `Upload batch ${batchId} finished: ${imported} imported, ${parked} parked (need a decision), ${failed} failed.`
    const tail = " Use get_upload_batch / resolve_upload_item for details."
    let text = head
    const budget = MODEL_CONTEXT_LIMIT - tail.length - 1

    const appendList = (label: string, bits: string[]): void => {
        if (!bits.length) return
        const kept: string[] = []
        for (const bit of bits) {
            const candidate = `${text} ${label}: ${[...kept, bit].join("; ")}.`
            if (candidate.length > budget) break
            kept.push(bit)
        }
        const dropped = bits.length - kept.length
        if (dropped > 0) kept.push(`+${dropped} more`)
        if (kept.length) text = `${text} ${label}: ${kept.join("; ")}.`
    }

    appendList("Parked", parkedBits)
    appendList("Failed", failedBits)
    return `${text}${tail}`.slice(0, MODEL_CONTEXT_LIMIT)
}

async function publishSummary(): Promise<void> {
    if (!host || !caps) return
    const text = buildSummary(caps.batchId, rows)
    try {
        await host.updateModelContext({ content: [{ type: "text", text }] })
    } catch {
        /* a host that refuses context updates must not break the UI */
    }
}

/* ----------------------------------------------------------------- utils */

function message(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
): Promise<ToolResultLike> {
    if (!host) throw new Error("host not connected")
    return host.callServerTool({ name, arguments: args })
}

/* ------------------------------------------------------------------ boot */

function onOpenResult(result: ToolResultLike): void {
    const open = unwrap<OpenDropzoneResult>(result)
    if (!open || !open.ok || !open.batchId) {
        banner =
            "Claude did not send a drop-zone batch — ask it to run open_chart_dropzone again."
        render()
        return
    }
    caps = {
        batchId: open.batchId,
        expiresAt: open.expiresAt,
        maxFileBytes: open.maxFileBytes,
        acceptedExtensions: open.acceptedExtensions?.length
            ? open.acceptedExtensions
            : ACCEPTED_CHART_EXTENSIONS,
        maxFilesPerRequest: Math.max(1, open.maxFilesPerRequest || 1),
    }
    phase = "collecting"
    banner = ""
    render()
}

export async function boot(): Promise<void> {
    render()
    host = await resolveHost()
    host.onToolResult(onOpenResult)
}

void boot()
