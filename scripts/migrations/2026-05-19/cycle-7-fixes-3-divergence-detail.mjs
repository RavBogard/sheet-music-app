#!/usr/bin/env node
// Look up library_index + songs row existence for the 22 missing fileIds
// from the audit, to understand the structural shape of C7I1-009's
// divergence (library_index-only vs songs-only vs both-orphan vs neither).
const BEARER = process.env.BEARER
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

const fileIds = JSON.parse(process.env.FILE_IDS_JSON)

async function main() {
    const out = []
    for (const fileId of fileIds) {
        const status = await callTool("get_chart_status", { fileId })
        const song = await callTool("get_song", { id: fileId })
        const enrichment = status.ok ? status.result?.enrichment : null
        out.push({
            fileId,
            healthStatus: status.ok ? status.result?.health?.status : null,
            songExists: song.ok && song.result !== null,
            songStatus: song.ok ? song.result?.status ?? null : null,
            songTitle: song.ok ? song.result?.title ?? null : null,
            libraryIndexExists: !!(enrichment && (enrichment.libraryIndexExists ?? true)),
            enrichmentRaw: enrichment,
        })
    }
    process.stdout.write(JSON.stringify(out, null, 2))
}
main().catch((e) => {
    process.stderr.write(String(e))
    process.exit(1)
})
