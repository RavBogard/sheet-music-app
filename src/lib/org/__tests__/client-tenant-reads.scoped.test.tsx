import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import React from "react"

/**
 * Multi-tenant phase 1 — the browser reads narrowed per tenant: a non-crc
 * tenant's template listener asks only for its own doc-id range; crc keeps the
 * whole-collection listener (bare keys); the setlist subscription with no org
 * is crc's, not every tenant's. The goldens prove the results are unchanged.
 */

const h = vi.hoisted(() => ({
    docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
    listened: [] as unknown[],
}))

vi.mock("firebase/firestore", () => {
    const collection = (_db: unknown, path: string) => {
        const col = { kind: "col", path, withConverter: () => col }
        return col
    }
    return {
        collection,
        query: (col: unknown, ...cs: unknown[]) => ({ kind: "q", col, cs }),
        where: (f: unknown, op: string, v: unknown) => ({ where: [f, op, v] }),
        orderBy: (f: string, dir = "asc") => ({ orderBy: [f, dir] }),
        limit: (n: number) => ({ limit: n }),
        documentId: () => "__name__",
        onSnapshot: (q: { kind: string; cs?: Array<{ where?: [string, string, string] }> }, next: unknown) => {
            h.listened.push(q)
            let rows = h.docs
            for (const c of q.cs ?? []) {
                if (!c.where || c.where[0] !== "__name__") continue
                const [, op, v] = c.where
                rows = rows.filter((r) => (op === ">=" ? r.id >= v : r.id < v))
            }
            const snap = { docs: rows.map((r) => ({ id: r.id, data: () => r.data })), metadata: { fromCache: false } }
            if (typeof next === "function") next(snap)
            else (next as { next: (s: unknown) => void }).next(snap)
            return () => {}
        },
        doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(),
        getDocs: vi.fn(), writeBatch: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(), deleteField: vi.fn(),
        Timestamp: { now: () => ({}), fromDate: (d: Date) => d },
    }
})
vi.mock("@/lib/firebase", () => ({
    db: {},
    auth: { currentUser: null },
    getDb: async () => ({}),
    subscribeWithDb: (setup: (d: unknown) => unknown) => {
        const u = setup({})
        return typeof u === "function" ? u : () => {}
    },
}))
vi.mock("@/lib/setlist-audit", () => ({ logSetlistChange: vi.fn() }))
vi.mock("@/lib/notification-store", () => ({ notifySetlistPublished: vi.fn(), notifySetlistUpdated: vi.fn() }))
vi.mock("@/types/schemas", () => ({ setlistConverter: {} }))
vi.mock("@/lib/liturgical-templates", () => ({ generateSetlistName: vi.fn() }))

import { OrgContext } from "@/lib/org/org-context"
import { useCustomTemplates, orgTemplateIdRange } from "@/lib/template-firebase"
import { createSetlistService } from "@/lib/setlist-firebase"

beforeEach(() => {
    h.listened.length = 0
    h.docs = [
        { id: "friday_night", data: { slots: [{ title: "crc" }] } },
        { id: "testshul__friday_night", data: { slots: [{ title: "testshul" }] } },
        { id: "testshul2__friday_night", data: { slots: [{ title: "testshul2" }] } },
        { id: "testshul_x__friday_night", data: { slots: [{ title: "other" }] } },
    ]
})

function wrapper(org: string) {
    return function OrgWrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(OrgContext.Provider, { value: org }, children)
    }
}

describe("template override listener per tenant", () => {
    it("range is null for crc and the tenant's prefix otherwise", () => {
        expect(orgTemplateIdRange("crc")).toBeNull()
        expect(orgTemplateIdRange("testshul")).toEqual({ start: "testshul__", end: "testshul__" })
    })

    it("a new tenant listens to its own id range only", () => {
        const { result } = renderHook(() => useCustomTemplates(), { wrapper: wrapper("testshul") })
        expect(h.listened).toEqual([
            {
                kind: "q",
                col: expect.objectContaining({ path: "templates" }),
                cs: [{ where: ["__name__", ">=", "testshul__"] }, { where: ["__name__", "<", "testshul__"] }],
            },
        ])
        expect(result.current.overrides).toEqual({ friday_night: [{ title: "testshul" }] })
    })

    it("crc keeps the whole-collection listener", () => {
        const { result } = renderHook(() => useCustomTemplates(), { wrapper: wrapper("crc") })
        expect(h.listened).toEqual([expect.objectContaining({ kind: "col", path: "templates" })])
        expect(result.current.overrides).toEqual({ friday_night: [{ title: "crc" }] })
    })
})

describe("setlist subscription without an org", () => {
    it("is crc's", () => {
        createSetlistService(null, null).subscribeToAllSetlists(() => {})
        expect(h.listened).toEqual([
            {
                kind: "q",
                col: expect.objectContaining({ path: "setlists" }),
                cs: [{ where: ["orgId", "==", "crc"] }, { orderBy: ["date", "desc"] }, { limit: 50 }],
            },
        ])
    })
})
