// Lane C scoped cleanup — execute the confirmed delete set via MCP delete_chart.
// Reads ids from .paul/research/lane-c-delete-plan.json (deleteSet[]).
// Bearer from env CRL_BEARER (never written to disk).
// Tolerates chart_not_found (already gone). STOPS on chart_in_use (unexpected
// live bond) or any auth/forbidden/rate-limit error. Sequential (no hammering).
import { readFileSync, writeFileSync } from "node:fs"

const BEARER = process.env.CRL_BEARER
if (!BEARER) {
    console.error("CRL_BEARER env var required")
    process.exit(1)
}
const ENDPOINT = "https://www.centralreform.live/api/mcp" // apex strips auth on 307

const plan = JSON.parse(
    readFileSync("./.paul/research/lane-c-delete-plan.json", "utf8"),
)
const rows = plan.deleteSet
console.log(`Loaded ${rows.length} delete-eligible rows from plan.`)

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
        const dataLine = text.split("\n").find((l) => l.startsWith("data:"))
        raw = dataLine ? JSON.parse(dataLine.slice(5).trim()) : null
    } else {
        raw = await res.json()
    }
    const content = raw?.result?.content?.[0]?.text
    if (raw?.error) return { ok: false, transport: raw.error }
    if (raw?.result?.isError) {
        let parsed = null
        try {
            parsed = JSON.parse(content)
        } catch {}
        return { ok: false, error: content ?? "isError", parsed }
    }
    try {
        return { ok: true, result: JSON.parse(content) }
    } catch {
        return { ok: true, result: content }
    }
}

const out = {
    ranAt: new Date().toISOString(),
    planTotal: rows.length,
    deleted: [],
    alreadyGone: [],
    errors: [],
    stoppedAt: null,
}

function isStopError(r) {
    const blob = JSON.stringify(r).toLowerCase()
    return (
        blob.includes("chart_in_use") ||
        blob.includes("forbidden") ||
        blob.includes("unauthor") ||
        blob.includes("rate_limit") ||
        blob.includes("invalid_token") ||
        blob.includes("expired")
    )
}
function isNotFound(r) {
    return JSON.stringify(r).toLowerCase().includes("chart_not_found")
}

async function main() {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const tag = `[${i + 1}/${rows.length}] ${row.id} (${row.title ?? "?"})`
        const r = await callTool("delete_chart", { fileId: row.id })
        if (r.ok) {
            out.deleted.push(row.id)
            console.log(`OK   ${tag}`)
        } else if (isNotFound(r)) {
            out.alreadyGone.push(row.id)
            console.log(`GONE ${tag} (chart_not_found — tolerated)`)
        } else if (isStopError(r)) {
            out.stoppedAt = { index: i, id: row.id, error: r }
            console.error(`STOP ${tag} :: ${r.error ?? JSON.stringify(r.transport)}`)
            break
        } else {
            out.errors.push({ id: row.id, error: r.error ?? r.transport ?? r })
            console.error(`ERR  ${tag} :: ${r.error ?? JSON.stringify(r)}`)
        }
    }
    out.summary = {
        deleted: out.deleted.length,
        alreadyGone: out.alreadyGone.length,
        errors: out.errors.length,
        stopped: !!out.stoppedAt,
    }
    writeFileSync(
        "./.paul/research/lane-c-delete-RESULT.json",
        JSON.stringify(out, null, 2),
    )
    console.log("\n=== SUMMARY ===")
    console.log(JSON.stringify(out.summary, null, 2))
    if (out.stoppedAt)
        console.log("HALTED — see stoppedAt in lane-c-delete-RESULT.json")
}
main()
