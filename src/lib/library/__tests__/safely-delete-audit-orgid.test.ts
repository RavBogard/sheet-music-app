/**
 * Multi-tenant phase 2 — W10: the auditLogs row safelyDeleteLibraryObject
 * writes (delete AND refusal) carries the deleted row's tenant
 * (rowOrg(library_index/{fileId}.orgId); missing/unstamped → 'crc'; an
 * explicit opts.orgId wins for callers that already removed the row).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    audits: [] as Array<Record<string, unknown>>,
    rows: {} as Record<string, Record<string, unknown>>,
    bondedTracks: [] as Array<{ id: string; setlistId: string }>,
}))

vi.mock("@/lib/firebase-storage", () => ({ deleteStorageObjectAtPath: vi.fn(async () => undefined) }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }))
vi.mock("@/lib/firebase-admin", () => {
    const db = {
        collection: (name: string) => ({
            doc: (id: string) => ({
                get: async () => {
                    const d = name === "library_index" ? h.rows[id] : name === "setlists" ? { name: "S" } : undefined
                    return { id, exists: d !== undefined, data: () => d }
                },
            }),
            where: () => {
                const q: Record<string, unknown> = {
                    get: async () => ({
                        empty: h.bondedTracks.length === 0,
                        docs: h.bondedTracks.map((t) => ({ id: t.id, data: () => ({ setlistId: t.setlistId, fileId: "f" }) })),
                    }),
                }
                q.limit = () => q
                q.where = () => q
                q.select = () => q
                return q
            },
            add: async (data: Record<string, unknown>) => {
                if (name === "auditLogs") h.audits.push(data)
                return { id: "a" }
            },
        }),
        getAll: async (...refs: Array<{ get: () => Promise<unknown> }>) => Promise.all(refs.map((r) => r.get())),
    }
    return { initAdmin: () => true, getFirestore: () => db }
})

import { safelyDeleteLibraryObject } from "@/lib/library/safely-delete-library-object"

beforeEach(() => {
    h.audits.length = 0
    h.rows = {}
    h.bondedTracks = []
})

describe("W10 · library-object delete audit row orgId", () => {
    it("stamps the row's tenant on the delete audit", async () => {
        h.rows["file-bl"] = { orgId: "brotherslazaroff" }
        const res = await safelyDeleteLibraryObject("file-bl", { reason: "test", callerUid: "u1" })
        expect(res.deleted).toBe(true)
        expect(h.audits).toHaveLength(1)
        expect(h.audits[0]).toMatchObject({ type: "library-object-deleted", fileId: "file-bl", orgId: "brotherslazaroff" })
    })

    it("missing / unstamped row → 'crc'", async () => {
        await safelyDeleteLibraryObject("gone", { reason: "test" })
        expect(h.audits[0].orgId).toBe("crc")
    })

    it("explicit opts.orgId wins (row already deleted by the caller)", async () => {
        await safelyDeleteLibraryObject("gone", { reason: "test", orgId: "brotherslazaroff" })
        expect(h.audits[0].orgId).toBe("brotherslazaroff")
    })
})
