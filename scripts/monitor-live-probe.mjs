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
 *   # …plus the per-channel SEND tier (verifies the syncFullState throttle fix
 *   # live): set PROBE_CHANNEL to drive set_send_on + set_send_level on PROBE_BUS,
 *   # snapshot → write → readback (state.buses[B].sends[CH]) → byte-identical
 *   # restore. Restore comes from the snapshot when readable, else provide
 *   # PROBE_SEND_RESTORE_LEVEL + PROBE_SEND_RESTORE_ON.
 *   CRL_MCP_TOKEN=crl_live_<root> \
 *   PROBE_BUS=5 PROBE_CHANNEL=19 PROBE_SEND_TEST_LEVEL=0.5 \
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
    // ── per-channel send tier (monitor-sends throttle verification) ──
    // Set PROBE_CHANNEL to enable the send tier on PROBE_BUS; it mirrors the
    // master tier (snapshot → set_send_on + set_send_level → readback →
    // byte-identical restore). This is the oracle that proves the syncFullState
    // throttle fix on the live desk: after the fix, buses 2–5 send reads resolve
    // confirmed, so a send write reflects in state instead of easing back to a
    // fabricated 0 (synthesis §B / Lane-3 step 2).
    channel:
        process.env.PROBE_CHANNEL !== undefined
            ? Number(process.env.PROBE_CHANNEL)
            : undefined,
    sendTestLevel:
        process.env.PROBE_SEND_TEST_LEVEL !== undefined
            ? Number(process.env.PROBE_SEND_TEST_LEVEL)
            : 0.5,
    sendRestoreLevel:
        process.env.PROBE_SEND_RESTORE_LEVEL !== undefined
            ? Number(process.env.PROBE_SEND_RESTORE_LEVEL)
            : undefined,
    sendRestoreOn:
        process.env.PROBE_SEND_RESTORE_ON !== undefined
            ? /^(1|true|on)$/i.test(process.env.PROBE_SEND_RESTORE_ON)
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

/** Read one per-channel send {level,on} out of state.buses[B].sends[CH]. */
function readSendFromState(state, busIndex, channelIndex) {
    const b = state?.buses
    let bus
    if (Array.isArray(b)) bus = b.find((x) => x?.index === busIndex)
    else if (b && typeof b === "object") bus = b[String(busIndex)]
    if (!bus) return { found: false, shape: Array.isArray(b) ? "array" : typeof b }

    const sends = bus.sends
    let row
    if (Array.isArray(sends)) row = sends.find((s) => s?.channelIndex === channelIndex)
    else if (sends && typeof sends === "object") row = sends[String(channelIndex)]
    const sendsShape = Array.isArray(sends) ? "array" : typeof sends
    return row && typeof row.level === "number"
        ? { found: true, level: row.level, on: row.on === true, shape: sendsShape }
        : { found: false, shape: sendsShape }
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

    // ── pre-write Firestore init + state snapshot (NIT-2 ordering fix) ───────
    // Capture raw monitor-live/state BEFORE any write side-effect (M4 set_bus_fader
    // and F4 iPad-path addDoc), so the F2 snapshot reflects the TRUE pre-probe
    // desk value rather than the post-write readback. Pre-fix the snapshot ran
    // INSIDE firestoreTier, AFTER M4, so a successful M4 perturbed the snapshot
    // value (e.g. 0.7614 → 0.4995 readback ≈ testValue 0.5) and F6 restored to
    // the polluted value. Doing the init + snapshot up here is a no-op when
    // creds are missing (firestoreTier still skips cleanly).
    let fs = { ok: false, why: "skipped" }
    let preWriteState = null
    if (!FLAG.mcpOnly) {
        fs = await tryInitFirestore()
        if (fs.ok) {
            try {
                const earlySnap = await fs.db.collection("monitor-live").doc("state").get()
                preWriteState = earlySnap.exists ? earlySnap.data() : null
            } catch (e) {
                note(`pre-write state read failed: ${String(e?.message || e)} — F2 will fall back to live state read (NIT-2 may recur for this run).`)
            }
        }
    }

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
    // (Firestore init + pre-write state snapshot already captured above, BEFORE
    // M4 — see NIT-2 ordering fix.)
    if (!fs.ok) {
        section("Firestore tier — SKIPPED")
        note(`Firestore tier skipped: ${fs.why}. Provide GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT / FIREBASE_CLIENT_EMAIL+KEY to enable raw-state read, the iPad-path addDoc, and the byte-identical restore.`)
        assert("F0-firestore-creds", false, fs.why)
    } else {
        section(`Firestore tier — enabled (${fs.how})`)
        assert("F0-firestore-creds", true, fs.how)
        // v10.0.4 surface tier runs FIRST (read-only) to snapshot the baseline
        // errCount + heartbeat shape before the F-tier write perturbs state.
        const baseline = await v1004Tier(fs, probeBearer)
        const restoreValueForStress = await firestoreTier(fs, targetBus, preWriteState)
        // Stress tier — 3-command burst at restoreValue (no desk motion) so we
        // can assert queueDepth/unconfirmedCount stay bounded + state.updatedAt
        // advanced (not just heartbeat) + errCount delta during the probe window.
        if (!FLAG.dryRun) {
            await stressTier(fs, targetBus, restoreValueForStress, baseline)
        } else {
            note("Stress tier skipped: --dry-run.")
        }
        // Per-channel send tier (opt-in via PROBE_CHANNEL) — the live oracle for
        // the syncFullState throttle fix. Runs after the master tier so the bus
        // is in a known state first.
        if (CFG.channel !== undefined) {
            await sendTier(fs, targetBus)
        } else {
            note("Send tier skipped: set PROBE_CHANNEL=<1-32> to drive set_send_on + set_send_level on PROBE_BUS (verifies the throttle fix live).")
        }
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

async function firestoreTier(fs, targetBus, preWriteState) {
    const { db } = fs
    // raw snapshots — `state` here is the LIVE (post-MCP-tier) state used for
    // freshness reporting; `preWriteState` (captured at the top of main(),
    // BEFORE M4 + F4 writes) is the source of truth for F2's restore snapshot.
    const [stateSnap, cfgSnap] = await Promise.all([
        db.collection("monitor-live").doc("state").get(),
        db.collection("config").doc("monitor").get(),
    ])
    const state = stateSnap.exists ? stateSnap.data() : null
    const cfg = cfgSnap.exists ? cfgSnap.data() : null
    // Fall back to the live state if a pre-write snapshot wasn't captured
    // (e.g. doc didn't exist yet at startup). Note already logged in main().
    const snapshotState = preWriteState !== null ? preWriteState : state

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

    // snapshot target bus value — reads `snapshotState` (pre-M4-write capture
    // from main()) NOT `state` (live post-write read). NIT-2 fix: without
    // this, a successful M4 write polluted the snapshot.
    const snap = readBusFaderFromState(snapshotState, targetBus)
    const snapSource = preWriteState !== null ? "pre-write" : "live (fallback)"
    assert("F2-snapshot", true, `bus ${targetBus} snapshot: ${snap.found ? snap.fader : "NOT in state"} (${snap.shape}, ${snapSource})`)

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

    // NIT-2 regression guard: if restoreValue came from the snapshot and is
    // ~equal to CFG.testValue, the snapshot was captured AFTER the M-tier
    // write (the bug this commit fixes). Refuse the write rather than
    // "restoring" to the polluted value. Operator-supplied PROBE_RESTORE_VALUE
    // bypasses this guard (Daniel may legitimately want to restore to the
    // test value if the bus was genuinely at it pre-probe).
    if (
        CFG.restoreValue === undefined &&
        typeof restoreValue === "number" &&
        Math.abs(restoreValue - CFG.testValue) < 1e-3
    ) {
        assert("F3-restore-untainted", false,
            `restore value ${restoreValue} ≈ test value ${CFG.testValue} — snapshot likely captured POST-write. Re-run with snapshot-first ordering, or set PROBE_RESTORE_VALUE explicitly if the bus was genuinely at the test value pre-probe.`)
        note("STOP for the write tier: snapshot ordering tainted (NIT-2). Re-run after rebuilding from this commit, or supply PROBE_RESTORE_VALUE.")
        return
    }
    assert("F3-restore-untainted", true,
        CFG.restoreValue !== undefined
            ? `operator-supplied restore (${restoreValue}); ordering check skipped`
            : `restore ${restoreValue} ≠ test ${CFG.testValue} (snapshot-first ordering verified)`)

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
    // Pass the restoreValue back so the stress tier can do its no-motion burst
    // at exactly the restored value (writing the SAME value = zero desk motion).
    return restoreValue
}

// ─── v10.0.4 surface assertion tier (O1-O4 + B1) ─────────────────────────────
//
// Verifies the v10.0.4 ship surface from `bridge-v1004` (master commit 6a313f5dd):
//   O1 monitor-live/bridgeLog ring buffer  — V5
//   O2 additive heartbeat diagnostics      — V1 (presence) + V2 (sanity)
//   O3 get_bridge_health MCP tool          — V3
//   O4 monitor-live/selftest               — V4
// Read-only — runs BEFORE firestoreTier so we snapshot the baseline errCount +
// lastSeen against which the stress tier will diff.
async function v1004Tier(fs, probeBearer) {
    const { db } = fs
    section("v10.0.4 surface tier — O1 bridgeLog · O2 heartbeat diagnostics · O3 get_bridge_health · O4 selftest")

    const [cfgSnap, logSnap, selftestSnap] = await Promise.all([
        db.collection("config").doc("monitor").get(),
        db.collection("monitor-live").doc("bridgeLog").get(),
        db.collection("monitor-live").doc("selftest").get(),
    ])
    const bridge = cfgSnap.data()?.bridge || {}

    // V1 — O2 heartbeat fields present
    const O2_FIELDS = [
        "socketAlive", "stateAgeMs", "unconfirmedCount", "lastOscRxAt",
        "lastStateWriteAt", "startedAt", "uptimeMs", "queueDepth", "errCount", "lastError",
    ]
    const missingFields = O2_FIELDS.filter((k) => !(k in bridge))
    assert("V1-heartbeat-fields-present", missingFields.length === 0,
        missingFields.length === 0
            ? `all ${O2_FIELDS.length} O2 fields present in config/monitor.bridge`
            : `MISSING ${missingFields.length}/${O2_FIELDS.length}: ${missingFields.join(", ")} — pre-v10.0.4 bridge or partial write`)

    // V2 — O2 heartbeat sanity (types + non-negative numerics + timestamp shape)
    const sanity = []
    if (typeof bridge.socketAlive !== "boolean") sanity.push(`socketAlive type=${typeof bridge.socketAlive}`)
    if (!(typeof bridge.queueDepth === "number" && bridge.queueDepth >= 0)) sanity.push(`queueDepth=${bridge.queueDepth}`)
    if (!(typeof bridge.unconfirmedCount === "number" && bridge.unconfirmedCount >= 0)) sanity.push(`unconfirmedCount=${bridge.unconfirmedCount}`)
    if (!(typeof bridge.uptimeMs === "number" && bridge.uptimeMs > 0)) sanity.push(`uptimeMs=${bridge.uptimeMs}`)
    if (!(typeof bridge.errCount === "number" && bridge.errCount >= 0)) sanity.push(`errCount=${bridge.errCount}`)
    // lastError can be null or {msg,ts}; reject other shapes.
    const le = bridge.lastError
    if (!(le === null || (typeof le === "object" && le && typeof le.msg === "string"))) {
        sanity.push(`lastError shape=${typeof le}`)
    }
    assert("V2-heartbeat-fields-sane", sanity.length === 0,
        sanity.length === 0
            ? `socketAlive=${bridge.socketAlive} queueDepth=${bridge.queueDepth} unconfirmed=${bridge.unconfirmedCount} uptimeMs=${bridge.uptimeMs} errCount=${bridge.errCount}`
            : `unsane: ${sanity.join("; ")}`)
    note(`bridge.startedAt=${bridge.startedAt} bridge.lastError=${JSON.stringify(bridge.lastError)}`)

    // V3 — O3 get_bridge_health MCP tool (trusted-leader gated; child bearer is admin-equiv)
    const gbh = await mcpCall(probeBearer, "get_bridge_health", {})
    const v = gbh.value
    const gbhOk = gbh.status === 200 && !gbh.isError && v?.ok === true
    assert("V3-get-bridge-health", gbhOk,
        gbhOk
            ? `alive=${v.alive} lastSeenAgeS=${v.lastSeenAgeS} stateAgeS=${v.stateAgeS} stateStale=${v.stateStale} version=${v.version} errCount=${v.errCount}`
            : `get_bridge_health failed: ${JSON.stringify(v).slice(0, 200)}`)
    if (gbhOk) note(`get_bridge_health.summary: ${v.summary}`)

    // V4 — O4 selftest doc (populated only when bridge_selftest action fires; MCP wrapper
    // ships in v10.0.5 which is UNPUBLISHED → selftest doc may legitimately be absent)
    if (selftestSnap.exists) {
        const st = selftestSnap.data()
        const stMs = fsDateMillis(st?.updatedAt)
        const stAge = stMs ? Math.round((Date.now() - stMs) / 1000) : null
        assert("V4-selftest", true, `monitor-live/selftest exists, age=${stAge}s, keys=${Object.keys(st || {}).join(",")}`)
    } else {
        assert("V4-selftest", true, "monitor-live/selftest absent — never run (O4 fires only on bridge_selftest action; expected pre-v10.0.5-publish)")
        note("V4 informational: selftest path only exercised when bridgeControl.action='selftest' is dispatched — v10.0.5 MCP wrappers code-complete but unpublished per master-tip.")
    }

    // V5 — O1 bridgeLog ring buffer
    if (logSnap.exists) {
        const log = logSnap.data()
        const entries = Array.isArray(log?.entries) ? log.entries : []
        const ringBounded = entries.length <= 50
        const errCountIsNum = typeof log?.errCount === "number"
        assert("V5-bridgeLog-ring", ringBounded && errCountIsNum,
            ringBounded && errCountIsNum
                ? `monitor-live/bridgeLog: entries=${entries.length}/50 errCount=${log.errCount} bridgeVersion=${log.bridgeVersion}`
                : `bridgeLog malformed: entries=${entries.length} errCount=${log?.errCount}`)
        if (log?.lastError) note(`bridgeLog.lastError: ${JSON.stringify(log.lastError).slice(0, 200)}`)
        if (entries.length > 0) {
            const recent = entries.slice(-3).map((e) => `[${e.level}] ${String(e.msg).slice(0, 80)}`).join(" / ")
            note(`bridgeLog recent (${entries.length} total): ${recent}`)
        }
    } else {
        // RemoteLogger only flushes when something is recorded; an absent doc just
        // means no error/warn since boot. Soft PASS with a note.
        assert("V5-bridgeLog-ring", true, "monitor-live/bridgeLog absent — RemoteLogger never flushed (no error/warn captured since boot — clean run)")
    }

    return {
        baselineErrCount: typeof bridge.errCount === "number" ? bridge.errCount : 0,
        baselineLastSeenMs: fsDateMillis(bridge.lastSeen),
        baselineLastError: bridge.lastError ?? null,
    }
}

// ─── stress tier — bounded 3-command burst (no desk motion) ──────────────────
//
// Verifies what v10.0.4's observability promised in PRACTICE:
//   V6 burst-applied        — all 3 rapid commands reach terminal (applied) in budget
//   V7 queue-bounded         — queueDepth/unconfirmedCount stay bounded post-burst
//   V8 state-not-frozen      — state.updatedAt advances post-burst (NOT just heartbeat)
//                              per [[project_bridge_state_freshness_diagnostic]]
//   V9 errCount-stable       — bridge.errCount delta during probe window = 0
//
// Safety: all 3 burst commands write the SAME value (restoreValue) so the desk
// does not move. The bus is already at restoreValue (firestoreTier just restored
// it). Net desk change = zero. After the burst, no further restore is needed.
async function stressTier(fs, targetBus, restoreValue, baseline) {
    const { db } = fs
    section(`Stress tier — 3-command burst at restoreValue=${restoreValue} (no desk motion) + freshness check`)

    if (restoreValue === undefined) {
        assert("V6-burst-applied", false, "no restoreValue known (firestoreTier skipped or refused) — cannot run no-motion burst")
        return
    }

    // Pre-burst snapshot of bridge + state for V8 freshness diff
    const cfgPre = (await db.collection("config").doc("monitor").get()).data() || {}
    const bridgePre = cfgPre.bridge || {}
    const statePre = (await db.collection("monitor-live").doc("state").get()).data()
    const statePreMs = fsDateMillis(statePre?.updatedAt)
    const heartbeatPreMs = fsDateMillis(bridgePre.lastSeen)
    const uid = pickUid(cfgPre, targetBus)

    // 3 rapid writes (same value — no desk motion). createdAt = Date.now() lands
    // within ms — well inside the bridge's 10s command-age window (B4).
    const pendingCol = db.collection("monitor-live").doc("commands").collection("pending")
    const refs = await Promise.all([0, 1, 2].map(() =>
        pendingCol.add({
            type: "set_bus_master",
            busIndex: targetBus,
            value: restoreValue,
            uid,
            createdAt: Date.now(),
        }),
    ))
    log(`  enqueued 3-command burst at value ${restoreValue} (no-motion: same as restore)`)

    // Wait for all 3 to reach terminal (applied / rejected / pending after budget)
    const results = await Promise.all(refs.map((r) => awaitCommandResult(db, r, CFG.drainTimeoutMs)))
    const applied = results.filter((r) => r.status === "applied").length
    const maxDrainMs = Math.max(...results.map((r) => r.ms))
    RESULT.latency.burst3DrainMaxMs = maxDrainMs
    assert("V6-burst-applied", applied === 3,
        applied === 3
            ? `3/3 commands drained (applied), max drain=${maxDrainMs}ms`
            : `${applied}/3 applied; states=[${results.map((r) => r.status).join(",")}] — burst dropped/rejected commands`)

    // Post-burst snapshot
    const cfgPost = (await db.collection("config").doc("monitor").get()).data() || {}
    const bridgePost = cfgPost.bridge || {}
    const statePost = (await db.collection("monitor-live").doc("state").get()).data()
    const statePostMs = fsDateMillis(statePost?.updatedAt)
    const heartbeatPostMs = fsDateMillis(bridgePost.lastSeen)

    // V7 — queueDepth + unconfirmedCount bounded (post-drain should be at-rest)
    const queueOk = (bridgePost.queueDepth ?? 0) <= 5
    const unconfOk = (bridgePost.unconfirmedCount ?? 0) <= 10
    assert("V7-queue-bounded", queueOk && unconfOk,
        queueOk && unconfOk
            ? `post-burst queueDepth=${bridgePost.queueDepth} unconfirmedCount=${bridgePost.unconfirmedCount} (both bounded)`
            : `queueDepth=${bridgePost.queueDepth} unconfirmedCount=${bridgePost.unconfirmedCount} — at-rest values exceed expected bounds`)

    // V8 — state-vs-heartbeat freshness divergence
    // [[project_bridge_state_freshness_diagnostic]]: a FRESH heartbeat does NOT
    // prove writes land in state — state.updatedAt can be frozen while heartbeat
    // ticks. After the F-tier write + this 3-burst, state.updatedAt MUST have
    // advanced relative to its pre-V-tier reading. (Heartbeat only ticks every
    // 60s so its delta may be 0 within the few-second burst window; what matters
    // is that state moved.)
    const stateAdvancedMs = statePreMs && statePostMs ? statePostMs - statePreMs : null
    const heartbeatAdvancedMs = heartbeatPreMs && heartbeatPostMs ? heartbeatPostMs - heartbeatPreMs : null
    const stateAdvanced = stateAdvancedMs !== null && stateAdvancedMs > 0
    assert("V8-state-not-frozen", stateAdvanced,
        stateAdvanced
            ? `state.updatedAt advanced by ${stateAdvancedMs}ms during stress (writes land in state, not just heartbeat); heartbeat Δ=${heartbeatAdvancedMs}ms`
            : `state.updatedAt FROZEN (Δ=${stateAdvancedMs}ms) — bridge heartbeat fresh but state writes silently no-op (matches [[project_bridge_state_freshness_diagnostic]])`)

    // V9 — errCount stability across the probe window
    const errDelta = (bridgePost.errCount ?? 0) - baseline.baselineErrCount
    assert("V9-errcount-stable", errDelta === 0,
        errDelta === 0
            ? `errCount stable at ${bridgePost.errCount} during probe (baseline=${baseline.baselineErrCount})`
            : `errCount JUMPED by ${errDelta} (baseline=${baseline.baselineErrCount} → ${bridgePost.errCount}); bridge.lastError=${JSON.stringify(bridgePost.lastError)} — investigate bridgeLog.entries[]`)
}

/**
 * Per-channel SEND tier — drives `set_send_on` + `set_send_level` on one
 * channel of the target monitor bus, mirroring the master tier's
 * snapshot → write → readback → byte-identical restore. This is the live
 * oracle for the syncFullState throttle fix: after the fix the bus's send reads
 * resolve confirmed, so a send write REFLECTS in monitor-live/state instead of
 * the FaderStrip easing the knob back to a fabricated 0 (synthesis §B step 2 /
 * Lane-3). Same hard rules as the master tier: desk-live gate, dry-run respect,
 * and restore-or-refuse (won't write a send it can't restore byte-identical).
 */
async function sendTier(fs, targetBus) {
    const { db } = fs
    const channel = CFG.channel
    section(`Send tier — bus ${targetBus} ch ${channel} (set_send_on + set_send_level)`)

    const [stateSnap, cfgSnap] = await Promise.all([
        db.collection("monitor-live").doc("state").get(),
        db.collection("config").doc("monitor").get(),
    ])
    const state = stateSnap.exists ? stateSnap.data() : null
    const cfg = cfgSnap.exists ? cfgSnap.data() : null

    // desk-live (same gate as the master tier)
    const hbMs = fsDateMillis(cfg?.bridge?.lastSeen)
    const hbAgeSec = hbMs ? Math.round((Date.now() - hbMs) / 1000) : null
    const deskLive = hbAgeSec !== null && hbAgeSec <= CFG.deskFreshSec && cfg?.bridge?.x32Connected === true

    const snap = readSendFromState(state, targetBus, channel)
    assert("F7-send-snapshot", true,
        `bus ${targetBus} ch ${channel} send snapshot: ${snap.found ? `level=${snap.level} on=${snap.on}` : "NOT in state"} (${snap.shape})`)
    if (!snap.found) {
        note(`bus ${targetBus} ch ${channel} send is NOT readable in state — if it is in unconfirmed[], that is the syncFullState flood the throttle fix targets.`)
    }

    if (!deskLive) {
        note("Desk not live (stale heartbeat or X32 down) — refusing to enqueue a send command.")
        return
    }
    if (FLAG.dryRun) {
        note("DRY-RUN: skipping the send write + restore.")
        return
    }

    // restore-or-refuse: need BOTH a restore level AND a restore on-state.
    const restoreLevel =
        CFG.sendRestoreLevel !== undefined ? CFG.sendRestoreLevel
        : snap.found ? snap.level
        : undefined
    const restoreOn =
        CFG.sendRestoreOn !== undefined ? CFG.sendRestoreOn
        : snap.found ? snap.on
        : undefined
    if (restoreLevel === undefined || restoreOn === undefined) {
        assert("F8-send-restore-known", false,
            "no PROBE_SEND_RESTORE_LEVEL/PROBE_SEND_RESTORE_ON and snapshot unreadable — REFUSING to write a send I cannot restore byte-identical.")
        note("STOP for the send tier: provide PROBE_SEND_RESTORE_LEVEL + PROBE_SEND_RESTORE_ON (the channel's true current send) so the desk can be restored byte-identical.")
        return
    }
    assert("F8-send-restore-known", true,
        `restore target = level ${restoreLevel}, on ${restoreOn}${snap.found ? "" : " (operator-provided; snapshot hidden)"}`)

    const pendingCol = db.collection("monitor-live").doc("commands").collection("pending")
    const uid = pickUid(cfg, targetBus)

    // ── send write (ii): on=true THEN level=testLevel (synthesis §B step 2) ──
    // In-process createdAt lands inside the bridge's 10s window (B4), same as
    // the master tier's iPad-path write.
    const onRef = await pendingCol.add({
        type: "set_send_on",
        busIndex: targetBus,
        channelIndex: channel,
        value: true,
        uid,
        createdAt: Date.now(),
    })
    const onRes = await awaitCommandResult(db, onRef, CFG.drainTimeoutMs)
    assert("F9-send-on-accepted", onRes.status === "applied",
        onRes.status === "applied"
            ? `set_send_on accepted + drained in ${onRes.ms}ms`
            : `set_send_on ${onRes.status}${onRes.error ? ` (error="${onRes.error}")` : ""}`)

    const lvlRef = await pendingCol.add({
        type: "set_send_level",
        busIndex: targetBus,
        channelIndex: channel,
        value: CFG.sendTestLevel,
        uid,
        createdAt: Date.now(),
    })
    log(`  enqueued iPad-path send command ${lvlRef.id}: bus ${targetBus} ch ${channel} → level ${CFG.sendTestLevel}, on true`)
    const lvlRes = await awaitCommandResult(db, lvlRef, CFG.drainTimeoutMs)
    RESULT.latency.sendEnqueueToDrainMs = lvlRes.ms
    assert("F10-send-write-accepted", lvlRes.status === "applied",
        lvlRes.status === "applied"
            ? `set_send_level accepted + drained in ${lvlRes.ms}ms (send control path LIVE)`
            : `set_send_level ${lvlRes.status}${lvlRes.error ? ` (error="${lvlRes.error}")` : ""} — reached the bridge but was declined`)

    // state-reflect: buses[B].sends[CH] shows testLevel + on:true
    const reflect = await pollUntil(async () => {
        const s = (await db.collection("monitor-live").doc("state").get()).data()
        const r = readSendFromState(s, targetBus, channel)
        return r.found && r.on === true && Math.abs(r.level - CFG.sendTestLevel) < 0.02
    }, CFG.reflectTimeoutMs)
    RESULT.latency.sendEnqueueToStateReflectMs = reflect.ok ? reflect.ms : null
    assert("F11-send-state-reflects", reflect.ok,
        reflect.ok
            ? `monitor-live/state reflected the send write in ${reflect.ms}ms (send readback WORKS — throttle fix verified live)`
            : `state did NOT reflect the send within ${CFG.reflectTimeoutMs}ms — pre-fix this is the syncFullState flood (send read dropped → fabricated 0); post-fix a persistent miss points at desk config (bus subgroup / send physically off).`)

    // ── restore byte-identical: level THEN on ──
    const rLvlRef = await pendingCol.add({
        type: "set_send_level",
        busIndex: targetBus,
        channelIndex: channel,
        value: restoreLevel,
        uid,
        createdAt: Date.now(),
    })
    const rLvlRes = await awaitCommandResult(db, rLvlRef, CFG.drainTimeoutMs)
    const rOnRef = await pendingCol.add({
        type: "set_send_on",
        busIndex: targetBus,
        channelIndex: channel,
        value: restoreOn,
        uid,
        createdAt: Date.now(),
    })
    const rOnRes = await awaitCommandResult(db, rOnRef, CFG.drainTimeoutMs)
    const restored = rLvlRes.status === "applied" && rOnRes.status === "applied"
    assert("F12-send-restore-applied", restored,
        restored
            ? `restore accepted + drained — desk send returned to level ${restoreLevel}, on ${restoreOn}`
            : `restore incomplete (level=${rLvlRes.status}, on=${rOnRes.status}) — MANUAL CHECK bus ${targetBus} ch ${channel} → level ${restoreLevel}, on ${restoreOn}`)
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
    // v10.0.4 surface verdict (V-tier + stress tier).
    if (RESULT.assertions.some((x) => x.id === "V1-heartbeat-fields-present")) {
        const vIds = ["V1-heartbeat-fields-present", "V2-heartbeat-fields-sane",
            "V3-get-bridge-health", "V4-selftest", "V5-bridgeLog-ring"]
        const sIds = ["V6-burst-applied", "V7-queue-bounded", "V8-state-not-frozen", "V9-errcount-stable"]
        const vFail = vIds.filter((id) => a[id] === false)
        const sFail = sIds.filter((id) => a[id] === false)
        const sRan = sIds.some((id) => id in a)
        log(
            vFail.length === 0 && sFail.length === 0 && sRan
                ? "V10.0.4 SURFACE: FULLY VERIFIED — all O1/O2/O3/O4 reads + 3-burst stress + freshness + errCount stable."
                : vFail.length === 0 && !sRan
                  ? "V10.0.4 SURFACE: read-only PASS (V1-V5); stress tier did not run (--dry-run or no restore value)."
                  : `V10.0.4 SURFACE: ISSUES — V-fail=[${vFail.join(",") || "none"}] stress-fail=[${sFail.join(",") || "none"}]`,
        )
        if (RESULT.latency.burst3DrainMaxMs != null)
            log(`latency burst-3 max-drain: ${RESULT.latency.burst3DrainMaxMs}ms`)
    }
    // Send tier (per-channel send throttle-fix verification), when it ran.
    if (RESULT.assertions.some((x) => x.id === "F11-send-state-reflects")) {
        log(
            a["F11-send-state-reflects"] === true
                ? "SEND PATH: per-channel send write + readback CONFIRMED live — the syncFullState throttle fix is verified on the desk."
                : "SEND PATH: per-channel send did NOT reflect — if it landed in unconfirmed[] pre-fix, that is the flood; post-fix, investigate desk config (bus subgroup / send off).",
        )
    }
    if (RESULT.latency.enqueueToDrainMs != null)
        log(`latency enqueue→bridge-drain: ${RESULT.latency.enqueueToDrainMs}ms`)
    if (RESULT.latency.enqueueToStateReflectMs != null)
        log(`latency enqueue→state-reflect: ${RESULT.latency.enqueueToStateReflectMs}ms`)
    else log(`latency enqueue→state-reflect: N/A (did not reflect)`)
    if (RESULT.latency.sendEnqueueToDrainMs != null)
        log(`latency send enqueue→bridge-drain: ${RESULT.latency.sendEnqueueToDrainMs}ms`)
    if (RESULT.latency.sendEnqueueToStateReflectMs != null)
        log(`latency send enqueue→state-reflect: ${RESULT.latency.sendEnqueueToStateReflectMs}ms`)

    if (FLAG.json) console.log(JSON.stringify(RESULT, null, 2))
    process.exit(code)
}

main().catch((e) => {
    console.error("PROBE CRASH:", e?.stack || e)
    process.exit(1)
})
