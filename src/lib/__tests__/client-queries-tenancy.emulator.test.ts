import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import {
    Timestamp,
    collection,
    getDocs,
    onSnapshot,
    query,
    where,
    type DocumentData,
    type Firestore,
    type Query,
} from "firebase/firestore"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { CLIENT_QUERIES } from "@/lib/tenant-query"

/**
 * Every real client query × every persona, as a one-off read AND as a live
 * listener (setlist sync redesign PR 2, 2026-11-03).
 *
 * The live tracks listener was refused for every band device from 2026-10-13
 * to 2026-11-03 because the tests ran getDocs with a different query than the
 * listener sent. Here each builder in CLIENT_QUERIES (the only place client
 * tenant queries are built; tenant-query-scan.test.ts enforces that) runs
 * through both getDocs and onSnapshot, for crc bl/mu/pe, Brothers Lazaroff
 * bl/mu, a crc-only member on a Brothers Lazaroff setlist, a signed-out
 * reader and the platform owner. Both tenants are seeded; an allowed query
 * must return rows and only rows the persona may see.
 */

const CRC = "crc"
const BL = "brotherslazaroff"
const ORGS = [CRC, BL] as const
type Org = (typeof ORGS)[number]
type Code = "bl" | "mu" | "pe"

interface Persona {
    id: string
    /** Tenant roles on the token; null = signed out. */
    m: Partial<Record<Org, Code>> | null
    po?: boolean
    /** The tenant whose setlist / site the persona is looking at. */
    host: Org
}

const PERSONAS: Persona[] = [
    { id: "crc-bl", m: { crc: "bl" }, host: CRC },
    { id: "crc-mu", m: { crc: "mu" }, host: CRC },
    { id: "crc-pe", m: { crc: "pe" }, host: CRC },
    { id: "bl-bl", m: { brotherslazaroff: "bl" }, host: BL },
    { id: "bl-mu", m: { brotherslazaroff: "mu" }, host: BL },
    { id: "crc-only-on-bl", m: { crc: "mu" }, host: BL },
    { id: "signed-out", m: null, host: CRC },
    { id: "po", m: {}, po: true, host: CRC },
]

const RANK: Record<string, number> = { ad: 4, bl: 3, mu: 2, me: 1, pe: 0 }

/** What the rules require of the caller for each query. */
type Need = "pe" | "me" | "bl" | "ad" | "self" | "po-only"

function allowed(p: Persona, need: Need): boolean {
    if (p.po) return true
    if (!p.m) return false
    if (need === "self") return true
    if (need === "po-only") return false
    const code = p.m[p.host]
    return code !== undefined && RANK[code] >= RANK[need]
}

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

interface Case {
    need: Need
    build: (db: Firestore, p: Persona) => Query
    /** Every returned row must satisfy this for the persona. */
    visible: (row: DocumentData, p: Persona) => boolean
}

const own = (row: DocumentData, p: Persona) => row.orgId === p.host
const sharedToHost = (row: DocumentData, p: Persona) =>
    Array.isArray(row.visibleToOrgs) && row.visibleToOrgs.includes(p.host) && row.orgId !== p.host

const CASES: Record<keyof typeof CLIENT_QUERIES, Case> = {
    setlistTracksQuery: { need: "pe", visible: own, build: (db, p) => CLIENT_QUERIES.setlistTracksQuery(db, p.host, `sl-${p.host}`) },
    tracksByMomentQuery: { need: "pe", visible: own, build: (db, p) => CLIENT_QUERIES.tracksByMomentQuery(db, p.host, "moment-1") },
    tracksByUnitsQuery: { need: "pe", visible: own, build: (db, p) => CLIENT_QUERIES.tracksByUnitsQuery(db, p.host, ["unit-1"]) },
    recentSetlistsQuery: { need: "pe", visible: own, build: (db, p) => CLIENT_QUERIES.recentSetlistsQuery(db, p.host, 50) },
    upcomingSetlistsQuery: {
        need: "pe",
        visible: own,
        build: (db, p) => CLIENT_QUERIES.upcomingSetlistsQuery(db, p.host, new Date(NOW - DAY), { to: new Date(NOW + 7 * DAY), max: 5 }),
    },
    songsQuery: { need: "me", visible: own, build: (db, p) => CLIENT_QUERIES.songsQuery(db, p.host) },
    templatesQuery: { need: "me", visible: own, build: (db, p) => CLIENT_QUERIES.templatesQuery(db, p.host) },
    recordingsQuery: { need: "me", visible: own, build: (db, p) => CLIENT_QUERIES.recordingsQuery(db, p.host) },
    recordingsForSongQuery: { need: "me", visible: own, build: (db, p) => CLIENT_QUERIES.recordingsForSongQuery(db, p.host, `song-${p.host}`) },
    auditLogsQuery: { need: "ad", visible: own, build: (db, p) => CLIENT_QUERIES.auditLogsQuery(db, p.host, 20) },
    partPresetsQuery: { need: "me", visible: own, build: (db, p) => CLIENT_QUERIES.partPresetsQuery(db, p.host) },
    tenantAssignmentsQuery: { need: "bl", visible: own, build: (db, p) => CLIENT_QUERIES.tenantAssignmentsQuery(db, p.host) },
    myAssignmentsQuery: {
        need: "self",
        visible: (row, p) => row.musicianUid === p.id,
        build: (db, p) => CLIENT_QUERIES.myAssignmentsQuery(db, p.id),
    },
    sharedCollectionsQuery: {
        need: "me",
        visible: (row, p) => [...(row.sharedWith ?? []), ...(row.assignedTo ?? [])].includes(p.host),
        build: (db, p) => CLIENT_QUERIES.sharedCollectionsQuery(db, "sharedWith", p.host),
    },
    sharedLibraryRowsQuery: { need: "me", visible: sharedToHost, build: (db, p) => CLIENT_QUERIES.sharedLibraryRowsQuery(db, p.host) },
}

/** The pre-#75 listener query: no orgId. Refused for all but the platform owner. */
const LEGACY_TRACKS: Case = {
    need: "po-only",
    visible: () => true,
    build: (db, p) => query(collection(db, "tracks"), where("setlistId", "==", `sl-${p.host}`)),
}

/** First server delivery of a listener, or its error. `includeMetadataChanges`
 *  because the getDocs before it leaves the result cached: the listener's
 *  first delivery is then fromCache, and the server confirmation arrives only
 *  as a metadata change. */
function firstSnapshot(q: Query): Promise<DocumentData[]> {
    return new Promise((resolvePromise, reject) => {
        const unsub = onSnapshot(
            q,
            { includeMetadataChanges: true },
            (snap) => {
                if (snap.metadata.fromCache) return
                unsub()
                resolvePromise(snap.docs.map((d) => d.data()))
            },
            (err) => reject(err),
        )
    })
}

describe("client queries × personas vs firestore.rules", () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":")
        testEnv = await initializeTestEnvironment({
            projectId: "demo-client-queries-tenancy",
            firestore: {
                rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
                host,
                port: Number.parseInt(portStr ?? "8080", 10),
            },
        })
        await testEnv.clearFirestore()
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            for (const org of ORGS) {
                const other = org === CRC ? BL : CRC
                await db.doc(`setlists/sl-${org}`).set({
                    orgId: org,
                    name: `Service ${org}`,
                    ownerId: `owner-${org}`,
                    date: Timestamp.fromMillis(NOW),
                    eventDate: Timestamp.fromMillis(NOW + DAY),
                })
                await db.doc(`tracks/tr-${org}`).set({
                    orgId: org,
                    setlistId: `sl-${org}`,
                    order: 0,
                    momentId: "moment-1",
                    liturgyRef: { unitId: "unit-1" },
                })
                await db.doc(`songs/song-${org}`).set({ orgId: org, visibleToOrgs: [org] })
                await db.doc(`templates/${org}__friday_night`).set({ orgId: org, slots: [] })
                await db.doc(`recordings/rec-${org}`).set({ orgId: org, songId: `song-${org}`, createdAt: NOW })
                await db.doc(`auditLogs/log-${org}`).set({ orgId: org, timestamp: NOW })
                await db.doc(`part_presets/pp-${org}`).set({ orgId: org, patterns: ["x"] })
                for (const p of PERSONAS) {
                    await db.doc(`scheduling_assignments/sa-${org}-${p.id}`).set({
                        orgId: org,
                        musicianUid: p.id,
                        status: "pending",
                        assignedAt: NOW,
                    })
                }
                await db.doc(`collections/col-${org}`).set({ ownerOrgId: org, sharedWith: [other], assignedTo: [other] })
                await db.doc(`library_index/li-${org}`).set({ orgId: org, visibleToOrgs: [org, other] })
            }
        })
    })

    afterAll(async () => {
        await testEnv?.cleanup()
    })

    function dbFor(p: Persona): Firestore {
        if (!p.m) return testEnv.unauthenticatedContext().firestore() as unknown as Firestore
        const claims: Record<string, unknown> = { m: p.m }
        if (p.po) claims.po = true
        return testEnv.authenticatedContext(p.id, claims).firestore() as unknown as Firestore
    }

    const entries: Array<[string, Case]> = [...Object.entries(CASES), ["legacy tracks listener (no orgId)", LEGACY_TRACKS]]

    describe.each(PERSONAS.map((p) => [p.id, p] as const))("%s", (_id, persona) => {
        it.each(entries)("%s", async (_name, c) => {
            const db = dbFor(persona)
            const q = c.build(db, persona)
            if (allowed(persona, c.need)) {
                const read = (await assertSucceeds(getDocs(q))).docs.map((d) => d.data())
                const live = await assertSucceeds(firstSnapshot(q))
                for (const rows of [read, live]) {
                    expect(rows.length).toBeGreaterThan(0)
                    for (const row of rows) expect(c.visible(row, persona)).toBe(true)
                }
            } else {
                await assertFails(getDocs(q))
                await assertFails(firstSnapshot(q))
            }
        })
    })
})
