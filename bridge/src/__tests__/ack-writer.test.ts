import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Monitor Overhaul Phase 2 — B6 ack writer.
 *
 * The bridge writes a per-command ack at monitor-live/acks/items/{commandId} so
 * MCP get_command_status (P2-B) + the iPad C-9 UI can read whether a command
 * applied, was refused, or never confirmed. firebase-admin's FieldValue is
 * mocked; the db is hand-rolled so we can assert the exact written shape, the
 * path, and the TTL sweep.
 */

vi.mock("firebase-admin", () => ({
    firestore: Object.assign(() => ({}), {
        FieldValue: { serverTimestamp: () => "<server-ts>" },
    }),
}))

import { AckWriter, ACKS_COLLECTION } from "../ack-writer"

interface SetCall {
    path: string
    data: Record<string, unknown>
}

function makeDb() {
    const setCalls: SetCall[] = []
    const deletedRefs: string[] = []
    let sweepDocs: Array<{ ref: { path: string } }> = []
    let lastWhere: { field: string; op: string; value: unknown } | null = null

    const db = {
        doc: (path: string) => ({
            set: (data: Record<string, unknown>) => {
                setCalls.push({ path, data })
                return Promise.resolve()
            },
        }),
        collection: (path: string) => ({
            where: (field: string, op: string, value: unknown) => {
                lastWhere = { field, op, value }
                return {
                    limit: () => ({
                        get: () =>
                            Promise.resolve({
                                empty: sweepDocs.length === 0,
                                size: sweepDocs.length,
                                docs: sweepDocs.map((d) => ({ ref: d.ref })),
                                __collectionPath: path,
                            }),
                    }),
                }
            },
        }),
        batch: () => ({
            delete: (ref: { path: string }) => deletedRefs.push(ref.path),
            commit: () => Promise.resolve(),
        }),
    }

    return {
        db,
        setCalls,
        deletedRefs,
        setSweepDocs: (docs: Array<{ ref: { path: string } }>) => {
            sweepDocs = docs
        },
        getLastWhere: () => lastWhere,
    }
}

describe("AckWriter (B6) — per-command ack docs", () => {
    let h: ReturnType<typeof makeDb>
    let writer: AckWriter

    beforeEach(() => {
        h = makeDb()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        writer = new AckWriter(h.db as any)
    })

    it("writes an APPLIED ack with confirmedValue at monitor-live/acks/items/{id}", async () => {
        await writer.write("cmd-1", "applied", { confirmedValue: 0.42 })
        expect(h.setCalls).toHaveLength(1)
        expect(h.setCalls[0].path).toBe(`${ACKS_COLLECTION}/cmd-1`)
        expect(h.setCalls[0].path).toBe("monitor-live/commands/acks/cmd-1")
        const doc = h.setCalls[0].data
        expect(doc.commandId).toBe("cmd-1")
        expect(doc.status).toBe("applied")
        expect(doc.confirmedValue).toBe(0.42)
        expect(doc.at).toBe("<server-ts>")
        expect(typeof doc.createdAtMs).toBe("number")
        // No spurious reason on a clean applied ack.
        expect("reason" in doc).toBe(false)
    })

    it("writes a boolean confirmedValue (mute) faithfully", async () => {
        await writer.write("cmd-mute", "applied", { confirmedValue: false })
        expect(h.setCalls[0].data.confirmedValue).toBe(false)
    })

    it("writes a REJECTED ack with a reason and no confirmedValue", async () => {
        await writer.write("cmd-2", "rejected", { reason: "unauthorized" })
        const doc = h.setCalls[0].data
        expect(doc.status).toBe("rejected")
        expect(doc.reason).toBe("unauthorized")
        expect("confirmedValue" in doc).toBe(false)
    })

    it("writes a TIMEOUT ack with neither confirmedValue nor (optional) reason when omitted", async () => {
        await writer.write("cmd-3", "timeout")
        const doc = h.setCalls[0].data
        expect(doc.status).toBe("timeout")
        expect("confirmedValue" in doc).toBe(false)
        expect("reason" in doc).toBe(false)
    })

    it("strips undefined optionals (Firestore rejects undefined)", async () => {
        await writer.write("cmd-4", "applied", { confirmedValue: undefined, reason: undefined })
        const doc = h.setCalls[0].data
        expect("confirmedValue" in doc).toBe(false)
        expect("reason" in doc).toBe(false)
    })

    it("never writes for an empty commandId", async () => {
        await writer.write("", "applied", { confirmedValue: 1 })
        expect(h.setCalls).toHaveLength(0)
    })

    it("sweep deletes acks older than the TTL, querying on createdAtMs", async () => {
        h.setSweepDocs([
            { ref: { path: "monitor-live/commands/acks/old-1" } },
            { ref: { path: "monitor-live/commands/acks/old-2" } },
        ])
        await writer.sweep()
        expect(h.getLastWhere()?.field).toBe("createdAtMs")
        expect(h.getLastWhere()?.op).toBe("<")
        expect(h.deletedRefs).toEqual([
            "monitor-live/commands/acks/old-1",
            "monitor-live/commands/acks/old-2",
        ])
    })

    it("sweep is a no-op when nothing is stale", async () => {
        h.setSweepDocs([])
        await writer.sweep()
        expect(h.deletedRefs).toHaveLength(0)
    })
})
