#!/usr/bin/env node
/**
 * Cycle-7-fixes Lane 3 — prod chart-bond audit.
 *
 * Run via:  BEARER=crl_live_... node scripts/cycle-7-fixes-3-prod-audit.mjs
 *
 * Emits a JSON artifact to stdout. Caller redirects to
 * .paul/research/cycle-7-fixes-3-bond-audit.json (raw) and the prose
 * companion at .paul/research/cycle-7-fixes-3-bond-audit.md is hand-summarized.
 *
 * READ-ONLY probes only (dryRun on reconcile; verify_setlist_charts without
 * markOrphaned). No writes from this script. Daniel's Scope-B sweep
 * direction (soft-flag + auto-mark orphans) executes in a separate
 * one-shot invocation after this audit is captured.
 */
const BEARER = process.env.BEARER
if (!BEARER) {
    console.error("BEARER env required.")
    process.exit(2)
}
// Apex strips Authorization on 307 → MUST hit www directly.
const ENDPOINT = "https://www.centralreform.live/api/mcp"

let rpcId = 0
async function callTool(name, args = {}) {
    const id = ++rpcId
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${BEARER}`,
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name, arguments: args },
        }),
    })
    const ct = res.headers.get("content-type") ?? ""
    let raw
    if (ct.includes("text/event-stream")) {
        const text = await res.text()
        const dataLine = text
            .split("\n")
            .find((l) => l.startsWith("data:"))
        raw = dataLine ? JSON.parse(dataLine.slice(5).trim()) : null
    } else {
        raw = await res.json()
    }
    const content = raw?.result?.content?.[0]?.text
    if (raw?.result?.isError) {
        return { ok: false, error: content ?? "tool returned isError" }
    }
    try {
        return { ok: true, result: JSON.parse(content) }
    } catch {
        return { ok: true, result: content }
    }
}

const out = {
    capturedAt: new Date().toISOString(),
    prodSHA: null,
    probes: {},
}

async function main() {
    // Version stamp
    try {
        const v = await fetch("https://www.centralreform.live/api/version").then(
            (r) => r.json(),
        )
        out.prodSHA = v?.sha ?? v?.gitSha ?? null
        out.versionRaw = v
    } catch (e) {
        out.versionRaw = { error: String(e) }
    }

    // 1) Cardinality
    for (const collection of [
        "setlists",
        "tracks",
        "library_index",
        "songs",
        "setlistTemplates",
        "users",
        "scheduling_assignments",
        "webVitalsObservations",
    ]) {
        const r = await callTool("dump_collection_size", { collection })
        out.probes[`dump_${collection}`] = r
    }

    // 2) Reconcile dryRun — current divergence baseline
    out.probes.reconcile_dryRun = await callTool("reconcile_library", {
        dryRun: true,
    })

    // 3) List setlists (highest trackCount focus). Try recent_write sort + take 50.
    const setlists50 = await callTool("list_setlists", { limit: 50 })
    out.probes.list_setlists_50 = setlists50
    const setlistRows =
        setlists50?.result?.setlists ?? setlists50?.result ?? []

    // Sort by trackCount desc, take top 10
    const top10 = Array.isArray(setlistRows)
        ? [...setlistRows]
              .filter((s) => s && typeof s === "object")
              .sort((a, b) => (b.trackCount ?? 0) - (a.trackCount ?? 0))
              .slice(0, 10)
        : []
    out.probes.top10_setlists = top10.map((s) => ({
        id: s.id,
        name: s.name,
        trackCount: s.trackCount,
        eventDate: s.eventDate,
        publishedAt: s.publishedAt,
    }))

    // 4) Verify each top-10 setlist's charts (no markOrphaned — read-only)
    out.probes.verify_top10 = []
    let aggTrack = 0,
        aggOk = 0,
        aggBonded = 0,
        aggMissing = 0,
        aggNeedsSync = 0,
        aggShortcut = 0,
        aggPhantom = 0
    for (const s of top10) {
        const r = await callTool("verify_setlist_charts", {
            setlistId: s.id,
            markOrphaned: false,
        })
        const summary = r.ok
            ? {
                  setlistId: s.id,
                  name: s.name,
                  trackCount: r.result?.trackCount,
                  bondedCount: r.result?.bondedCount,
                  okCount: r.result?.okCount,
                  missingCount: r.result?.missingCount,
                  needsSyncCount: r.result?.needsSyncCount,
                  shortcutUnresolvedCount: r.result?.shortcutUnresolvedCount,
                  phantomBonds: r.result?.phantomBonds,
                  unreachableCount: r.result?.unreachableCount,
              }
            : { setlistId: s.id, error: r.error }
        out.probes.verify_top10.push(summary)
        if (r.ok) {
            aggTrack += r.result?.trackCount ?? 0
            aggOk += r.result?.okCount ?? 0
            aggBonded += r.result?.bondedCount ?? 0
            aggMissing += r.result?.missingCount ?? 0
            aggNeedsSync += r.result?.needsSyncCount ?? 0
            aggShortcut += r.result?.shortcutUnresolvedCount ?? 0
            aggPhantom += r.result?.phantomBonds ?? 0
        }
    }
    out.probes.verify_top10_aggregate = {
        trackCount: aggTrack,
        okCount: aggOk,
        bondedCount: aggBonded,
        missingCount: aggMissing,
        needsSyncCount: aggNeedsSync,
        shortcutUnresolvedCount: aggShortcut,
        phantomBonds: aggPhantom,
        okPct: aggTrack > 0 ? Math.round((aggOk / aggTrack) * 1000) / 10 : null,
        bondedPct:
            aggTrack > 0 ? Math.round((aggBonded / aggTrack) * 1000) / 10 : null,
    }

    // 5) C7I4-002 spot-check on b12a5221
    out.probes.b12a5221_get_setlist = await callTool("get_setlist", {
        id: "b12a5221-111a-4ffa-b408-350cdbd28190",
    })
    out.probes.b12a5221_verify = await callTool("verify_setlist_charts", {
        setlistId: "b12a5221-111a-4ffa-b408-350cdbd28190",
        markOrphaned: false,
    })

    // 6) Sample 50 search_library hits — probe whether any return rows that
    // currently 404 in Storage AND Drive (C7I1-009 divergence repro).
    const sampleQueries = ["the", "a", "shabbat", "mizmor", "shema"]
    out.probes.search_library_samples = {}
    const seenFileIds = new Set()
    for (const q of sampleQueries) {
        const r = await callTool("search_library", { query: q, limit: 10 })
        out.probes.search_library_samples[q] = r
        if (r.ok && Array.isArray(r.result)) {
            for (const row of r.result) {
                if (row?.id) seenFileIds.add(row.id)
            }
        }
    }
    // Per-fileId chart health probe (capped at 50)
    const sampleFileIds = Array.from(seenFileIds).slice(0, 50)
    out.probes.search_library_health_probe = []
    let active404Both = 0
    for (const fileId of sampleFileIds) {
        const r = await callTool("get_chart_status", { fileId })
        const status = r.ok ? r.result?.health?.status : `err:${r.error}`
        if (status === "missing") active404Both++
        out.probes.search_library_health_probe.push({ fileId, status })
    }
    out.probes.search_library_divergence_count = {
        sampled: sampleFileIds.length,
        missing_both_404: active404Both,
        targetForC7I1_009: "zero",
    }

    process.stdout.write(JSON.stringify(out, null, 2))
}

main().catch((e) => {
    out.fatalError = e instanceof Error ? e.stack : String(e)
    process.stdout.write(JSON.stringify(out, null, 2))
    process.exit(1)
})
