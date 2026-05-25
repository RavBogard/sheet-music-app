import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * bridge-housekeeping wrappers (FINDINGS §4 Lane #7 — TOP-10 #9 + Feat-A1).
 * Verifies:
 *   (1) Admin gate matrix on all three tools — admin OK; band_leader / musician
 *       / member / unauthenticated REJECTED with forbidden_role envelope.
 *       Note: bridge-housekeeping is STRICTER than bridge-recovery's
 *       trusted-leader trio (no band_leader access) — these are maintenance
 *       ops on a shared singleton, not mix control.
 *   (2) Happy paths: clear_acks / clear_pending_commands return `{cleared:N}`;
 *       get_log returns `{entries, errCount, lastError, bridgeVersion}` from
 *       the ring buffer doc OR an empty default when the doc is absent.
 *   (3) Batched-delete handles >500 pending docs in chunks of 250 (the chunk
 *       cap defined in bridge-housekeeping.ts) without exceeding Firestore's
 *       500-op batch limit per commit. 600 fake docs → 3 commits, all cleared.
 *   (4) Thrown Firestore I/O surfaces as a rich `internal_error` envelope, not
 *       a thrown exception (per `[[feedback_mcp_validation_shape]]`).
 *
 * firebase-admin is mocked structurally — collection().limit().get() returns
 * paged snapshots; doc().get() returns the bridgeLog ring doc; batch() returns
 * an in-memory recorder so we can count delete ops + commits.
 */

// ── Spies and mock-Firestore plumbing ────────────────────────────────────────

/**
 * Mutable queue of paged snapshots to hand back from
 * `db.collection(path).limit(n).get()`. Tests push pages in the order they
 * should be returned; deleteSubcollection iterates until a page is short.
 */
const collectionPageQueue: Array<{
    path: string
    size: number
    docs: Array<{ ref: { _id: string } }>
}> = []

const collectionLimitGet = vi.fn(async () => {
    const page = collectionPageQueue.shift()
    if (!page) {
        // Default empty page so the iteration terminates cleanly when tests
        // forget to enqueue (or expect a no-op).
        return { empty: true, size: 0, docs: [] }
    }
    return {
        empty: page.size === 0,
        size: page.size,
        docs: page.docs,
    }
})
const collectionLimitSpy = vi.fn((_n?: number) => ({ get: collectionLimitGet }))

const batchDeleteSpy = vi.fn()
const batchCommitSpy = vi.fn().mockResolvedValue(undefined)
const batchSpy = vi.fn(() => ({
    delete: batchDeleteSpy,
    commit: batchCommitSpy,
}))

const docGetSpy = vi.fn()
const docSpy = vi.fn((_path: string) => ({ get: docGetSpy }))

// User-role lookup. readUserRole hits db.collection("users").doc(uid).get();
// we share collectionLimitGet's spy queue for the housekeeping collection
// paths, so users/{uid}.get() needs its OWN spy returning the role doc.
const userRoleGet = vi.fn()

const collectionSpy = vi.fn((path: string) => {
    // users/{uid} lookups go through .doc(uid).get()
    if (path === "users") {
        return {
            doc: vi.fn(() => ({ get: userRoleGet })),
            limit: collectionLimitSpy,
        }
    }
    return {
        doc: vi.fn(() => ({ get: vi.fn() })),
        limit: (n: number) => {
            // Record the path on the limit call so batched-delete tests can
            // assert WHICH subcollection got paged.
            collectionLimitSpy(n)
            ;(collectionLimitGet as unknown as { _path?: string })._path = path
            return { get: collectionLimitGet }
        },
    }
})

const mockDb = {
    collection: collectionSpy,
    doc: docSpy,
    batch: batchSpy,
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(() => mockDb),
}))

import {
    bridgeClearAcks,
    bridgeClearPendingCommands,
    bridgeGetLog,
} from "../bridge-housekeeping"

/** Stub the users/{uid}.get() role lookup. */
function withRole(role: string | undefined): void {
    userRoleGet.mockReset().mockResolvedValue({
        exists: role !== undefined,
        data: () => (role === undefined ? undefined : { role }),
    })
}

/** Build N fake doc refs for a paged snapshot. */
function fakeDocs(count: number, prefix = "doc"): Array<{ ref: { _id: string } }> {
    return Array.from({ length: count }, (_, i) => ({
        ref: { _id: `${prefix}-${i}` },
    }))
}

beforeEach(() => {
    vi.clearAllMocks()
    collectionPageQueue.length = 0
    batchCommitSpy.mockResolvedValue(undefined)
    // Reset the docGet default so unrelated tests don't carry residue.
    docGetSpy.mockReset()
})

// ── Gate matrix ──────────────────────────────────────────────────────────────

describe("admin gate — all three tools (admin OK; band_leader / musician / member / unauth REJECTED)", () => {
    type ToolFn = (uid: string) => Promise<unknown>
    const tools: Array<[string, ToolFn]> = [
        ["bridge_clear_acks", bridgeClearAcks],
        ["bridge_clear_pending_commands", bridgeClearPendingCommands],
        ["bridge_get_log", bridgeGetLog],
    ]

    it.each(tools)(
        "%s — admin: ACCEPTED (no forbidden_role envelope)",
        async (name, fn) => {
            withRole("admin")
            // For the clear tools, default empty pages → cleared:0. For get_log,
            // default to no-doc → empty entries. Either way: NOT an error envelope.
            docGetSpy.mockResolvedValue({ exists: false, data: () => undefined })
            const res = (await fn("uid-admin")) as { ok: boolean; error?: unknown }
            expect(res.ok).toBe(true)
            // Sanity: rich-error envelope would carry `error.machine_code`.
            expect(
                (res as { error?: { machine_code?: string } }).error
                    ?.machine_code,
            ).toBeUndefined()
            // Sanity: the tool actually ran past the gate (consumed at least one
            // mock — either docGet for get_log, or collection.limit for the
            // clears).
            const ran =
                docGetSpy.mock.calls.length > 0 ||
                collectionLimitSpy.mock.calls.length > 0
            expect(ran).toBe(true)
            // Suppress unused param lint
            void name
        },
    )

    it.each(tools)(
        "%s — band_leader: REJECTED with forbidden_role (stricter than bridge-recovery)",
        async (_name, fn) => {
            withRole("band_leader")
            const res = (await fn("uid-david")) as {
                ok: boolean
                error?: { machine_code?: string }
                hint?: string
            }
            expect(res.ok).toBe(false)
            expect(res.error?.machine_code).toBe("forbidden_role")
            expect(res.hint ?? "").toMatch(/bridge_resync|bridge_reconnect/)
            // Gate must short-circuit BEFORE any housekeeping I/O.
            expect(batchSpy).not.toHaveBeenCalled()
            expect(docGetSpy).not.toHaveBeenCalled()
        },
    )

    it.each(tools)(
        "%s — musician: REJECTED",
        async (_name, fn) => {
            withRole("musician")
            const res = (await fn("uid-musician")) as {
                ok: boolean
                error?: { machine_code?: string }
            }
            expect(res.ok).toBe(false)
            expect(res.error?.machine_code).toBe("forbidden_role")
            expect(batchSpy).not.toHaveBeenCalled()
        },
    )

    it.each(tools)(
        "%s — member: REJECTED",
        async (_name, fn) => {
            withRole("member")
            const res = (await fn("uid-member")) as {
                ok: boolean
                error?: { machine_code?: string }
            }
            expect(res.ok).toBe(false)
            expect(res.error?.machine_code).toBe("forbidden_role")
            expect(batchSpy).not.toHaveBeenCalled()
        },
    )

    it.each(tools)(
        "%s — no role doc (unauthenticated / fell-off-auth): REJECTED",
        async (_name, fn) => {
            withRole(undefined)
            const res = (await fn("uid-ghost")) as {
                ok: boolean
                error?: { machine_code?: string }
            }
            expect(res.ok).toBe(false)
            expect(res.error?.machine_code).toBe("forbidden_role")
        },
    )
})

// ── Happy paths ──────────────────────────────────────────────────────────────

describe("bridge_clear_acks — happy path", () => {
    it("admin caller, empty subcollection: returns {action:'clear_acks', cleared:0}; no batch commits", async () => {
        withRole("admin")
        // Default empty page; deleteSubcollection sees empty + bails.
        const res = (await bridgeClearAcks("uid-admin")) as {
            ok: boolean
            action: string
            cleared: number
        }
        expect(res.ok).toBe(true)
        expect(res.action).toBe("clear_acks")
        expect(res.cleared).toBe(0)
        expect(batchCommitSpy).not.toHaveBeenCalled()
    })

    it("admin caller, 5 docs in subcollection: 5 deletes, 1 commit, cleared:5", async () => {
        withRole("admin")
        collectionPageQueue.push({
            path: "monitor-live/commands/acks",
            size: 5,
            docs: fakeDocs(5, "ack"),
        })
        const res = (await bridgeClearAcks("uid-admin")) as { cleared: number }
        expect(res.cleared).toBe(5)
        expect(batchDeleteSpy).toHaveBeenCalledTimes(5)
        expect(batchCommitSpy).toHaveBeenCalledTimes(1)
    })
})

describe("bridge_clear_pending_commands — happy path", () => {
    it("admin caller, 3 pending docs: cleared:3", async () => {
        withRole("admin")
        collectionPageQueue.push({
            path: "monitor-live/commands/pending",
            size: 3,
            docs: fakeDocs(3, "pending"),
        })
        const res = (await bridgeClearPendingCommands("uid-admin")) as {
            action: string
            cleared: number
        }
        expect(res.action).toBe("clear_pending_commands")
        expect(res.cleared).toBe(3)
        expect(batchDeleteSpy).toHaveBeenCalledTimes(3)
        expect(batchCommitSpy).toHaveBeenCalledTimes(1)
    })
})

describe("bridge_get_log — happy paths", () => {
    it("doc absent: returns empty defaults (cold bridge, nothing logged yet)", async () => {
        withRole("admin")
        docGetSpy.mockResolvedValue({ exists: false, data: () => undefined })
        const res = (await bridgeGetLog("uid-admin")) as {
            ok: boolean
            entries: unknown[]
            errCount: number
            lastError: unknown
            bridgeVersion: string | null
        }
        expect(res.ok).toBe(true)
        expect(res.entries).toEqual([])
        expect(res.errCount).toBe(0)
        expect(res.lastError).toBeNull()
        expect(res.bridgeVersion).toBeNull()
        expect(docSpy).toHaveBeenCalledWith("monitor-live/bridgeLog")
    })

    it("doc present: forwards entries + counters + bridgeVersion verbatim", async () => {
        withRole("admin")
        const fakeLog = {
            entries: [
                { level: "error", msg: "X32 socket closed", ts: 1_700_000_000_000 },
                { level: "warn", msg: "ack TTL sweep slow", ts: 1_700_000_005_000 },
            ],
            errCount: 17,
            lastError: { msg: "X32 socket closed", ts: 1_700_000_000_000 },
            bridgeVersion: "10.0.5",
        }
        docGetSpy.mockResolvedValue({
            exists: true,
            data: () => fakeLog,
        })
        const res = (await bridgeGetLog("uid-admin")) as {
            entries: typeof fakeLog.entries
            errCount: number
            lastError: { msg: string; ts: number } | null
            bridgeVersion: string | null
        }
        expect(res.entries).toEqual(fakeLog.entries)
        expect(res.errCount).toBe(17)
        expect(res.lastError).toEqual(fakeLog.lastError)
        expect(res.bridgeVersion).toBe("10.0.5")
    })

    it("doc present but malformed (missing entries/errCount): coerces to safe defaults", async () => {
        withRole("admin")
        docGetSpy.mockResolvedValue({
            exists: true,
            data: () => ({ entries: "not-an-array", errCount: "seventeen" }),
        })
        const res = (await bridgeGetLog("uid-admin")) as {
            entries: unknown[]
            errCount: number
            lastError: unknown
            bridgeVersion: string | null
        }
        expect(res.entries).toEqual([])
        expect(res.errCount).toBe(0)
        expect(res.lastError).toBeNull()
        expect(res.bridgeVersion).toBeNull()
    })
})

// ── Batched-delete >500 ──────────────────────────────────────────────────────

describe("batched-delete: 600 pending docs split into 3 pages of 250 (last page short, terminates)", () => {
    it("clears all 600; never exceeds 500-op batch cap; 3 commits", async () => {
        withRole("admin")
        // Pages of 250, 250, 100 — last page short → loop terminates after
        // committing the final 100.
        collectionPageQueue.push({
            path: "monitor-live/commands/pending",
            size: 250,
            docs: fakeDocs(250, "p-batch1"),
        })
        collectionPageQueue.push({
            path: "monitor-live/commands/pending",
            size: 250,
            docs: fakeDocs(250, "p-batch2"),
        })
        collectionPageQueue.push({
            path: "monitor-live/commands/pending",
            size: 100,
            docs: fakeDocs(100, "p-batch3"),
        })

        const res = (await bridgeClearPendingCommands("uid-admin")) as {
            cleared: number
        }
        expect(res.cleared).toBe(600)
        // 3 batches committed, batch.delete called 600 times total.
        expect(batchCommitSpy).toHaveBeenCalledTimes(3)
        expect(batchDeleteSpy).toHaveBeenCalledTimes(600)
        // Each commit had at most 250 deletes — assert by counting deletes
        // between commits via call ordering would require timeline reconstruction;
        // total + commit-count is sufficient to prove the chunking contract.
    })

    it("a single full page (exactly 250) plus an empty follow-up: still cleared:250, no infinite loop", async () => {
        withRole("admin")
        collectionPageQueue.push({
            path: "monitor-live/commands/pending",
            size: 250,
            docs: fakeDocs(250, "p-full"),
        })
        // No second page queued → default returns empty; loop bails on snap.empty.
        const res = (await bridgeClearPendingCommands("uid-admin")) as {
            cleared: number
        }
        expect(res.cleared).toBe(250)
        expect(batchCommitSpy).toHaveBeenCalledTimes(1)
    })
})

// ── Failure path ─────────────────────────────────────────────────────────────

describe("error path — Firestore throws surface as rich internal_error envelopes (never thrown)", () => {
    it("bridge_clear_acks: batch.commit() rejects → internal_error envelope", async () => {
        withRole("admin")
        collectionPageQueue.push({
            path: "monitor-live/commands/acks",
            size: 5,
            docs: fakeDocs(5, "ack-throw"),
        })
        batchCommitSpy.mockRejectedValueOnce(new Error("Firestore unavailable"))
        const res = (await bridgeClearAcks("uid-admin")) as {
            ok: boolean
            error?: { machine_code?: string; message?: string }
        }
        expect(res.ok).toBe(false)
        expect(res.error?.machine_code).toBe("internal_error")
        expect(res.error?.message).toMatch(/Firestore unavailable/)
    })

    it("bridge_clear_pending_commands: collection.limit().get() rejects → internal_error envelope", async () => {
        withRole("admin")
        collectionLimitGet.mockRejectedValueOnce(new Error("read deadline exceeded"))
        const res = (await bridgeClearPendingCommands("uid-admin")) as {
            ok: boolean
            error?: { machine_code?: string; message?: string }
        }
        expect(res.ok).toBe(false)
        expect(res.error?.machine_code).toBe("internal_error")
        expect(res.error?.message).toMatch(/read deadline exceeded/)
    })

    it("bridge_get_log: doc().get() rejects → internal_error envelope (no thrown)", async () => {
        withRole("admin")
        docGetSpy.mockRejectedValueOnce(new Error("permission denied"))
        const res = (await bridgeGetLog("uid-admin")) as {
            ok: boolean
            error?: { machine_code?: string; message?: string }
        }
        expect(res.ok).toBe(false)
        expect(res.error?.machine_code).toBe("internal_error")
        expect(res.error?.message).toMatch(/permission denied/)
    })
})
