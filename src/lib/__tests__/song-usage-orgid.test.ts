/**
 * Multi-tenant phase 2 — W4: recordSongUsage stamps the setlist's tenant on
 * the songUsage/{fileId} summary (merge) and on each events/{id} row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Write = { op: "set" | "create"; path: string; data: Record<string, unknown>; opts?: unknown }
const writes: Write[] = []

function docRef(path: string): Record<string, unknown> {
    return {
        _path: path,
        collection: (sub: string) => ({ doc: (id?: string) => docRef(`${path}/${sub}/${id ?? "auto-" + writes.length}`) }),
    }
}

const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(`${name}/${id}`) }),
    batch: () => {
        const pending: Write[] = []
        return {
            set: (ref: { _path: string }, data: Record<string, unknown>, opts?: unknown) =>
                pending.push({ op: "set", path: ref._path, data, opts }),
            create: (ref: { _path: string }, data: Record<string, unknown>) =>
                pending.push({ op: "create", path: ref._path, data }),
            commit: async () => {
                writes.push(...pending)
            },
        }
    },
}

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { recordSongUsage } from "@/lib/song-usage"

beforeEach(() => {
    writes.length = 0
})

describe("W4 · recordSongUsage orgId", () => {
    it("stamps the passed tenant on the summary (merge) and every event; skips non-song rows", async () => {
        const res = await recordSongUsage(
            "s9",
            "BL Gig",
            new Date("2026-10-10T00:00:00Z"),
            [
                { fileId: "f1", title: "One", key: "G" },
                { title: "Header", type: "header" },
                { fileId: "f2", title: "Two", type: "song" },
            ],
            "brotherslazaroff",
        )
        expect(res).toEqual({ recorded: 2, skipped: 0 })

        const summaries = writes.filter((w) => w.op === "set")
        const events = writes.filter((w) => w.op === "create")
        expect(summaries.map((w) => w.path)).toEqual(["songUsage/f1", "songUsage/f2"])
        expect(events).toHaveLength(2)
        for (const s of summaries) {
            expect(s.data.orgId).toBe("brotherslazaroff")
            expect(s.opts).toEqual({ merge: true })
        }
        for (const e of events) {
            expect(e.path).toMatch(/^songUsage\/f[12]\/events\//)
            expect(e.data.orgId).toBe("brotherslazaroff")
        }
    })

    it("crc setlist → crc on both docs", async () => {
        await recordSongUsage("s1", "Shabbat", new Date(), [{ fileId: "f1", title: "One" }], "crc")
        expect(writes.map((w) => w.data.orgId)).toEqual(["crc", "crc"])
    })
})
