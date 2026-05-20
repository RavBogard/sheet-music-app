// Heal-row metadata backfill runner (storage-recovery Lane B follow-up).
//
// The 271 Shireinu rows healed before the chart-heal metadata fix carry bytes
// + status:'active' but are missing normalizedName/stem/titleSpecificity and
// never got an AI enrichment pass. This runner walks the healed fileIds from
// heal-run-report.json and calls the `backfill_heal_metadata` MCP tool per row
// to stamp the four fields + (on commit) fire enrichment.
//
// `--dry-run` is the DEFAULT and performs ZERO writes (no Gemini spend): for
// each row it prints fileId → recomputed stem/titleSpecificity + prior values.
// The real backfill requires `--commit` + an admin bearer (pool ROOT) and is
// Daniel-driven (it spends ~1 Gemini call per row).
//
// Run (dry-run — bearer still needed; the tool is admin-gated):
//   npx tsx scripts/backfill-heal-metadata.ts --bearer crl_live_xxx
// Run (commit, Daniel):
//   npx tsx scripts/backfill-heal-metadata.ts --commit --bearer crl_live_xxx
//
// Scope: operator script only. Reuses the `backfill_heal_metadata` MCP tool
// (admin-gated, dryRun-default). No src/ runtime beyond that tool.

import fs from "node:fs"

const MCP_ENDPOINT = "https://www.centralreform.live/api/mcp"

// ─── MCP client ──────────────────────────────────────────────────────────────

async function mcpCall(
    bearer: string,
    name: string,
    args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
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
    if (payload.error) {
        throw new Error(`MCP ${name} JSON-RPC error: ${JSON.stringify(payload.error)}`)
    }
    const inner = payload.result?.content?.[0]?.text
    const result = inner ? JSON.parse(inner) : payload.result
    return result as Record<string, unknown>
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

interface HealReportRow {
    targetFileId: string
    action: string
}

interface BackfillReportRow {
    fileId: string
    action: "would-stamp" | "stamped" | "skipped" | "error"
    stem?: string
    titleSpecificity?: number
    priorEnrichmentStatus?: string | null
    enrichmentStatus?: string
    enrichment?: string
    reason?: string
    error?: string
}

async function main(): Promise<void> {
    const healReportPath = arg("--in", ".paul/research/heal-run-report.json")!
    const outPath = arg("--out", ".paul/research/heal-metadata-backfill-report.json")!
    const commit = has("--commit")
    const bearer = arg("--bearer") ?? process.env.CRL_BEARER

    if (!bearer) {
        console.error(
            "--bearer <crl_live_…> (admin; pool ROOT) is required — backfill_heal_metadata is admin-gated even in dry-run. Refusing to run blind.",
        )
        process.exit(2)
    }
    if (!fs.existsSync(healReportPath)) {
        console.error(`heal report not found at ${healReportPath}`)
        process.exit(2)
    }

    const healReport = JSON.parse(fs.readFileSync(healReportPath, "utf8")) as {
        report?: HealReportRow[]
    }
    const fileIds = (healReport.report ?? [])
        .filter((r) => r.action === "healed")
        .map((r) => r.targetFileId)

    console.log(
        `[backfill] mode=${commit ? "COMMIT" : "DRY-RUN"} · healed rows=${fileIds.length}\n`,
    )

    const report: BackfillReportRow[] = []
    let wouldStamp = 0,
        stamped = 0,
        skipped = 0,
        errors = 0

    for (const fileId of fileIds) {
        try {
            const r = await mcpCall(bearer, "backfill_heal_metadata", {
                fileId,
                dryRun: !commit,
            })
            if (r.ok !== true) {
                errors++
                const machine = (r.error as { machine_code?: string })?.machine_code
                report.push({ fileId, action: "error", error: machine ?? JSON.stringify(r.error) })
                console.log(`  ✗ ${fileId}  ERROR (${machine ?? "tool error"})`)
                continue
            }
            const action = r.action as BackfillReportRow["action"]
            const computed = (r.computed ?? {}) as { stem?: string; titleSpecificity?: number }
            const prior = (r.prior ?? {}) as { enrichmentStatus?: string | null }
            const row: BackfillReportRow = {
                fileId,
                action,
                stem: computed.stem,
                titleSpecificity: computed.titleSpecificity,
                priorEnrichmentStatus: prior.enrichmentStatus ?? null,
                enrichmentStatus: r.enrichmentStatus as string | undefined,
                enrichment: r.enrichment as string | undefined,
                reason: r.reason as string | undefined,
            }
            report.push(row)
            if (action === "skipped") {
                skipped++
                console.log(`  ⊘ ${fileId}  SKIP (${row.reason ?? "not active"})`)
            } else if (action === "stamped") {
                stamped++
                console.log(
                    `  ✔ ${fileId}  STAMPED  spec=${row.titleSpecificity} stem="${row.stem}"  enrich=${row.enrichmentStatus}/${row.enrichment}`,
                )
            } else {
                wouldStamp++
                console.log(
                    `  • ${fileId}  would-stamp  spec=${row.titleSpecificity} stem="${row.stem}"  prior-enrich=${row.priorEnrichmentStatus}`,
                )
            }
        } catch (e) {
            errors++
            const msg = e instanceof Error ? e.message : String(e)
            report.push({ fileId, action: "error", error: msg })
            console.log(`  ✗ ${fileId}  ERROR: ${msg}`)
        }
    }

    fs.writeFileSync(
        outPath,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                mode: commit ? "commit" : "dry-run",
                healedRows: fileIds.length,
                report,
            },
            null,
            2,
        ),
    )
    console.log(
        `\n[backfill] ${commit ? "COMMIT" : "DRY-RUN"} done — ` +
            (commit
                ? `stamped=${stamped} skipped=${skipped} errors=${errors}`
                : `would-stamp=${wouldStamp} skipped=${skipped} errors=${errors}`) +
            `\nReport: ${outPath}` +
            (commit
                ? ""
                : "\nReview, then re-run with --commit --bearer <pool-root> to stamp + enrich (Daniel-driven; ~1 Gemini call per row)."),
    )
}

if (typeof require !== "undefined" && require.main === module) {
    void main()
}
