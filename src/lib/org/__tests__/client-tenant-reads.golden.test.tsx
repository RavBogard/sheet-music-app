import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import React from "react"

/**
 * Multi-tenant phase 1 GOLDEN — the two browser reads that listed another
 * tenant's documents: the liturgical template overrides (`templates`, whole
 * collection then selectOrgOverrides) and the setlist subscription. What each
 * tenant ends up with, for crc and brotherslazaroff, written against the code
 * BEFORE the query change and never edited afterwards.
 *
 * The Firestore web SDK is replaced by a small evaluator that applies the
 * query's constraints, so a narrower query must still produce these results.
 */

type Doc = { id: string; data: Record<string, unknown> }
const h = vi.hoisted(() => ({
    store: {} as Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
    queries: [] as Array<{ path: string; constraints: Array<Record<string, unknown>> }>,
}))

vi.mock("firebase/firestore", () => {
    const collection = (_db: unknown, path: string) => {
        const col = { kind: "col", path, constraints: [] as unknown[], withConverter: () => col }
        return col
    }
    const query = (col: { path: string; constraints: unknown[] }, ...cs: unknown[]) => ({
        kind: "q",
        path: col.path,
        constraints: [...col.constraints, ...cs],
    })
    const where = (f: unknown, op: string, v: unknown) => ({ type: "where", f, op, v })
    const orderBy = (f: string, dir = "asc") => ({ type: "orderBy", f, dir })
    const limit = (n: number) => ({ type: "limit", n })
    const documentId = () => "__name__"
    function run(q: { path: string; constraints: Array<Record<string, unknown>> }) {
        h.queries.push({ path: q.path, constraints: q.constraints })
        let rows = [...(h.store[q.path] ?? [])]
        for (const c of q.constraints) {
            if (c.type !== "where") continue
            const get = (r: Doc) => (c.f === "__name__" ? r.id : r.data[c.f as string])
            rows = rows.filter((r) => {
                const x = get(r) as string
                switch (c.op) {
                    case "==": return x === c.v
                    case ">=": return x !== undefined && x >= (c.v as string)
                    case "<": return x !== undefined && x < (c.v as string)
                    case "<=": return x !== undefined && x <= (c.v as string)
                    default: throw new Error(`op ${String(c.op)}`)
                }
            })
        }
        for (const c of q.constraints) {
            if (c.type !== "orderBy") continue
            rows.sort((a, b) => {
                const x = a.data[c.f as string] as number
                const y = b.data[c.f as string] as number
                return c.dir === "desc" ? y - x : x - y
            })
        }
        const lim = q.constraints.find((c) => c.type === "limit")
        if (lim) rows = rows.slice(0, lim.n as number)
        return { docs: rows.map((r) => ({ id: r.id, data: () => r.data })), metadata: { fromCache: false } }
    }
    const onSnapshot = (
        q: { path: string; constraints: Array<Record<string, unknown>> },
        next: unknown,
    ) => {
        const snap = run(q)
        if (typeof next === "function") next(snap)
        else (next as { next: (s: unknown) => void }).next(snap)
        return () => {}
    }
    return {
        collection, query, where, orderBy, limit, documentId, onSnapshot,
        doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(),
        getDocs: vi.fn(), writeBatch: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(), deleteField: vi.fn(),
        Timestamp: { now: () => ({}), fromDate: (d: Date) => d },
    }
})
vi.mock("@/lib/firebase", () => {
    const db = { __fake: true }
    return {
        db,
        auth: { currentUser: null },
        getDb: async () => db,
        subscribeWithDb: (setup: (d: unknown) => unknown) => {
            const u = setup(db)
            return typeof u === "function" ? u : () => {}
        },
    }
})
vi.mock("@/lib/setlist-audit", () => ({ logSetlistChange: vi.fn() }))
vi.mock("@/lib/notification-store", () => ({ notifySetlistPublished: vi.fn(), notifySetlistUpdated: vi.fn() }))
vi.mock("@/types/schemas", () => ({ setlistConverter: {} }))
vi.mock("@/lib/liturgical-templates", () => ({ generateSetlistName: vi.fn() }))

import { OrgContext } from "@/lib/org/org-context"
import { useCustomTemplates } from "@/lib/template-firebase"
import { createSetlistService } from "@/lib/setlist-firebase"

const SLOT = (title: string) => [{ title }]

beforeEach(() => {
    h.queries.length = 0
    h.store = {
        templates: [
            { id: "friday_night", data: { slots: SLOT("crc friday") } },
            { id: "shabbat_morning", data: { slots: SLOT("crc morning") } },
            { id: "brotherslazaroff__friday_night", data: { orgId: "brotherslazaroff", slots: SLOT("bl friday") } },
            { id: "brotherslazaroff_x__friday_night", data: { slots: SLOT("other tenant") } },
            { id: "testshul__friday_night", data: { orgId: "testshul", slots: SLOT("testshul friday") } },
        ],
        setlists: [
            { id: "c-untagged", data: { name: "c0", date: 5 } },
            { id: "c1", data: { orgId: "crc", name: "c1", date: 4 } },
            { id: "b1", data: { orgId: "brotherslazaroff", name: "b1", date: 3 } },
            { id: "c2", data: { orgId: "crc", name: "c2", date: 2 } },
            { id: "b2", data: { orgId: "brotherslazaroff", name: "b2", date: 1 } },
        ],
    }
})

function wrapper(org: string) {
    return ({ children }: { children: React.ReactNode }) => React.createElement(OrgContext.Provider, { value: org }, children)
}

describe("golden template overrides per tenant", () => {
    it("crc sees the bare-key docs only", () => {
        const { result } = renderHook(() => useCustomTemplates(), { wrapper: wrapper("crc") })
        expect(result.current.overrides).toEqual({
            friday_night: SLOT("crc friday"),
            shabbat_morning: SLOT("crc morning"),
        })
    })
    it("brotherslazaroff sees its own prefixed docs, prefix stripped", () => {
        const { result } = renderHook(() => useCustomTemplates(), { wrapper: wrapper("brotherslazaroff") })
        expect(result.current.overrides).toEqual({ friday_night: SLOT("bl friday") })
    })
})

describe("golden setlist subscription per tenant", () => {
    it.each([
        ["crc", ["c1", "c2"]],
        ["brotherslazaroff", ["b1", "b2"]],
    ])("%s", (org, ids) => {
        let got: string[] = []
        createSetlistService(null, null).subscribeToAllSetlists((s) => {
            got = s.map((x) => x.name as string)
        }, undefined, org)
        expect(got).toEqual(ids)
    })
})
