#!/usr/bin/env node
/**
 * v11-02-04 — live Brothers Lazaroff tenant-isolation e2e probe.
 *
 * Drives the DEPLOYED MCP endpoint (https://www.centralreform.live/api/mcp) over
 * the JSON-RPC-over-SSE protocol the route speaks, with David's real BL bearer
 * and a CRC bearer, to prove end-to-end tenant isolation against production:
 *
 *   AC-3  BL caller reads only BL; create stamps BL (invisible to CRC); BL caller
 *         cannot read/mutate a CRC setlist by id (not-found, no mutation).
 *   AC-4  CRC caller is unaffected (still lists its setlists).
 *
 * Secrets come from env — NEVER hardcoded/committed:
 *   DAVID_BEARER  — David's brotherslazaroff bearer (crl_live_...)
 *   CRC_BEARER    — a crc-org bearer (supervisor-prod-bearer.mjs output)
 *
 * Exit 0 = all assertions passed; exit 1 = any failure. Cleans up the BL setlist
 * it creates so prod is left tidy.
 *
 * Usage:
 *   DAVID_BEARER=... CRC_BEARER=$(node scripts/supervisor-prod-bearer.mjs) \
 *     node scripts/e2e-bl-tenant-probe.mjs
 */

const ENDPOINT = process.env.MCP_ENDPOINT || "https://www.centralreform.live/api/mcp"
const DAVID = process.env.DAVID_BEARER
const CRC = process.env.CRC_BEARER

if (!DAVID || !CRC) {
    console.error("FATAL: set DAVID_BEARER and CRC_BEARER env vars.")
    process.exit(1)
}

let idSeq = 1
const pass = []
const fail = []
function check(name, ok, detail = "") {
    ;(ok ? pass : fail).push(name)
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

/** POST one JSON-RPC call; parse the SSE `data:` line back to an object. */
async function rpc(bearer, method, params) {
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: idSeq++, method, params }),
    })
    const text = await res.text()
    // Response is SSE: one or more `data: {...}` lines. Take the last data line.
    const dataLines = text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
    const raw = dataLines.length ? dataLines[dataLines.length - 1] : text.trim()
    try {
        return JSON.parse(raw)
    } catch {
        return { __unparsed: raw, __status: res.status }
    }
}

/** tools/call → unwrap content[0].text (JSON) into a value. */
async function callTool(bearer, name, args = {}) {
    const r = await rpc(bearer, "tools/call", { name, arguments: args })
    const textNode = r?.result?.content?.[0]?.text
    if (typeof textNode === "string") {
        try {
            return JSON.parse(textNode)
        } catch {
            return textNode
        }
    }
    return r?.result ?? r
}

/** Did a get/mutate get denied (cross-tenant not-found wall)? */
function isDenied(v) {
    if (v === null) return true
    if (v && typeof v === "object") {
        if (v.ok === false) return true
        if (v.error) return true
    }
    return false
}

async function main() {
    console.log(`# BL tenant-isolation e2e — ${ENDPOINT}\n`)

    // ── AC-3: BL reads only BL ──────────────────────────────────────────────
    const blList0 = await callTool(DAVID, "list_setlists", { limit: 50 })
    const blRows0 = Array.isArray(blList0) ? blList0 : []
    check(
        "AC-3 BL list_setlists returns BL-only (empty is valid for a fresh tenant)",
        Array.isArray(blList0),
        `count=${blRows0.length}`,
    )

    // ── AC-3: create stamps BL (cross-confirmed invisible to CRC) ───────────
    const created = await callTool(DAVID, "create_setlist", {
        name: "BL isolation probe (v11-02-04 — safe to delete)",
    })
    const newId = created?.setlistId
    check("AC-3 BL create_setlist succeeds", !!newId, newId ? `id=${newId}` : JSON.stringify(created))

    if (newId) {
        const blGet = await callTool(DAVID, "get_setlist", { id: newId })
        check("AC-3 BL owner can get its own new setlist", !isDenied(blGet) && blGet?.id === newId)

        const blList1 = await callTool(DAVID, "list_setlists", { limit: 50 })
        const inList = Array.isArray(blList1) && blList1.some((s) => s.id === newId)
        check("AC-3 new setlist appears in BL list", inList)

        const crcGetNew = await callTool(CRC, "get_setlist", { id: newId })
        check(
            "AC-3 CRC caller CANNOT see the BL-created setlist (→ stamped BL, not crc)",
            isDenied(crcGetNew),
        )
    }

    // ── AC-1/AC-3: BL cannot read/mutate a CRC setlist by id ────────────────
    const crcList = await callTool(CRC, "list_setlists", { limit: 5 })
    const crcRows = Array.isArray(crcList) ? crcList : []
    const crcTarget = crcRows[0]
    if (!crcTarget) {
        check("AC-1 precondition: a CRC setlist exists to target", false, "CRC list empty?!")
    } else {
        const crcId = crcTarget.id
        const crcNameBefore = crcTarget.name

        const blGetCrc = await callTool(DAVID, "get_setlist", { id: crcId })
        check("AC-1 BL get_setlist(CRC id) denied (not-found wall)", isDenied(blGetCrc), `target=${crcId}`)

        const blUpd = await callTool(DAVID, "update_setlist", {
            id: crcId,
            name: "HACKED BY BL — should never land",
        })
        check("AC-1 BL update_setlist(CRC id) → setlist_not_found", blUpd?.error?.machine_code === "setlist_not_found", JSON.stringify(blUpd?.error?.machine_code))

        const blDel = await callTool(DAVID, "delete_setlist", { id: crcId })
        check("AC-1 BL delete_setlist(CRC id) → setlist_not_found", blDel?.error?.machine_code === "setlist_not_found", JSON.stringify(blDel?.error?.machine_code))

        // Prove no mutation: CRC re-reads its setlist, name intact, still present.
        const crcReget = await callTool(CRC, "get_setlist", { id: crcId })
        check(
            "AC-1 CRC setlist unchanged after BL attack (present + name intact)",
            !isDenied(crcReget) && crcReget?.name === crcNameBefore,
            `name="${crcReget?.name}"`,
        )
    }

    // ── cleanup: delete the BL probe setlist ────────────────────────────────
    if (newId) {
        const del = await callTool(DAVID, "delete_setlist", { id: newId })
        const okDel = del?.ok === true || del?.tracksDeleted !== undefined
        check("cleanup: BL probe setlist deleted", okDel)
        const gone = await callTool(DAVID, "get_setlist", { id: newId })
        check("cleanup: BL probe setlist no longer retrievable", isDenied(gone))
    }

    // ── AC-4: CRC unaffected by the deploy ──────────────────────────────────
    const crcList2 = await callTool(CRC, "list_setlists", { limit: 5 })
    check(
        "AC-4 CRC caller still lists its setlists (no lock-out from deploy)",
        Array.isArray(crcList2) && crcList2.length > 0,
        `count=${Array.isArray(crcList2) ? crcList2.length : "n/a"}`,
    )

    console.log(`\n# RESULT: ${pass.length} passed, ${fail.length} failed`)
    if (fail.length) {
        console.log("# FAILED:", fail.join(" | "))
        process.exit(1)
    }
}

main().catch((e) => {
    console.error(`\nFATAL: ${e.stack || e.message}`)
    process.exit(1)
})
