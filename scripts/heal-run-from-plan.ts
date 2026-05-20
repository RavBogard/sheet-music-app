// Heal-RUN batch runner (storage-recovery Lane B, Path 1).
//
// Drives the full heal-in-place loop for the orphaned Shireinu charts:
//   1. (re)build the file↔orphan match plan via the catalog-prefix-aware matcher
//   2. PHYSICALLY strip page 1 (the cover page) from each local PDF (pdf-lib)
//   3. heal each onto its EXISTING orphan fileId via the signed-URL flow +
//      finalize_chart_upload({targetFileId}) — preserves every setlist bond
//
// `--dry-run` is the DEFAULT and performs ZERO MCP writes (no bearer needed):
// it prints, per pair, localFile → origPages → post-strip pages → targetFileId
// → action. The mass byte-write requires an explicit `--commit` + an admin
// bearer (pool ROOT) and is Daniel-driven.
//
// Run (dry-run):
//   npx tsx scripts/heal-run-from-plan.ts --dir "C:\Users\dsbog\OneDrive\Desktop\993122D_COMPLETE_SHIREINU\993122D COMPLETE SHIREINU\INDIVIDUAL PDFs"
// Run (commit, Daniel):
//   npx tsx scripts/heal-run-from-plan.ts --dir "<folder>" --commit --bearer crl_live_xxx
//
// Scope: operator script + unit test only. Reuses the auditor-ACCEPTED
// heal-mode (finalize_chart_upload targetFileId @ e5427914d). No src/ runtime.

import fs from "node:fs"
import path from "node:path"
import { PDFDocument } from "pdf-lib"
import { matchOrphans, type OrphanRow, type HealPlan } from "./heal-orphans-from-local"

const MCP_ENDPOINT = "https://www.centralreform.live/api/mcp"

// ─── page-1 strip ────────────────────────────────────────────────────────────

export type StripResult =
    | { ok: true; bytes: Uint8Array; origPages: number; newPages: number }
    | { ok: false; reason: "too_few_pages"; origPages: number }

/**
 * Physically remove page index 0 from a PDF. Refuses (too_few_pages) when the
 * doc has ≤1 page so we never produce an empty upload. Multi-page PDFs lose
 * only the cover; all other pages are preserved in order.
 */
export async function stripFirstPage(bytes: Uint8Array): Promise<StripResult> {
    const doc = await PDFDocument.load(bytes)
    const origPages = doc.getPageCount()
    if (origPages <= 1) return { ok: false, reason: "too_few_pages", origPages }
    doc.removePage(0)
    const out = await doc.save()
    return { ok: true, bytes: out, origPages, newPages: doc.getPageCount() }
}

// ─── plan parse ──────────────────────────────────────────────────────────────

export interface MatchedPair {
    localFile: string
    fileId: string
}

/** Pull the matched[] pairs from a heal-plan object (matcher output). */
export function parseMatchedPairs(plan: Pick<HealPlan, "matched">): MatchedPair[] {
    if (!plan || !Array.isArray(plan.matched)) return []
    return plan.matched.map((m) => ({ localFile: m.localFile, fileId: m.fileId }))
}

function deriveTitle(localFile: string): string {
    return path
        .basename(localFile)
        .replace(/\.[a-z0-9]{1,5}$/i, "")
        .replace(/^99\d{4}[a-z]?\d+\s+/i, "")
        .trim()
}

// ─── MCP client (commit mode only) ───────────────────────────────────────────

async function mcpCall(
    bearer: string,
    name: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    const res = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
        }),
    })
    const text = await res.text()
    // Response is SSE-framed: `event: message\ndata: {json}`.
    const dataLine = text
        .split("\n")
        .find((l) => l.startsWith("data:"))
        ?.slice(5)
        .trim()
    const payload = JSON.parse(dataLine ?? text)
    if (payload.error) throw new Error(`MCP ${name} JSON-RPC error: ${JSON.stringify(payload.error)}`)
    const inner = payload.result?.content?.[0]?.text
    const result = inner ? JSON.parse(inner) : payload.result
    if (result && result.error && result.ok !== true) {
        throw new Error(`MCP ${name} tool error: ${JSON.stringify(result.error)}`)
    }
    return result
}

async function healOne(
    bearer: string,
    pair: MatchedPair,
    strippedBytes: Uint8Array,
): Promise<{ fileId: string; sizeBytes: number }> {
    const init = (await mcpCall(bearer, "request_chart_upload_url", {
        title: deriveTitle(pair.localFile),
        mimeType: "application/pdf",
    })) as { uploadSessionId: string; uploadUrl: string }
    const put = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from(strippedBytes),
    })
    if (!put.ok) throw new Error(`signed PUT failed HTTP ${put.status}`)
    const fin = (await mcpCall(bearer, "finalize_chart_upload", {
        uploadSessionId: init.uploadSessionId,
        targetFileId: pair.fileId,
        force: true,
    })) as { fileId: string; sizeBytes: number }
    return { fileId: fin.fileId, sizeBytes: fin.sizeBytes }
}

async function alreadyHealthy(bearer: string, fileId: string): Promise<boolean> {
    try {
        const st = (await mcpCall(bearer, "get_chart_status", { fileId })) as { status?: string }
        return st?.status === "ok"
    } catch {
        return false // can't confirm → attempt heal
    }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function arg(flag: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(flag)
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
        ? process.argv[i + 1]
        : fallback
}
function has(flag: string): boolean {
    return process.argv.includes(flag)
}

interface ReportRow {
    targetFileId: string
    localFile: string
    origPages?: number
    strippedPages?: number
    action: "would-heal" | "healed" | "skipped-already-active" | "skipped-1page" | "error"
    error?: string
    sizeBytes?: number
}

async function main(): Promise<void> {
    const dir = arg("--dir")
    const manifestPath = arg("--manifest", ".paul/research/orphan-recovery-manifest.json")!
    const planPath = arg("--plan", ".paul/research/heal-plan.json")!
    const reportPath = arg("--out", ".paul/research/heal-run-report.json")!
    const commit = has("--commit")
    const bearer = arg("--bearer") ?? process.env.CRL_BEARER

    if (!dir || !fs.existsSync(dir)) {
        console.error(`--dir is required and must exist (got: ${dir ?? "<none>"})`)
        process.exit(2)
    }
    if (commit && !bearer) {
        console.error("--commit requires --bearer <crl_live_…> (or CRL_BEARER env). Refusing to run blind.")
        process.exit(2)
    }

    // (re)build the plan from the matcher so the runner is self-contained.
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    const orphans: OrphanRow[] = (manifest.orphaned ?? []).map((o: OrphanRow) => ({
        id: o.id,
        title: o.title ?? null,
        fileName: o.fileName ?? null,
    }))
    const localFiles = listFilesRecursive(dir)
    const plan = matchOrphans(localFiles, orphans)
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2))
    const pairs = parseMatchedPairs(plan)

    console.log(
        `[heal-run] mode=${commit ? "COMMIT" : "DRY-RUN"} · matched pairs=${pairs.length} · ` +
            `unmatchedLocal=${plan.unmatchedLocal.length} · unmatchedOrphan=${plan.unmatchedOrphan.length}\n`,
    )

    const report: ReportRow[] = []
    let wouldHeal = 0,
        healed = 0,
        skip1 = 0,
        skipActive = 0,
        errors = 0

    for (const pair of pairs) {
        const base = path.basename(pair.localFile)
        let strip: StripResult
        try {
            strip = await stripFirstPage(new Uint8Array(fs.readFileSync(pair.localFile)))
        } catch (e) {
            errors++
            report.push({ targetFileId: pair.fileId, localFile: pair.localFile, action: "error", error: `pdf load: ${e instanceof Error ? e.message : String(e)}` })
            console.log(`  ✗ ${base} → ${pair.fileId}  ERROR (pdf load)`)
            continue
        }
        if (!strip.ok) {
            skip1++
            report.push({ targetFileId: pair.fileId, localFile: pair.localFile, origPages: strip.origPages, action: "skipped-1page" })
            console.log(`  ⊘ ${base} (${strip.origPages}p) → ${pair.fileId}  SKIP (≤1 page)`)
            continue
        }

        if (!commit) {
            wouldHeal++
            report.push({ targetFileId: pair.fileId, localFile: pair.localFile, origPages: strip.origPages, strippedPages: strip.newPages, action: "would-heal" })
            console.log(`  • ${base}  ${strip.origPages}p→${strip.newPages}p  → ${pair.fileId}  would-heal`)
            continue
        }

        // commit: idempotent skip + heal
        if (await alreadyHealthy(bearer!, pair.fileId)) {
            skipActive++
            report.push({ targetFileId: pair.fileId, localFile: pair.localFile, origPages: strip.origPages, strippedPages: strip.newPages, action: "skipped-already-active" })
            console.log(`  ✓ ${base} → ${pair.fileId}  skip (already ok)`)
            continue
        }
        try {
            const r = await healOne(bearer!, pair, strip.bytes)
            healed++
            report.push({ targetFileId: pair.fileId, localFile: pair.localFile, origPages: strip.origPages, strippedPages: strip.newPages, action: "healed", sizeBytes: r.sizeBytes })
            console.log(`  ✔ ${base}  ${strip.origPages}p→${strip.newPages}p  → ${pair.fileId}  HEALED (${r.sizeBytes}B)`)
        } catch (e) {
            errors++
            report.push({ targetFileId: pair.fileId, localFile: pair.localFile, origPages: strip.origPages, strippedPages: strip.newPages, action: "error", error: e instanceof Error ? e.message : String(e) })
            console.log(`  ✗ ${base} → ${pair.fileId}  ERROR: ${e instanceof Error ? e.message : String(e)}`)
        }
    }

    fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), mode: commit ? "commit" : "dry-run", pairs: pairs.length, report }, null, 2))
    console.log(
        `\n[heal-run] ${commit ? "COMMIT" : "DRY-RUN"} done — ` +
            (commit
                ? `healed=${healed} skipped-active=${skipActive} skipped-1page=${skip1} errors=${errors}`
                : `would-heal=${wouldHeal} skipped-1page=${skip1} errors=${errors}`) +
            `\nReport: ${reportPath}` +
            (commit ? "" : "\nReview, then re-run with --commit --bearer <pool-root> to perform the heal (Daniel-driven)."),
    )
}

function listFilesRecursive(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...listFilesRecursive(full))
        else if (entry.isFile() && !entry.name.startsWith(".")) out.push(full)
    }
    return out
}

if (typeof require !== "undefined" && require.main === module) {
    void main()
}
