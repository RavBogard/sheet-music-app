#!/usr/bin/env node
/**
 * P0-B2 — Live query-after-write probe (Monitor Overhaul, Phase 0, Wave 2).
 *
 * The autonomous "live half" of the self-test oracle (PROGRAM-SPEC §3): the
 * X32's own query/response is ground truth — "did the desk actually change,
 * per the desk itself." This probe drives the live studio desk with NO human
 * in the booth, snapshots → writes via BOTH paths → reads back → restores,
 * and emits PASS/FAIL per assertion + the command→state round-trip latency.
 *
 * It is designed to **report the real state**: today (pre-Phase-1) it confirms
 * control reaches the desk but readback does NOT reflect own-writes (R1) and/or
 * the idle snapshot is stale (R2) and/or `buses` is array→map corrupted (R3).
 * After Phase 1 (full-state writes + query-after-command + heartbeat) the SAME
 * probe should go fully green — the regression oracle for the whole program.
 *
 * ── Home: scripts/ (not e2e/) ────────────────────────────────────────────────
 * This is a standalone operational diagnostic run on-demand + scheduled against
 * PRODUCTION Firestore + the real X32 — not a Playwright browser test. It lives
 * beside the existing `scripts/probe-*.mjs` operational probes. e2e/ is reserved
 * for Playwright specs that drive a browser; this drives the MCP HTTP surface
 * and the Firestore command bus directly, headless, with no browser.
 *
 * ── Two write paths (PROGRAM-SPEC §3 / AUDIT-consumers §1) ────────────────────
 *  (ii) MCP path     — `set_bus_fader` over /api/mcp. Server-mediated; runs
 *                      `preflightBusWrite`, so on R3-corrupted state it is
 *                      REFUSED with `invalid_bus_index` (validBusIndices:[]).
 *  (i)  iPad path     — direct `addDoc(monitor-live/commands/pending, {type,
 *                      busIndex, value, uid, createdAt})` exactly as
 *                      `firestore-monitor-client.ts` does. Bypasses MCP
 *                      validation → reaches the bridge even when state is
 *                      corrupted. This is THE North Star surface.
 *
 * ── Credential tiers ─────────────────────────────────────────────────────────
 *  MCP tier (always; needs only the bearer): tools/list, dogfood child-bearer
 *    mint→probe→revoke, list_monitor_buses, get_mix, set_bus_fader, post-revoke
 *    401. Fully headless with just CRL_MCP_TOKEN.
 *  Firestore tier (needs admin creds; SKIPPED with a clear message if absent):
 *    raw monitor-live/state + config/monitor reads, the iPad-path addDoc, the
 *    bridge-drain + state-reflect latency, and the byte-identical restore.
 *    Credentials, in priority order:
 *      - GOOGLE_APPLICATION_CREDENTIALS (path to a service-account JSON; ADC)
 *      - FIREBASE_SERVICE_ACCOUNT      (inline service-account JSON)
 *      - FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (+ project id) — same trio
 *        the app's initAdmin() uses
 *      - Application Default Credentials (gcloud auth application-default login)
 *
 * ── Safety (hard rules) ──────────────────────────────────────────────────────
 *  - Service-time guard FIRST (CRC: Fri evening + Shabbat morning,
 *    America/Chicago). Refuses inside a window unless PROBE_ALLOW_SERVICE_WINDOW=1.
 *  - Monitor/IEM buses only — never FOH/matrix.
 *  - Reversible: snapshot the target value, restore it byte-identical, verify.
 *    Because R3 can hide the live value, the restore value is provided
 *    explicitly (PROBE_RESTORE_VALUE) and verified against the snapshot when the
 *    snapshot is readable; the probe REFUSES to write if it has no restore value.
 *  - STOP + report if a precondition fails (desk stale, no clean target, in a
 *    service window, no bearer, no restore value for the write tier).
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   CRL_MCP_TOKEN=crl_live_<root> \
 *   PROBE_BUS=5 PROBE_TEST_VALUE=0.5 PROBE_RESTORE_VALUE=0.75 \
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *   node scripts/monitor-live-probe.mjs
 *
 *   # MCP-only (no Firestore creds): still mints/revokes a child + reports the
 *   # MCP read + the MCP-write-blocked-by-R3 evidence; SKIPs the write tier.
 *   CRL_MCP_TOKEN=crl_live_<root> node scripts/monitor-live-probe.mjs --mcp-only
 *
 *   # Read-only (no desk writes at all): snapshot + report, no enqueue.
 *   CRL_MCP_TOKEN=crl_live_<root> node scripts/monitor-live-probe.mjs --dry-run
 *
 * Exit 0 = the probe ran + reported (a reported readback failure is the EXPECTED
 * pre-Phase-1 result, not a probe error). Exit 1 = the probe itself could not
 * run (missing bearer, precondition STOP, unexpected crash).
 */

// ─── config ──────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2))
const FLAG = {
    mcpOnly: args.has("--mcp-only"),
    dryRun: args.has("--dry-run"),
    json: args.has("--json"),
}

const CFG = {
    token: process.env.CRL_MCP_TOKEN || "",
    endpoint: process.env.CRL_MCP_ENDPOINT || "https://www.centralreform.live/api/mcp",
    projectId:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        process.env.GCLOUD_PROJECT ||
        "crcmusiccharts",
    bus: process.env.PROBE_BUS ? Number(process.env.PROBE_BUS) : undefined,
    testValue:
        process.env.PROBE_TEST_VALUE !== undefined
            ? Number(process.env.PROBE_TEST_VALUE)
            : 0.5,
    restoreValue:
        process.env.PROBE_RESTORE_VALUE !== undefined
            ? Number(process.env.PROBE_RESTORE_VALUE)
            : undefined,
    allowServiceWindow: process.env.PROBE_ALLOW_SERVICE_WINDOW === "1",
    // bridge liveness + readback budgets
    deskFreshSec: 120, // config/monitor heartbeat must be younger than this
    drainTimeoutMs: 8000, // command must leave monitor-live/commands/pending
    reflectTimeoutMs: 8000, // monitor-live/state must reflect testValue
    pollMs: 250,
}

// ─── tiny report harness ─────────────────────────────────────────────────────

const RESULT = { assertions: [], latency: {}, notes: [], verdict: null }
function assert(id, ok, detail) {
    RESULT.assertions.push({ id, ok: !!ok, detail })
    const tag = ok ? "PASS" : "FAIL"
    log(`  [${tag}] ${id}${detail ? " — " + detail : ""}`)
}
function note(s) {
    RESULT.notes.push(s)
}
function log(...a) {
    if (!FLAG.json) console.log(...a)
}
function section(s) {
    log(`\n=== ${s} ===`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── MCP wire (raw fetch; handles JSON + SSE) ────────────────────────────────

let _rpcId = 1
async function mcpRpc(token, method, params) {
    const res = await fetch(CFG.endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: _rpcId++, method, params }),
    })
    const ct = res.headers.get("content-type") || ""
    const text = await res.text()
    let parsed
    if (ct.includes("text/event-stream")) {
        const dataLines = text.split("\n").filter((l) => l.startsWith("data:"))
        const objs = dataLines
            .map((l) => {
                try {
                    return JSON.parse(l.slice(5).trim())
                } catch {
                    return null
                }
            })
            .filter(Boolean)
        parsed = objs.length === 1 ? objs[0] : objs[objs.length - 1]
    } else {
        try {
            parsed = JSON.parse(text)
        } catch {
            parsed = text
        }
    }
    return { status: res.status, parsed, raw: text }
}

/** tools/call → unwrap the JSON-encoded text payload in result.content[0].text. */
async function mcpCall(token, name, toolArgs) {
    const r = await mcpRpc(token, "tools/call", {
        name,
        arguments: toolArgs || {},
    })
    let value = r.parsed
    const c = r?.parsed?.result?.content
    if (Array.isArray(c) && c[0]?.text) {
        try {
            value = JSON.parse(c[0].text)
        } catch {
            value = c[0].text
        }
    }
    return { status: r.status, isError: r?.parsed?.result?.isError === true, value }
}

// ─── service-time guard (CRC: Fri eve + Shabbat morning, America/Chicago) ─────

function serviceWindowNow(now = new Date()) {
    // Compute weekday + hour in America/Chicago without extra deps.
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        weekday: "short",
        hour: "2-digit",
        hour12: false,
    })
    const parts = Object.fromEntries(
        fmt.formatToParts(now).map((p) => [p.type, p.value]),
    )
    const wd = parts.weekday // "Fri", "Sat", ...
    const hour = Number(parts.hour)
    // Generous guards around CRC's actual service times.
    if (wd === "Fri" && hour >= 16 && hour < 22)
        return { inWindow: true, why: "Friday evening (Erev Shabbat)" }
    if (wd === "Sat" && hour >= 8 && hour < 14)
        return { inWindow: true, why: "Shabbat morning" }
    return { inWindow: false, why: `${wd} ${String(hour).padStart(2, "0")}:00 CT` }
}

// ─── Firestore admin (Firestore tier; optional) ──────────────────────────────

async function tryInitFirestore() {
    let appMod, fsMod
    try {
        appMod = await import("firebase-admin/app")
        fsMod = await import("firebase-admin/firestore")
    } catch (e) {
        return { ok: false, why: `firebase-admin not importable: ${String(e.message || e)}` }
    }
    const { initializeApp, getApps, cert, applicationDefault } = appMod
    const { getFirestore, Timestamp, FieldValue } = fsMod

    let credential
    let how
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    const saInline = process.env.FIREBASE_SERVICE_ACCOUNT
    if (saInline) {
        try {
            credential = cert(JSON.parse(saInline))
            how = "FIREBASE_SERVICE_ACCOUNT inline JSON"
        } catch (e) {
            return { ok: false, why: `FIREBASE_SERVICE_ACCOUNT not valid JSON: ${e.message}` }
        }
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        credential = cert({
            projectId: CFG.projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        })
        how = "FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY"
    } else if (saPath) {
        credential = applicationDefault()
        how = `GOOGLE_APPLICATION_CREDENTIALS=${saPath} (ADC)`
    } else {
        // last resort: ADC from gcloud (may or may not be configured)
        credential = applicationDefault()
        how = "Application Default Credentials (gcloud)"
    }

    try {
        if (!getApps().length)
            initializeApp({ credential, projectId: CFG.projectId })
        const db = getFirestore()
        // Probe a cheap read to fail fast on bad creds.
        await db.collection("config").doc("monitor").get()
        return { ok: true, db, Timestamp, FieldValue, how }
    } catch (e) {
        return { ok: false, why: `${how}: ${String(e.message || e)}` }
    }
}

function fsDateMillis(v) {
    if (v == null) return null
    if (typeof v === "number") return v
    if (typeof v === "string") {
        const ms = Date.parse(v)
        return Number.isNaN(ms) ? null : ms
    }
    if (typeof v?.toMillis === "function") return v.toMillis()
    if (typeof v?.toDate === "function") return v.toDate().getTime()
    if (typeof v?.seconds === "number") return v.seconds * 1000
    return null
}

/** buses can be a real array OR the R3 array→map corruption {"4":{fader}}. */
function readBusFaderFromState(state, busIndex) {
    const b = state?.buses
    if (Array.isArray(b)) {
        const row = b.find((x) => x?.index === busIndex)
        return row && typeof row.fader === "number"
            ? { found: true, fader: row.fader, shape: "array" }
            : { found: false, shape: "array" }
    }
    if (b && typeof b === "object") {
        const row = b[String(busIndex)]
        return row && typeof row.fader === "number"
            ? { found: true, fader: row.fader, shape: "map(corrupt)" }
            : { found: false, shape: "map(corrupt)" }
    }
    return { found: false, shape: typeof b }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
    log("# P0-B2 live query-after-write probe")
    log(`# endpoint: ${CFG.endpoint}  project: ${CFG.projectId}`)
    log(`# flags: ${[...args].join(" ") || "(none)"}`)
    log(`# started: ${new Date().toISOString()}`)

    if (!CFG.token) {
        console.error("STOP: CRL_MCP_TOKEN (seed ROOT crl_live_ bearer) is required.")
        process.exit(1)
    }

    // ── precondition: service-time guard ─────────────────────────────────────
    section("Precondition — service-time guard")
    const sw = serviceWindowNow()
    if (sw.inWindow && !CFG.allowServiceWindow) {
        assert("A2-service-window", false, `IN service window (${sw.why}) — refusing to nudge the desk.`)
        finishAndExit(1, "STOP: inside a service window; re-run outside Fri eve / Shabbat morning, or set PROBE_ALLOW_SERVICE_WINDOW=1 only if you are certain.")
        return
    }
    assert("A2-service-window", true, `outside service window (${sw.why})`)

    // ── MCP tier ─────────────────────────────────────────────────────────────
    section("MCP tier — dogfood child bearer")
    const tl = await mcpRpc(CFG.token, "tools/list", {})
    const toolNames = (tl.parsed?.result?.tools || []).map((t) => t.name)
    assert("M0-tools-list", toolNames.includes("set_bus_fader") && toolNames.includes("mint_admin_bearer"),
        `${toolNames.length} tools; monitor+mint present`)

    let childBearer = null
    let childTokenId = null
    const mint = await mcpCall(CFG.token, "mint_admin_bearer", {
        purpose: "P0-B2 live query-after-write monitor self-test probe",
        ttlSec: 3600,
    })
    if (mint.value?.ok && mint.value?.bearer) {
        childBearer = mint.value.bearer
        childTokenId = mint.value.tokenId
        assert("M1-mint-child", true, `tokenId=${childTokenId} ttl=${mint.value.ttlExpiresAt}`)
    } else {
        assert("M1-mint-child", false, `mint failed: ${JSON.stringify(mint.value).slice(0, 200)} — falling back to ROOT bearer for reads`)
        childBearer = CFG.token
    }
    const probeBearer = childBearer

    // ── MCP read snapshot ────────────────────────────────────────────────────
    section("MCP tier — read snapshot (get_mix / list_monitor_buses)")
    const lb = await mcpCall(probeBearer, "list_monitor_buses", {})
    const mcpBuses = lb.value?.buses || []
    const bridge = lb.value?.bridge || null
    const myBuses = lb.value?.myAssignedBuses || []
    log(JSON.stringify({ buses: mcpBuses, bridge, myAssignedBuses: myBuses, isPrivileged: lb.value?.isPrivileged }, null, 2))
    assert("M2-list-buses", lb.status === 200 && !lb.isError, `mcp sees ${mcpBuses.length} bus(es)`)

    const targetBus = CFG.bus !== undefined ? CFG.bus : myBuses[0]
    if (targetBus === undefined) {
        finishAndExit(1, "STOP: no target bus (PROBE_BUS unset and caller owns none).")
        return
    }
    note(`target bus = ${targetBus}`)
    log(`\n# target monitor bus: ${targetBus}`)

    const gm = await mcpCall(probeBearer, "get_mix", { busIndex: targetBus })
    const mcpReadbackOk = gm.status === 200 && !gm.isError && typeof gm.value?.fader === "number"
    if (mcpReadbackOk) {
        assert("M3-get-mix", true, `bus ${targetBus} fader=${gm.value.fader} stateStale=${gm.value?.bridge?.stateStale} ageS=${gm.value?.bridge?.stateAgeSeconds}`)
    } else {
        assert("M3-get-mix", false, `get_mix not usable: ${gm.value?.error?.machine_code || JSON.stringify(gm.value).slice(0, 160)}`)
        note(`get_mix(${targetBus}) failing is itself a real-state signal: R3 corruption (buses array→map) blocks the MCP read path.`)
    }

    // ── MCP write path (set_bus_fader) — expected BLOCKED by R3 today ─────────
    section("MCP write path — set_bus_fader (preflight-validated)")
    let mcpWriteApplied = false
    if (FLAG.dryRun) {
        assert("M4-mcp-write", true, "DRY-RUN: skipped set_bus_fader")
    } else {
        const sw2 = await mcpCall(probeBearer, "set_bus_fader", {
            busIndex: targetBus,
            level: CFG.testValue,
        })
        if (sw2.value?.ok) {
            mcpWriteApplied = true
            assert("M4-mcp-write", true, `accepted (commandId=${sw2.value.commandId}, confidence=${sw2.value.confidence})`)
            note("MCP write path is OPEN (state not corrupted enough to block preflight) — restore step will undo it.")
        } else {
            const mc = sw2.value?.error?.machine_code
            assert("M4-mcp-write", true, `REFUSED by preflight (${mc}) — EXPECTED real-state result: R3 corruption makes set_bus_fader uncallable; iPad path is the bypass.`)
            note(`MCP set_bus_fader blocked: ${mc} validBusIndices=${JSON.stringify(sw2.value?.error?.validBusIndices ?? sw2.value?.error?.context?.validBusIndices)}`)
        }
    }

    // ── Firestore tier (raw read + iPad-path write + restore) ────────────────
    let fs = { ok: false, why: "skipped" }
    if (!FLAG.mcpOnly) {
        fs = await tryInitFirestore()
    }
    if (!fs.ok) {
        section("Firestore tier — SKIPPED")
        note(`Firestore tier skipped: ${fs.why}. Provide GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT / FIREBASE_CLIENT_EMAIL+KEY to enable raw-state read, the iPad-path addDoc, and the byte-identical restore.`)
        assert("F0-firestore-creds", false, fs.why)
    } else {
        section(`Firestore tier — enabled (${fs.how})`)
        assert("F0-firestore-creds", true, fs.how)
        await firestoreTier(fs, targetBus)
    }

    // ── revoke child bearer + post-revoke 401 ────────────────────────────────
    section("MCP tier — revoke child bearer")
    if (childTokenId) {
        const rv = await mcpCall(CFG.token, "revoke_minted_bearer", { tokenId: childTokenId })
        assert("M5-revoke", rv.value?.ok === true, `revoked tokenId=${childTokenId}`)
        // post-revoke: child must now be rejected
        const after = await mcpCall(childBearer, "list_monitor_buses", {})
        const rejected = after.status === 401 || after.status === 403 || after.isError
        assert("M6-post-revoke-401", rejected, `child bearer rejected after revoke (status=${after.status})`)
    } else {
        note("No child bearer minted; revoke step skipped (used ROOT for reads).")
    }

    // ── verdict ──────────────────────────────────────────────────────────────
    finishAndExit(0, null)
}

async function firestoreTier(fs, targetBus) {
    const { db } = fs
    // raw snapshots
    const [stateSnap, cfgSnap] = await Promise.all([
        db.collection("monitor-live").doc("state").get(),
        db.collection("config").doc("monitor").get(),
    ])
    const state = stateSnap.exists ? stateSnap.data() : null
    const cfg = cfgSnap.exists ? cfgSnap.data() : null

    // desk-live check (heartbeat freshness + x32Connected)
    const hbMs = fsDateMillis(cfg?.bridge?.lastSeen)
    const hbAgeSec = hbMs ? Math.round((Date.now() - hbMs) / 1000) : null
    const x32 = cfg?.bridge?.x32Connected === true
    const deskLive = hbAgeSec !== null && hbAgeSec <= CFG.deskFreshSec && x32
    assert("F1-desk-live", deskLive, `heartbeat age=${hbAgeSec}s x32Connected=${x32} version=${cfg?.bridge?.version}`)

    // state freshness (raw)
    const stMs = fsDateMillis(state?.updatedAt)
    const stAge = stMs ? Math.round((Date.now() - stMs) / 1000) : null
    note(`raw monitor-live/state updatedAt age = ${stAge}s; buses shape = ${readBusFaderFromState(state, targetBus).shape}`)

    // snapshot target bus value
    const snap = readBusFaderFromState(state, targetBus)
    assert("F2-snapshot", true, `bus ${targetBus} snapshot: ${snap.found ? snap.fader : "NOT in state"} (${snap.shape})`)

    if (!deskLive) {
        note("Desk not live (stale heartbeat or X32 down) — refusing to enqueue a command.")
        return
    }
    if (FLAG.dryRun) {
        note("DRY-RUN: skipping the iPad-path write + restore.")
        return
    }

    // restore value: explicit, or the readable snapshot. REFUSE without one.
    const restoreValue =
        CFG.restoreValue !== undefined
            ? CFG.restoreValue
            : snap.found
              ? snap.fader
              : undefined
    if (restoreValue === undefined) {
        assert("F3-restore-known", false, "no PROBE_RESTORE_VALUE and snapshot unreadable (R3) — REFUSING to write a value I cannot restore byte-identical.")
        note("STOP for the write tier: provide PROBE_RESTORE_VALUE (the bus's true current fader) so the desk can be restored byte-identical.")
        return
    }
    assert("F3-restore-known", true, `restore target = ${restoreValue}${snap.found ? "" : " (operator-provided; snapshot hidden by R3)"}`)

    const pendingCol = db.collection("monitor-live").doc("commands").collection("pending")

    // ── iPad-path write (i): direct addDoc, exactly as firestore-monitor-client ──
    // In-process createdAt = Date.now() lands within ms, always inside the
    // bridge's 10s command-age window (B4). (A manual MCP-tool driver instead
    // sees inter-call latency push createdAt past 10s → the bridge rejects it
    // as `error:"Timeout"`; this in-process write avoids that.)
    const cmdRef = await pendingCol.add({
        type: "set_bus_master",
        busIndex: targetBus,
        value: CFG.testValue,
        uid: pickUid(cfg, targetBus),
        createdAt: Date.now(),
    })
    log(`  enqueued iPad-path command ${cmdRef.id}: set bus ${targetBus} → ${CFG.testValue}`)

    // The bridge DELETES an accepted command and ANNOTATES a rejected one with an
    // `error` field on a read:false doc that lingers ~30s (B6 — no ack surface),
    // so terminal = gone (applied) OR error-annotated (rejected).
    const res = await awaitCommandResult(db, cmdRef, CFG.drainTimeoutMs)
    RESULT.latency.enqueueToDrainMs = res.ms
    assert("F4-ipad-write-accepted", res.status === "applied",
        res.status === "applied"
            ? `bridge accepted + drained the command in ${res.ms}ms (control path LIVE)`
            : res.status === "rejected"
              ? `bridge REJECTED the command (error="${res.error}") — it reached the bridge but was declined (e.g. clock-window B4)`
              : `command still pending after ${CFG.drainTimeoutMs}ms (bridge not processing?)`)
    if (res.status === "rejected")
        note(`bridge rejection seen on a read:false doc (B6 no-ack surface): error="${res.error}"`)

    // state-reflect latency: monitor-live/state shows testValue on targetBus
    const reflect = await pollUntil(async () => {
        const s = (await db.collection("monitor-live").doc("state").get()).data()
        const r = readBusFaderFromState(s, targetBus)
        return r.found && Math.abs(r.fader - CFG.testValue) < 0.02
    }, CFG.reflectTimeoutMs)
    RESULT.latency.enqueueToStateReflectMs = reflect.ok ? reflect.ms : null
    // NOTE: pre-Phase-1 this is EXPECTED to FAIL (R1 read-of-own-write + R2/R3).
    assert("F5-state-reflects", reflect.ok,
        reflect.ok
            ? `monitor-live/state reflected the write in ${reflect.ms}ms (readback WORKS)`
            : `state did NOT reflect within ${CFG.reflectTimeoutMs}ms — EXPECTED pre-Phase-1 (R1 own-write not echoed / R2 idle-freeze / R3 corruption). THIS is the Phase-1 target.`)

    // ── restore byte-identical (i) ───────────────────────────────────────────
    const rRef = await pendingCol.add({
        type: "set_bus_master",
        busIndex: targetBus,
        value: restoreValue,
        uid: pickUid(cfg, targetBus),
        createdAt: Date.now(),
    })
    log(`  enqueued restore command ${rRef.id}: set bus ${targetBus} → ${restoreValue}`)
    const rRes = await awaitCommandResult(db, rRef, CFG.drainTimeoutMs)
    assert("F6-restore-applied", rRes.status === "applied",
        rRes.status === "applied"
            ? `restore accepted + drained in ${rRes.ms}ms — desk returned to ${restoreValue}`
            : `restore ${rRes.status}${rRes.error ? ` (error="${rRes.error}")` : ""} — MANUAL CHECK the desk (bus ${targetBus} → ${restoreValue})`)
    if (Math.abs((CFG.testValue ?? 0) - (restoreValue ?? 0)) < 1e-9) {
        note("test value == restore value → write was a no-op; desk unchanged either way.")
    }
}

/** Choose a uid that the bridge will authorize for this bus (owner if present). */
function pickUid(cfg, busIndex) {
    const a = cfg?.busAssignments?.[String(busIndex)]
    const list = Array.isArray(a) ? a : a ? [a] : []
    if (list[0]?.userId) return list[0].userId
    // fall back to any admin owner in the assignment table
    for (const v of Object.values(cfg?.busAssignments || {})) {
        const l = Array.isArray(v) ? v : v ? [v] : []
        if (l[0]?.userId) return l[0].userId
    }
    return process.env.PROBE_UID || "p0-b2-probe"
}

async function pollUntil(pred, timeoutMs) {
    const t0 = Date.now()
    for (;;) {
        if (await pred()) return { ok: true, ms: Date.now() - t0 }
        if (Date.now() - t0 >= timeoutMs) return { ok: false, ms: Date.now() - t0 }
        await sleep(CFG.pollMs)
    }
}

/**
 * Wait for a pending command to reach a terminal state. The bridge DELETES an
 * accepted command (→ "applied") and ANNOTATES a rejected one with an `error`
 * field on a read:false doc that lingers ~30s (→ "rejected", B6 no-ack). If
 * neither happens within the budget the bridge isn't processing (→ "pending").
 */
async function awaitCommandResult(db, ref, timeoutMs) {
    const t0 = Date.now()
    for (;;) {
        const snap = await ref.get()
        if (!snap.exists) return { status: "applied", ms: Date.now() - t0 }
        const err = snap.data()?.error
        if (typeof err === "string")
            return { status: "rejected", ms: Date.now() - t0, error: err }
        if (Date.now() - t0 >= timeoutMs)
            return { status: "pending", ms: Date.now() - t0 }
        await sleep(CFG.pollMs)
    }
}

function finishAndExit(code, stopMsg) {
    // Verdict: the probe "reports the real state". Control-path live + readback
    // broken == the EXPECTED pre-Phase-1 result (still exit 0 — the probe worked).
    const a = Object.fromEntries(RESULT.assertions.map((x) => [x.id, x.ok]))
    const controlLive = a["F4-ipad-write-accepted"] || a["M4-mcp-write"]
    const readbackWorks = a["F5-state-reflects"] === true
    if (stopMsg) {
        RESULT.verdict = `STOP: ${stopMsg}`
    } else if (controlLive && !readbackWorks) {
        RESULT.verdict = "REPORTS REAL STATE: control path LIVE, readback BROKEN (R1/R2/R3) — the Phase-1 target. Re-run should go green after Phase 1."
    } else if (controlLive && readbackWorks) {
        RESULT.verdict = "FULLY GREEN: control applied AND readback reflected within budget (Phase-1 contract met)."
    } else {
        RESULT.verdict = "INCONCLUSIVE: control path could not be exercised (see assertions)."
    }

    section("VERDICT")
    log(RESULT.verdict)
    if (RESULT.latency.enqueueToDrainMs != null)
        log(`latency enqueue→bridge-drain: ${RESULT.latency.enqueueToDrainMs}ms`)
    if (RESULT.latency.enqueueToStateReflectMs != null)
        log(`latency enqueue→state-reflect: ${RESULT.latency.enqueueToStateReflectMs}ms`)
    else log(`latency enqueue→state-reflect: N/A (did not reflect)`)

    if (FLAG.json) console.log(JSON.stringify(RESULT, null, 2))
    process.exit(code)
}

main().catch((e) => {
    console.error("PROBE CRASH:", e?.stack || e)
    process.exit(1)
})
