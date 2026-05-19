#!/usr/bin/env node
/**
 * Cycle-7-fixes Lane 3 — prod sweep (Scope B).
 *
 *  1. reconcile_library({dryRun:false, force:true}) — flips Storage+Drive
 *     double-404 library_index rows to status:'orphaned' (+ mirrors onto
 *     songs/{fid}). Hides them from search_library going forward.
 *  2. verify_setlist_charts({setlistId, markOrphaned:true}) on the top-10
 *     by trackCount — same status-flip semantic, narrower per-setlist
 *     surface, captures phantomBonds (no library_index row at all).
 *
 * Read-side REPROs (REPRO-L3-aggregate-bond-health,
 * REPRO-L3-search-storage-divergence) re-run after the sweep and the
 * results land in the JSON artifact + the SHIP-NOTICE Repros block.
 *
 * Idempotent: running again is a no-op once orphans are marked
 * (reconcile excludes orphaned/duplicate from the candidate set).
 */

const BEARER = process.env.BEARER
if (!BEARER) {
    console.error("BEARER env required.")
    process.exit(2)
}
const ENDPOINT = "https://www.centralreform.live/api/mcp"

let rpcId = 0
async function callTool(name, args = {}) {
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${BEARER}`,
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: ++rpcId,
            method: "tools/call",
            params: { name, arguments: args },
        }),
    })
    const ct = res.headers.get("content-type") ?? ""
    let raw
    if (ct.includes("text/event-stream")) {
        const text = await res.text()
        const dataLine = text.split("\n").find((l) => l.startsWith("data:"))
        raw = dataLine ? JSON.parse(dataLine.slice(5).trim()) : null
    } else raw = await res.json()
    const content = raw?.result?.content?.[0]?.text
    if (raw?.result?.isError) return { ok: false, error: content }
    try {
        return { ok: true, result: JSON.parse(content) }
    } catch {
        return { ok: true, result: content }
    }
}

const out = { startedAt: new Date().toISOString(), steps: {} }

async function main() {
    // Step 1: reconcile force-run
    console.error("step 1: reconcile_library force-run...")
    const reconcile = await callTool("reconcile_library", {
        dryRun: false,
        force: true,
    })
    out.steps.reconcile = reconcile
    if (!reconcile.ok) {
        out.steps.reconcile_error = true
        process.stdout.write(JSON.stringify(out, null, 2))
        return
    }
    console.error(
        `  scanned=${reconcile.result?.scanned} alreadyHealthy=${reconcile.result?.alreadyHealthy} orphaned-committed=${reconcile.result?.orphan?.count} mirrored=${reconcile.result?.driveMirror?.count}`,
    )

    // Step 2: enumerate top-10 setlists by trackCount
    console.error("step 2: fetch top-10 by trackCount...")
    const setlistsRes = await callTool("list_setlists", { limit: 50 })
    const setlistRows =
        setlistsRes?.result?.setlists ?? setlistsRes?.result ?? []
    const top10 = Array.isArray(setlistRows)
        ? [...setlistRows]
              .filter((s) => s && typeof s === "object")
              .sort((a, b) => (b.trackCount ?? 0) - (a.trackCount ?? 0))
              .slice(0, 10)
        : []
    out.steps.top10 = top10.map((s) => ({
        id: s.id,
        name: s.name,
        trackCount: s.trackCount,
    }))

    // Step 3: verify+mark-orphan per setlist
    console.error("step 3: verify_setlist_charts({markOrphaned:true}) per setlist...")
    const perSetlist = []
    let aggTrack = 0,
        aggOk = 0,
        aggOrphMarked = 0,
        aggPhantom = 0
    for (const s of top10) {
        const r = await callTool("verify_setlist_charts", {
            setlistId: s.id,
            markOrphaned: true,
        })
        if (r.ok) {
            const x = r.result
            perSetlist.push({
                setlistId: s.id,
                name: s.name,
                trackCount: x.trackCount,
                okCount: x.okCount,
                missingCount: x.missingCount,
                orphanedMarked: x.orphanedMarked,
                phantomBonds: x.phantomBonds,
                shortcutUnresolvedCount: x.shortcutUnresolvedCount,
                needsSyncCount: x.needsSyncCount,
            })
            aggTrack += x.trackCount ?? 0
            aggOk += x.okCount ?? 0
            aggOrphMarked += x.orphanedMarked ?? 0
            aggPhantom += x.phantomBonds ?? 0
            console.error(
                `  ${s.id.slice(0, 8)} ${(s.name ?? "").slice(0, 30).padEnd(30)} tc=${x.trackCount} ok=${x.okCount} miss=${x.missingCount} ophMarked=${x.orphanedMarked}`,
            )
        } else {
            perSetlist.push({ setlistId: s.id, error: r.error })
        }
    }
    out.steps.verify = {
        perSetlist,
        aggregate: {
            trackCount: aggTrack,
            okCount: aggOk,
            okPct:
                aggTrack > 0 ? Math.round((aggOk / aggTrack) * 1000) / 10 : null,
            orphanedMarked: aggOrphMarked,
            phantomBonds: aggPhantom,
        },
    }

    // Step 4: re-probe reconcile dryRun to confirm orphan-bucket cleared
    console.error("step 4: re-probe reconcile dryRun (expect orphan.count → 0)")
    out.steps.reconcile_post = await callTool("reconcile_library", {
        dryRun: true,
    })

    // Step 5: re-sample search_library for divergence repro
    console.error("step 5: re-sample search_library divergence...")
    const sampleQueries = ["the", "a", "shabbat", "mizmor", "shema"]
    const seen = new Set()
    for (const q of sampleQueries) {
        const r = await callTool("search_library", { query: q, limit: 10 })
        if (r.ok && Array.isArray(r.result)) {
            for (const row of r.result) {
                if (row?.id) seen.add(row.id)
            }
        }
    }
    const sampled = Array.from(seen).slice(0, 50)
    let still_missing = 0
    const detail = []
    for (const fileId of sampled) {
        const r = await callTool("get_chart_status", { fileId })
        const status = r.ok ? r.result?.health?.status : `err:${r.error}`
        if (status === "missing") still_missing++
        detail.push({ fileId, status })
    }
    out.steps.search_divergence_post = {
        sampled: sampled.length,
        still_missing,
        detail,
    }

    out.completedAt = new Date().toISOString()
    process.stdout.write(JSON.stringify(out, null, 2))
}

main().catch((e) => {
    out.fatalError = e instanceof Error ? e.stack : String(e)
    process.stdout.write(JSON.stringify(out, null, 2))
    process.exit(1)
})
