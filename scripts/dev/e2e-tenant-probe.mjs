#!/usr/bin/env node
/**
 * Multi-tenant phase 9 — the N-tenant isolation probe, against production.
 *
 * The Brothers Lazaroff probe this replaces (`e2e-bl-tenant-probe.mjs`) knew two
 * tenants by name, addressed them both at CRC's host, and borrowed David's real
 * account for the BL side. None of that scales to a platform that adds tenants,
 * and borrowing a real multi-tenant account means a pass can't distinguish "the
 * seam holds" from "that person is a member of both". This probe reads the
 * tenants from the registry, addresses each at its own host, and runs on
 * throwaway identities minted by `mint-throwaway-bearer.ts` — one per tenant,
 * member of that tenant only, owning nothing until the probe creates it.
 *
 * Every ORDERED pair (A, B) is run, not every unordered one: "B cannot see A"
 * and "A cannot see B" are different claims, and a seam can leak one way.
 *
 * Per tenant A, at A's own address:
 *   - A lists its own setlists and creates one
 *   - A's congregation identity is A's, by the registry's name
 *
 * Per ordered pair (A, B), with B's bearer at B's address:
 *   - B cannot get, update or delete A's setlist by id (not-found wall)
 *   - A's setlist is unchanged afterwards (no partial mutation)
 *   - B's lists share no id with A's: setlists, templates, musicians, contacts
 *   - B's congregation identity is not A's
 *   - an A user is refused at B's address on the web surface (403)
 *
 * Then the browser-SDK leg (`--rules`), which is the only part that exercises
 * the DEPLOYED Firestore and Storage rules rather than server code: each
 * tenant's probe user signs in for real and tries to read and write the other
 * tenants' documents and chart bytes directly.
 *
 * Everything the probe creates is deleted at the end, pass or fail.
 *
 * Usage:
 *   node scripts/dev/e2e-tenant-probe.mjs --secrets <dir> [--only crc,navatehila] [--rules]
 *
 * `--secrets <dir>` holds one `<orgId>.json` per tenant (the `--out` of
 * mint-throwaway-bearer.ts) plus `platform.json`. Nothing is read from argv, so
 * no credential lands in a shell history or a process list.
 *
 * Exit 0 = every assertion passed.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const argOf = (f) => {
    const i = args.indexOf(f)
    return i >= 0 ? args[i + 1] : undefined
}
const SECRETS = argOf("--secrets")
const ONLY = argOf("--only")?.split(",").map((s) => s.trim()).filter(Boolean)
const WITH_RULES = args.includes("--rules")

if (!SECRETS) {
    console.error("FATAL: --secrets <dir> is required (see the header).")
    process.exit(1)
}

const pass = []
const fail = []
function check(name, ok, detail = "") {
    ;(ok ? pass : fail).push(name)
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

// ── secrets ─────────────────────────────────────────────────────────────────
const secrets = {}
for (const f of readdirSync(SECRETS)) {
    if (!f.endsWith(".json")) continue
    const j = JSON.parse(readFileSync(join(SECRETS, f), "utf8"))
    secrets[f.replace(/\.json$/, "")] = j
}
const platform = secrets.platform
if (!platform?.bearer) {
    console.error(`FATAL: ${SECRETS}/platform.json is missing or has no bearer.`)
    process.exit(1)
}

// ── MCP transport (JSON-RPC over SSE, as the route speaks it) ───────────────
let idSeq = 1
async function rpc(endpoint, bearer, method, params) {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: idSeq++, method, params }),
    })
    const text = await res.text()
    const dataLines = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())
    const raw = dataLines.length ? dataLines[dataLines.length - 1] : text.trim()
    try {
        return JSON.parse(raw)
    } catch {
        return { __unparsed: raw, __status: res.status }
    }
}

async function callTool(endpoint, bearer, name, toolArgs = {}) {
    const r = await rpc(endpoint, bearer, "tools/call", { name, arguments: toolArgs })
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

/** A cross-tenant read or write must come back as nothing, not as data. */
function isDenied(v) {
    if (v === null || v === undefined) return true
    if (typeof v === "object") {
        if (v.ok === false) return true
        if (v.error) return true
        if (v.isError) return true
    }
    return false
}

const asRows = (v, ...keys) => {
    if (Array.isArray(v)) return v
    for (const k of keys) if (v && Array.isArray(v[k])) return v[k]
    return []
}
const idsOf = (rows) =>
    new Set(rows.map((r) => r?.id ?? r?.setlistId ?? r?.templateId ?? r?.contactId ?? r?.uid).filter(Boolean))

// ── the registry decides which tenants exist ────────────────────────────────
const PLATFORM_MCP = process.env.PLATFORM_MCP || "https://www.centralreform.live/api/platform/mcp"

async function loadTenants() {
    const list = await callTool(PLATFORM_MCP, platform.bearer, "list_tenants", {})
    const rows = asRows(list, "tenants")
    return rows
        .filter((t) => t.status === "active")
        .filter((t) => !ONLY || ONLY.includes(t.orgId))
        .map((t) => ({
            orgId: t.orgId,
            name: t.name,
            // A tenant answers on its primary address; that is where its own
            // callers reach it, so that is where the probe addresses it.
            origin: `https://${t.primaryAddress.includes(".vercel.app") ? t.primaryAddress : `www.${t.primaryAddress.replace(/^www\./, "")}`}`,
        }))
}

/**
 * Which tenants a collection is deliberately open to, from the platform
 * registry. A chart in a shared collection crossing a tenant line is the
 * sharing feature working — Nava's `nava` collection is shared with CRC, and
 * calling that a leak would be the probe misreading its own fixture.
 */
let sharedWith = new Map()
async function loadSharing() {
    const rows = asRows(await callTool(PLATFORM_MCP, platform.bearer, "list_collections", {}), "collections")
    sharedWith = new Map(
        rows.map((c) => [c.id, new Set([c.ownerOrgId, ...(c.sharedWith ?? []), ...(c.assignedTo ?? [])])]),
    )
}

/** A chart A owns that B has no claim on — the only fair cross-tenant target. */
function privateChartOf(A, aOrg, bOrg) {
    return (
        A.charts.find((c) => {
            const open = sharedWith.get(`${aOrg}__${c.collection}`)
            return !open || !open.has(bOrg)
        }) ?? null
    )
}

// ── the web surface: an ID token, exchanged from the minted custom token ────
const WEB_KEY = process.env.FIREBASE_WEB_API_KEY
async function idTokenFor(tenant) {
    const custom = secrets[tenant.orgId]?.customToken
    if (!custom || !WEB_KEY) return null
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: custom, returnSecureToken: true }),
        },
    )
    const j = await res.json()
    return j.idToken ?? null
}

async function main() {
    const tenants = await loadTenants()
    await loadSharing()
    console.log(`# N-tenant isolation probe — ${tenants.length} active tenants: ${tenants.map((t) => t.orgId).join(", ")}\n`)

    const missing = tenants.filter((t) => !secrets[t.orgId]?.bearer)
    if (missing.length) {
        console.error(`FATAL: no probe bearer for ${missing.map((t) => t.orgId).join(", ")}. Mint one per tenant first.`)
        process.exit(1)
    }

    // The personas live an hour. Check every one of them BEFORE asserting
    // anything: an expired bearer otherwise fails forty assertions at once and
    // reads like a catastrophic isolation break instead of a stale credential.
    const stale = []
    for (const t of tenants) {
        const probe = await rpc(`${t.origin}/api/mcp`, secrets[t.orgId].bearer, "tools/call", {
            name: "get_congregation_context",
            arguments: {},
        })
        if (probe?.error || probe?.__status === 401 || !probe?.result) stale.push(t.orgId)
    }
    if (stale.length) {
        console.error(
            `FATAL: the probe credential for ${stale.join(", ")} is not working — most likely expired ` +
                `(an admin-test persona lasts an hour). Re-mint with mint-throwaway-bearer.ts and run again.`,
        )
        process.exit(1)
    }

    // ── per tenant: it works at its own address, and it is itself ───────────
    const state = {}
    for (const t of tenants) {
        const endpoint = `${t.origin}/api/mcp`
        const bearer = secrets[t.orgId].bearer
        console.log(`## ${t.orgId} @ ${t.origin}`)

        const list0 = await callTool(endpoint, bearer, "list_setlists", { limit: 100 })
        check(`${t.orgId} list_setlists answers at its own address`, Array.isArray(list0), `count=${asRows(list0).length}`)

        const created = await callTool(endpoint, bearer, "create_setlist", {
            name: `P9 isolation probe (${t.orgId} — safe to delete)`,
        })
        const setlistId = created?.setlistId
        check(`${t.orgId} create_setlist succeeds`, !!setlistId, setlistId ? `id=${setlistId}` : JSON.stringify(created))

        const cong = await callTool(endpoint, bearer, "get_congregation_context", {})
        const congName = cong?.congregation?.name ?? ""
        check(`${t.orgId} congregation identity is its own`, congName === t.name, `name="${congName}" expected="${t.name}"`)

        state[t.orgId] = {
            endpoint,
            bearer,
            setlistId,
            setlistName: created?.name ?? `P9 isolation probe (${t.orgId} — safe to delete)`,
            setlists: idsOf(asRows(list0)),
            templates: idsOf(asRows(await callTool(endpoint, bearer, "list_templates", {}), "templates")),
            musicians: idsOf(asRows(await callTool(endpoint, bearer, "list_musicians", {}), "musicians", "rows")),
            contacts: idsOf(asRows(await callTool(endpoint, bearer, "list_contacts", {}), "contacts", "rows")),
            congregation: congName,
            // A chart this tenant OWNS, to aim at from the others. Owner, not
            // merely visible: a tenant's library legitimately shows charts
            // another tenant shared with it (CRC sees Nava's `nava`
            // collection), and pointing the probe at one of those would call
            // the sharing feature a leak. A tenant with no charts of its own
            // simply contributes no target.
            charts: asRows(await callTool(endpoint, bearer, "list_library", { limit: 500 }), "rows", "items", "files")
                .filter((r) => r?.ownerOrgId === t.orgId && (r?.fileId ?? r?.id))
                .map((r) => ({ fileId: r.fileId ?? r.id, collection: r.collection ?? "" })),
            // From the platform surface, not from the tenant's own roster: the
            // roster must not be the only witness that its names belong here.
            members: new Set(
                asRows(await callTool(PLATFORM_MCP, platform.bearer, "list_tenant_members", { orgId: t.orgId }), "members")
                    .map((m) => m?.uid)
                    .filter(Boolean),
            ),
        }
        console.log("")
    }

    // ── every ordered pair ──────────────────────────────────────────────────
    for (const a of tenants) {
        for (const b of tenants) {
            if (a.orgId === b.orgId) continue
            const A = state[a.orgId]
            const B = state[b.orgId]
            console.log(`## ${b.orgId} against ${a.orgId}`)

            if (A.setlistId) {
                const got = await callTool(B.endpoint, B.bearer, "get_setlist", { id: A.setlistId })
                check(`${b.orgId} cannot get ${a.orgId}'s setlist by id`, isDenied(got), `target=${A.setlistId}`)

                const upd = await callTool(B.endpoint, B.bearer, "update_setlist", {
                    id: A.setlistId,
                    name: `HIJACKED BY ${b.orgId} — must never land`,
                })
                check(
                    `${b.orgId} cannot rename ${a.orgId}'s setlist`,
                    upd?.error?.machine_code === "setlist_not_found" || isDenied(upd),
                    JSON.stringify(upd?.error?.machine_code ?? upd),
                )

                const del = await callTool(B.endpoint, B.bearer, "delete_setlist", { id: A.setlistId })
                check(
                    `${b.orgId} cannot delete ${a.orgId}'s setlist`,
                    del?.error?.machine_code === "setlist_not_found" || isDenied(del),
                    JSON.stringify(del?.error?.machine_code ?? del),
                )

                // The attack must leave nothing behind: present, and still named
                // what A named it.
                const reread = await callTool(A.endpoint, A.bearer, "get_setlist", { id: A.setlistId })
                check(
                    `${a.orgId}'s setlist survives ${b.orgId}'s attempt, name intact`,
                    !isDenied(reread) && reread?.name === A.setlistName,
                    `name="${reread?.name}"`,
                )
            }

            const bList = idsOf(asRows(await callTool(B.endpoint, B.bearer, "list_setlists", { limit: 100 })))
            const leaked = [...A.setlists].filter((id) => bList.has(id))
            check(`${b.orgId}'s setlists share no id with ${a.orgId}'s`, leaked.length === 0, `leaked=${leaked.length}`)

            // Templates and contacts are documents a tenant owns, so an id in
            // both lists would be one tenant reading the other's row.
            for (const kind of ["templates", "contacts"]) {
                const overlap = [...A[kind]].filter((id) => B[kind].has(id))
                check(
                    `${b.orgId}'s ${kind} share no id with ${a.orgId}'s`,
                    overlap.length === 0,
                    `a=${A[kind].size} b=${B[kind].size} overlap=${overlap.length}`,
                )
            }

            // Musicians are PEOPLE, and the same person can legitimately play
            // for two tenants — most of Brothers Lazaroff is also on CRC's
            // roster. So an overlapping uid is not a leak by itself; the claim
            // that matters is that every name on a roster is a member of THAT
            // tenant. The membership list from the platform surface is the
            // independent answer, rather than the roster vouching for itself.
            const strangers = [...B.musicians].filter((uid) => !B.members.has(uid))
            check(
                `${b.orgId}'s roster holds only ${b.orgId} members`,
                strangers.length === 0,
                `roster=${B.musicians.size} strangers=${strangers.length}${strangers.length ? ` (${strangers.slice(0, 3).join(", ")})` : ""}`,
            )

            check(
                `${b.orgId}'s congregation identity is not ${a.orgId}'s`,
                B.congregation !== A.congregation,
                `b="${B.congregation}"`,
            )

            // Identity, not just data: B's admin must not be able to create an
            // account inside A. The test-account tools live on the ops
            // surface, so that is where this is asked.
            const planted = await callTool(`${b.origin}/api/ops/mcp`, B.bearer, "create_test_account", {
                role: "musician",
                orgIds: [a.orgId],
                uidPrefix: "p9x",
                ttlSec: 600,
            })
            check(
                `${b.orgId} cannot plant an account inside ${a.orgId}`,
                planted?.error?.machine_code === "forbidden_tenant" || isDenied(planted),
                JSON.stringify(planted?.error?.machine_code ?? planted).slice(0, 80),
            )

            // Chart bytes. The browser never reads Storage directly — every
            // byte goes through this route on the Admin SDK — so this, not
            // the Storage rules, is the door that matters. A chart A shares
            // with B is a different question (phase 5 handles sharing); this
            // asks only whether B can open a chart that is A's alone.
            const target = privateChartOf(A, a.orgId, b.orgId)
            if (target) {
                const got = await callTool(B.endpoint, B.bearer, "download_chart", { fileId: target.fileId })
                check(`${b.orgId} cannot open ${a.orgId}'s chart by fileId`, isDenied(got), `fileId=${target.fileId}`)
            }

            // Web surface: A's person, at B's address.
            const idToken = await idTokenFor(a)
            if (!idToken) {
                check(`${a.orgId} user is refused at ${b.orgId}'s address`, false, "no ID token (set FIREBASE_WEB_API_KEY)")
            } else {
                // Minting a connector token is the host-gated act: the token is
                // for the tenant of the address you are on, and no membership
                // there means no token. (A GET on the same path lists your own
                // tokens and is deliberately tenant-blind, so it proves
                // nothing here.) The one minted at A is revoked again — the
                // doc stays as a tombstone, which is how revocation works.
                const mint = (origin) =>
                    fetch(`${origin}/api/mcp/tokens`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ label: "P9 probe (deleted immediately)" }),
                    })

                const atB = await mint(b.origin)
                check(`${a.orgId} user cannot mint a connector token at ${b.orgId}'s address`, atB.status === 403, `status=${atB.status}`)

                const atA = await mint(a.origin)
                check(`${a.orgId} user can mint one at its own address`, atA.status === 200, `status=${atA.status}`)
                if (atA.status === 200) {
                    const { id } = await atA.json()
                    await fetch(`${a.origin}/api/mcp/tokens/${id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${idToken}` },
                    })
                }
            }
            console.log("")
        }
    }

    if (WITH_RULES) await rulesLeg(tenants, state)

    // ── cleanup: every probe setlist goes ───────────────────────────────────
    console.log("## cleanup")
    for (const t of tenants) {
        const S = state[t.orgId]
        if (!S.setlistId) continue
        await callTool(S.endpoint, S.bearer, "delete_setlist", { id: S.setlistId })
        const gone = await callTool(S.endpoint, S.bearer, "get_setlist", { id: S.setlistId })
        check(`${t.orgId} probe setlist deleted`, isDenied(gone))
    }
    // Deleting the id we remember is not the same as leaving nothing behind:
    // an earlier run of this probe left a setlist in a tenant and every
    // per-id check still passed, because the id it checked was a different
    // one. Sweep by NAME at the end, so a leftover from any run shows up.
    for (const t of tenants) {
        const S = state[t.orgId]
        const left = asRows(await callTool(S.endpoint, S.bearer, "list_setlists", { limit: 200 })).filter((s) =>
            typeof s?.name === "string" && s.name.startsWith("P9 isolation probe"),
        )
        check(
            `${t.orgId} has no probe setlist left from any run`,
            left.length === 0,
            left.length ? left.map((s) => s.id).join(", ") : "",
        )
    }

    console.log(`\n# RESULT: ${pass.length} passed, ${fail.length} failed`)
    if (fail.length) {
        console.log("# FAILED:", fail.join(" | "))
        process.exit(1)
    }
}

/**
 * The deployed rules, not the server's own checks. The probe user signs in for
 * real and goes at the other tenants' documents and chart bytes directly, the
 * way a hostile browser tab would.
 */
async function rulesLeg(tenants, state) {
    console.log("## deployed Firestore and Storage rules (browser SDK)")
    const { initializeApp, deleteApp } = await import("firebase/app")
    const { getAuth, signInWithCustomToken } = await import("firebase/auth")
    const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where, limit } = await import("firebase/firestore")
    const { getStorage, ref: storageRef, getDownloadURL } = await import("firebase/storage")

    for (const a of tenants) {
        const custom = secrets[a.orgId]?.customToken
        if (!custom || !WEB_KEY) {
            check(`${a.orgId} browser SDK sign-in`, false, "no custom token or FIREBASE_WEB_API_KEY")
            continue
        }
        const projectId = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
        const app = initializeApp(
            {
                apiKey: WEB_KEY,
                authDomain: `${projectId}.firebaseapp.com`,
                projectId,
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
            },
            `p9-${a.orgId}`,
        )
        try {
            const auth = getAuth(app)
            await signInWithCustomToken(auth, custom)
            check(`${a.orgId} browser SDK signs in`, !!auth.currentUser, auth.currentUser?.uid ?? "")
            const db = getFirestore(app)

            // Its own setlist is readable — the rules are not simply shut.
            if (state[a.orgId].setlistId) {
                let own = null
                try {
                    own = await getDoc(doc(db, "setlists", state[a.orgId].setlistId))
                } catch (e) {
                    own = { __err: e.code }
                }
                check(`${a.orgId} reads its own setlist through the rules`, own?.exists?.() === true, own?.__err ?? "")
            }

            for (const b of tenants) {
                if (b.orgId === a.orgId) continue
                const target = state[b.orgId].setlistId
                if (!target) continue

                // Single-document get on a setlist is public by design
                // (R-0919-audit-2); what must not cross is a LIST of another
                // tenant's rows, and any write at all.
                let listErr = null
                try {
                    await getDocs(query(collection(db, "setlists"), where("orgId", "==", b.orgId), limit(5)))
                } catch (e) {
                    listErr = e.code
                }
                check(`${a.orgId} cannot list ${b.orgId}'s setlists through the rules`, listErr === "permission-denied", listErr ?? "allowed")

                let writeErr = null
                try {
                    await setDoc(doc(db, "setlists", target), { name: `HIJACKED BY ${a.orgId}` }, { merge: true })
                } catch (e) {
                    writeErr = e.code
                }
                check(`${a.orgId} cannot write ${b.orgId}'s setlist through the rules`, writeErr === "permission-denied", writeErr ?? "ALLOWED — defect")

                let memberErr = null
                try {
                    await getDocs(query(collection(db, "memberships"), where("tenantId", "==", b.orgId), limit(5)))
                } catch (e) {
                    memberErr = e.code
                }
                check(`${a.orgId} cannot list ${b.orgId}'s memberships`, memberErr === "permission-denied", memberErr ?? "allowed")

                // Storage. Nothing in the app reads a chart this way, which is
                // exactly why it is worth asking: if the rules were wrong,
                // nothing else would notice.
                const bChart = privateChartOf(state[b.orgId], b.orgId, a.orgId)
                if (bChart) {
                    let storageErr = null
                    try {
                        await getDownloadURL(storageRef(getStorage(app), `library/${bChart.fileId}.pdf`))
                    } catch (e) {
                        storageErr = e.code
                    }
                    check(
                        `${a.orgId} cannot reach ${b.orgId}'s chart bytes in Storage`,
                        storageErr === "storage/unauthorized" || storageErr === "storage/object-not-found",
                        storageErr ?? "ALLOWED — defect",
                    )
                }
            }
        } finally {
            await deleteApp(app)
        }
    }
    console.log("")
}

main().catch((e) => {
    console.error(`\nFATAL: ${e.stack || e.message}`)
    process.exit(1)
})
