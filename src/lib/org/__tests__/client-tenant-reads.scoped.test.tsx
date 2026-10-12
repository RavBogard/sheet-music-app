import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import React from "react"

/**
 * Multi-tenant phase 1/2 — the browser reads narrowed per tenant. Phase 2:
 * every tenant's template listener (crc included) lists by the stamped
 * `orgId` field, which the list rule can prove (the phase-1 doc-id range and
 * crc's whole-collection read are gone). The setlist subscription with no org
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
                if (!c.where) continue
                const [f, op, v] = c.where
                if (f === "__name__") rows = rows.filter((r) => (op === ">=" ? r.id >= v : r.id < v))
                else if (op === "==") rows = rows.filter((r) => r.data[f] === v)
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
import { useCustomTemplates } from "@/lib/template-firebase"
import { createSetlistService } from "@/lib/setlist-firebase"

beforeEach(() => {
    h.listened.length = 0
    h.docs = [
        { id: "friday_night", data: { orgId: "crc", slots: [{ title: "crc" }] } },
        { id: "testshul__friday_night", data: { orgId: "testshul", slots: [{ title: "testshul" }] } },
        { id: "testshul2__friday_night", data: { orgId: "testshul2", slots: [{ title: "testshul2" }] } },
        { id: "testshul_x__friday_night", data: { orgId: "testshul_x", slots: [{ title: "other" }] } },
    ]
})

function wrapper(org: string) {
    return function OrgWrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(OrgContext.Provider, { value: org }, children)
    }
}

describe("template override listener per tenant", () => {
    it.each(["testshul", "crc"])("%s lists its own docs by orgId", (org) => {
        const { result } = renderHook(() => useCustomTemplates(), { wrapper: wrapper(org) })
        expect(h.listened).toEqual([
            {
                kind: "q",
                col: expect.objectContaining({ path: "templates" }),
                cs: [{ where: ["orgId", "==", org] }],
            },
        ])
        expect(result.current.overrides).toEqual({ friday_night: [{ title: org }] })
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
