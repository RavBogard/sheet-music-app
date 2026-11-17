import { describe, expect, it } from "vitest"
import type { Firestore } from "firebase-admin/firestore"

import { listImportFailures, resolveImportFailure } from "../import-failures"

/**
 * Chart Inbox import failures (chartImportQueue). Kept when the AI library
 * review queue that used to list them was removed. A small in-memory
 * Firestore stands in for the one collection these functions touch.
 */

type Doc = Record<string, unknown>

function fakeDb(seed: Record<string, Doc>) {
    const docs = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]))
    const snapOf = (id: string) => ({ id, exists: docs.has(id), data: () => docs.get(id) })
    const db = {
        collection(name: string) {
            if (name !== "chartImportQueue") throw new Error(`unexpected collection ${name}`)
            return {
                where(field: string, op: string, values: string[]) {
                    expect(field).toBe("parents")
                    expect(op).toBe("array-contains-any")
                    return {
                        async get() {
                            return {
                                docs: [...docs.keys()]
                                    .filter((id) => {
                                        const p = docs.get(id)?.parents
                                        return Array.isArray(p) && p.some((x) => values.includes(x as string))
                                    })
                                    .map(snapOf),
                            }
                        },
                    }
                },
                doc(id: string) {
                    return {
                        async get() {
                            return snapOf(id)
                        },
                        async delete() {
                            docs.delete(id)
                        },
                        async update(patch: Doc) {
                            docs.set(id, { ...docs.get(id), ...patch })
                        },
                    }
                },
            }
        },
    }
    return { db: db as unknown as Firestore, docs }
}

function failure(parents: string[] | null, extra: Doc = {}): Doc {
    return {
        driveName: "scan.pdf",
        driveMimeType: "application/pdf",
        parents,
        md5Checksum: "abc",
        status: "conversion_failed",
        errorMessage: "bad pdf",
        attemptCount: 2,
        firstSeenAt: "2026-11-01T00:00:00.000Z",
        lastAttemptAt: "2026-11-02T00:00:00.000Z",
        ...extra,
    }
}

const INBOX = ["inbox", "inbox-sub"]

describe("listImportFailures", () => {
    it("lists this inbox's undismissed failures, newest first, and no other tenant's", async () => {
        const { db } = fakeDb({
            a: failure(["inbox"], { lastAttemptAt: "2026-11-02T00:00:00.000Z" }),
            b: failure(["inbox-sub"], { lastAttemptAt: "2026-11-05T00:00:00.000Z" }),
            dismissed: failure(["inbox"], { dismissed: true }),
            other: failure(["someone-elses-inbox"]),
            orphan: failure(null),
        })
        const r = await listImportFailures(db, INBOX)
        expect(r.total).toBe(2)
        expect(r.rows.map((x) => x.driveFileId)).toEqual(["b", "a"])
        expect(r.rows[0]).toEqual({
            driveFileId: "b",
            driveName: "scan.pdf",
            driveMimeType: "application/pdf",
            status: "conversion_failed",
            errorMessage: "bad pdf",
            attemptCount: 2,
            firstSeenAt: "2026-11-01T00:00:00.000Z",
            lastAttemptAt: "2026-11-05T00:00:00.000Z",
        })
    })

    it("caps the rows but reports the true total", async () => {
        const seed: Record<string, Doc> = {}
        for (let i = 0; i < 5; i++) seed[`f${i}`] = failure(["inbox"], { lastAttemptAt: `2026-11-0${i + 1}` })
        const { db } = fakeDb(seed)
        const r = await listImportFailures(db, INBOX, 2)
        expect(r.rows).toHaveLength(2)
        expect(r.total).toBe(5)
    })

    it("no folders, no rows (and no query)", async () => {
        const { db } = fakeDb({ a: failure(["inbox"]) })
        expect(await listImportFailures(db, [])).toEqual({ rows: [], total: 0 })
    })
})

describe("resolveImportFailure", () => {
    it("retry deletes the row", async () => {
        const { db, docs } = fakeDb({ a: failure(["inbox"]) })
        const r = await resolveImportFailure(db, INBOX, "a", "retry", "admin-1")
        expect(r).toEqual({ driveFileId: "a", action: "retry", ok: true, status: "cleared" })
        expect(docs.has("a")).toBe(false)
    })

    it("dismiss marks the row dismissed and keeps it", async () => {
        const { db, docs } = fakeDb({ a: failure(["inbox-sub"]) })
        const r = await resolveImportFailure(db, INBOX, "a", "dismiss", "admin-1")
        expect(r).toEqual({ driveFileId: "a", action: "dismiss", ok: true, status: "dismissed" })
        expect(docs.get("a")).toMatchObject({ dismissed: true, dismissedBy: "admin-1" })
        expect(typeof docs.get("a")?.dismissedAt).toBe("string")
    })

    it("a missing row, or another inbox's row, is not_found and untouched", async () => {
        const { db, docs } = fakeDb({ other: failure(["someone-elses-inbox"]) })
        expect(await resolveImportFailure(db, INBOX, "nope", "retry", "admin-1")).toEqual({
            driveFileId: "nope",
            action: "retry",
            ok: false,
            error: "not_found",
        })
        expect((await resolveImportFailure(db, INBOX, "other", "dismiss", "admin-1")).ok).toBe(false)
        expect(docs.get("other")?.dismissed).toBeUndefined()
    })
})
