import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `backfill_searchable_text` (f4-lyric-search-persistence-mod Phase 3).
 *
 * Tests cover:
 *  (1) admin-only gate — band_leader/musician/member/no-doc REJECTED
 *  (2) dryRun:true (default) — returns plan, no writes
 *  (3) real run without force → refused:true, no writes
 *  (4) force run writes searchableText + searchableTextBackfilledAt
 *  (5) idempotency — already-populated rows skip with reason
 *  (6) overwrite:true allows re-extraction of populated rows
 *  (7) targeted fileIds[] branch fetches exact rows
 *  (8) per-row error capture — one bad extraction doesn't abort batch
 *  (9) skip taxonomy maps extraction skipReasons correctly
 *  (10) limit clamps to MAX_LIMIT; fileIds[] over MAX_LIMIT rejects
 *  (11) status filter excludes non-active rows in untargeted scan
 *  (12) storage-missing rows skip with storage_missing reason
 */

// Mock external surfaces BEFORE imports.

vi.mock("server-only", () => ({}))

interface FakeDoc {
    id: string
    exists?: boolean
    data: Record<string, unknown>
}

interface Fixture {
    userRole: string | undefined
    libraryRows: FakeDoc[]
    /** When set, `fileIds`-branch getAll returns just these (keyed by id). */
    /** Storage download mock by fileId → buffer/contentType or null for not_found. */
    storageByPath: Record<
        string,
        { buffer: Buffer; contentType: string } | "not_found" | "network_error"
    >
    /** Storage download mock by fileId for the legacy path. */
    storageByFileId: Record<
        string,
        { buffer: Buffer; contentType: string } | "not_found"
    >
    /** Per-fileId override of extractor result. */
    extractByFileId: Record<string, unknown>
}

let fixture: Fixture

function resetFixture(overrides: Partial<Fixture> = {}) {
    fixture = {
        userRole: "admin",
        libraryRows: [],
        storageByPath: {},
        storageByFileId: {},
        extractByFileId: {},
        ...overrides,
    }
}

const userDocGetMock = vi.fn(async () => ({
    exists: fixture.userRole !== undefined,
    data: () =>
        fixture.userRole !== undefined ? { role: fixture.userRole } : {},
}))

const updateMock = vi.fn(async () => undefined)

const docMock = vi.fn((id: string) => ({
    id,
    get: vi.fn(async () => {
        const row = fixture.libraryRows.find((r) => r.id === id)
        if (!row) return { exists: false, id, data: () => ({}) }
        return { exists: true, id, data: () => row.data }
    }),
    update: updateMock,
}))

const collectionMock = vi.fn((path: string) => {
    if (path === "users") {
        return {
            doc: vi.fn(() => ({ get: userDocGetMock })),
        }
    }
    if (path === "library_index") {
        return {
            doc: docMock,
            orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        empty: fixture.libraryRows.length === 0,
                        size: fixture.libraryRows.length,
                        docs: fixture.libraryRows.map((r) => ({
                            id: r.id,
                            data: () => r.data,
                        })),
                    })),
                })),
                startAfter: vi.fn(() => ({
                    limit: vi.fn(() => ({
                        get: vi.fn(async () => ({
                            empty: true,
                            size: 0,
                            docs: [],
                        })),
                    })),
                })),
            })),
        }
    }
    return { doc: vi.fn() }
})

const getAllMock = vi.fn(async (...refs: Array<{ id: string }>) => {
    return refs.map((r) => {
        const row = fixture.libraryRows.find((d) => d.id === r.id)
        if (!row) return { exists: false, id: r.id, data: () => ({}) }
        return { exists: true, id: r.id, data: () => row.data }
    })
})

const mockDb = {
    collection: collectionMock,
    getAll: getAllMock,
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(() => mockDb),
}))

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: {
        serverTimestamp: () => "__serverTimestamp__",
        increment: (n: number) => ({ __increment: n }),
    },
}))

vi.mock("@/lib/firebase-storage", () => ({
    downloadFromStoragePath: vi.fn(async (path: string) => {
        const entry = fixture.storageByPath[path]
        if (!entry || entry === "not_found")
            return {
                success: false,
                reason: "not_found",
                message: `not found: ${path}`,
            }
        if (entry === "network_error")
            return {
                success: false,
                reason: "network",
                message: "network down",
            }
        return { success: true, data: entry }
    }),
    downloadFromStorage: vi.fn(async (fileId: string) => {
        const entry = fixture.storageByFileId[fileId]
        if (!entry || entry === "not_found")
            return {
                success: false,
                reason: "not_found",
                message: `not found: ${fileId}`,
            }
        return { success: true, data: entry }
    }),
}))

vi.mock("@/lib/library/searchable-text", () => ({
    extractSearchableText: vi.fn(
        async ({ contentType, fileName, buffer }: any) => {
            // Per-fileId override (key by fileName, since the helper receives
            // originalName which we set to fileId in the test rows).
            const override = fixture.extractByFileId[fileName]
            if (override) return override
            // Default: treat as PDF success returning the buffer's utf-8
            // toString lowercased as the "text".
            const text = buffer.toString("utf-8").toLowerCase()
            if (contentType.startsWith("image/"))
                return {
                    ok: true,
                    text: null,
                    truncated: false,
                    format: "skip",
                    skipReason: "image",
                }
            if (contentType.startsWith("audio/"))
                return {
                    ok: true,
                    text: null,
                    truncated: false,
                    format: "skip",
                    skipReason: "audio",
                }
            if (!text)
                return {
                    ok: true,
                    text: null,
                    truncated: false,
                    format: "skip",
                    skipReason: "no_text",
                }
            return { ok: true, text, truncated: false, format: "pdf" }
        },
    ),
}))

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { backfillSearchableText } from "../backfill-searchable-text"
import type { RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

beforeEach(() => {
    vi.clearAllMocks()
    resetFixture()
})

function row(
    id: string,
    overrides: Record<string, unknown> = {},
): FakeDoc {
    return {
        id,
        data: {
            title: `Title-${id}`,
            storageUrl: `library/${id}.pdf`,
            mimeType: "application/pdf",
            originalName: id,
            status: "active",
            ...overrides,
        },
    }
}

function setStorageBytes(path: string, text: string, mime = "application/pdf") {
    fixture.storageByPath[path] = {
        buffer: Buffer.from(text, "utf8"),
        contentType: mime,
    }
}

// ─── (1) Gate matrix ────────────────────────────────────────────────────────

describe("backfill_searchable_text role gate", () => {
    it("allows admin", async () => {
        resetFixture({ userRole: "admin" })
        const r = await backfillSearchableText("admin-uid", { dryRun: true })
        expect(r.ok).toBe(true)
    })

    it("rejects band_leader with forbidden_role envelope", async () => {
        resetFixture({ userRole: "band_leader" })
        const r = await backfillSearchableText("leader-uid", { dryRun: true })
        expect(r.ok).toBe(false)
        expect((r as RichErrorEnvelope).error.machine_code).toBe(
            "forbidden_role",
        )
    })

    it("rejects musician", async () => {
        resetFixture({ userRole: "musician" })
        const r = await backfillSearchableText("mus-uid", { dryRun: true })
        expect(r.ok).toBe(false)
        expect((r as RichErrorEnvelope).error.machine_code).toBe(
            "forbidden_role",
        )
    })

    it("rejects caller with no user doc (unauthenticated)", async () => {
        resetFixture({ userRole: undefined })
        const r = await backfillSearchableText("ghost-uid", { dryRun: true })
        expect(r.ok).toBe(false)
        expect((r as RichErrorEnvelope).error.machine_code).toBe(
            "forbidden_role",
        )
    })
})

// ─── (2/3/4) dryRun / refused / committed ──────────────────────────────────

describe("backfill_searchable_text write semantics", () => {
    it("dryRun:true (default) returns plan and writes nothing", async () => {
        resetFixture({ libraryRows: [row("f1"), row("f2")] })
        setStorageBytes("library/f1.pdf", "lyric body one")
        setStorageBytes("library/f2.pdf", "lyric body two")

        const r = await backfillSearchableText("admin-uid", {})
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.dryRun).toBe(true)
        expect(r.committed).toBe(0)
        expect(r.heal.count).toBe(2)
        expect(updateMock).not.toHaveBeenCalled()
    })

    it("real run without force returns refused:true, no writes", async () => {
        resetFixture({ libraryRows: [row("f1")] })
        setStorageBytes("library/f1.pdf", "lyric body one")

        const r = await backfillSearchableText("admin-uid", { dryRun: false })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.refused).toBe(true)
        expect(r.committed).toBe(0)
        expect(updateMock).not.toHaveBeenCalled()
    })

    it("force run writes searchableText + searchableTextBackfilledAt", async () => {
        resetFixture({ libraryRows: [row("f1"), row("f2")] })
        setStorageBytes("library/f1.pdf", "Lyric One")
        setStorageBytes("library/f2.pdf", "Lyric Two")

        const r = await backfillSearchableText("admin-uid", {
            dryRun: false,
            force: true,
        })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.committed).toBe(2)
        expect(updateMock).toHaveBeenCalledTimes(2)
        const firstCall = (updateMock.mock.calls as unknown as Array<
            [{ searchableText: string; searchableTextBackfilledAt: unknown }]
        >)[0]?.[0]
        expect(firstCall.searchableText).toBe("lyric one")
        expect(firstCall.searchableTextBackfilledAt).toBe(
            "__serverTimestamp__",
        )
    })
})

// ─── (5/6) Idempotency + overwrite ──────────────────────────────────────────

describe("backfill_searchable_text idempotency", () => {
    it("skips already-populated rows with reason:already_populated (targeted branch)", async () => {
        resetFixture({
            libraryRows: [
                row("f1", { searchableText: "pre-existing body" }),
            ],
        })
        const r = await backfillSearchableText("admin-uid", {
            dryRun: false,
            force: true,
            fileIds: ["f1"],
        })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.heal.count).toBe(0)
        expect(r.skipped.rows[0]?.reason).toBe("already_populated")
        expect(r.committed).toBe(0)
        expect(updateMock).not.toHaveBeenCalled()
    })

    it("overwrite:true re-extracts already-populated rows", async () => {
        resetFixture({
            libraryRows: [
                row("f1", { searchableText: "stale" }),
            ],
        })
        setStorageBytes("library/f1.pdf", "Fresh Lyrics")

        const r = await backfillSearchableText("admin-uid", {
            dryRun: false,
            force: true,
            overwrite: true,
            fileIds: ["f1"],
        })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.heal.count).toBe(1)
        expect(r.committed).toBe(1)
        const call = (updateMock.mock.calls as unknown as Array<
            [{ searchableText: string }]
        >)[0]?.[0]
        expect(call.searchableText).toBe("fresh lyrics")
    })
})

// ─── (7) Targeted fileIds branch ────────────────────────────────────────────

describe("backfill_searchable_text targeted fileIds", () => {
    it("fetches exact rows via getAll when fileIds[] supplied", async () => {
        resetFixture({
            libraryRows: [row("f1"), row("f2"), row("f3")],
        })
        setStorageBytes("library/f2.pdf", "f2 body")

        const r = await backfillSearchableText("admin-uid", {
            dryRun: true,
            fileIds: ["f2"],
        })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.candidates).toBe(1)
        expect(r.heal.rows[0]?.fileId).toBe("f2")
    })

    it("ignores missing fileIds gracefully", async () => {
        resetFixture({ libraryRows: [row("f1")] })
        setStorageBytes("library/f1.pdf", "body")

        const r = await backfillSearchableText("admin-uid", {
            dryRun: true,
            fileIds: ["f1", "f-does-not-exist"],
        })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        // scanned counts both even though one didn't exist; candidates counts existing
        expect(r.candidates).toBe(1)
    })
})

// ─── (8) Per-row error capture ─────────────────────────────────────────────

describe("backfill_searchable_text error capture", () => {
    it("captures one bad extraction in errors[] without aborting the batch", async () => {
        resetFixture({
            libraryRows: [row("f_bad"), row("f_good")],
            extractByFileId: {
                f_bad: {
                    ok: false,
                    format: "fail",
                    reason: "pdfjs crashed",
                },
            },
        })
        setStorageBytes("library/f_bad.pdf", "bad")
        setStorageBytes("library/f_good.pdf", "good")

        const r = await backfillSearchableText("admin-uid", {
            dryRun: false,
            force: true,
        })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.errors.count).toBe(1)
        expect(r.errors.rows[0]?.message).toContain("pdfjs crashed")
        expect(r.heal.count).toBe(1)
        expect(r.committed).toBe(1)
    })
})

// ─── (9) Skip taxonomy ──────────────────────────────────────────────────────

describe("backfill_searchable_text skip taxonomy", () => {
    it("maps extraction skip:image to extraction_skipped_image", async () => {
        resetFixture({
            libraryRows: [
                row("f_img", { mimeType: "image/jpeg" }),
            ],
        })
        fixture.storageByPath["library/f_img.pdf"] = {
            buffer: Buffer.from([0xff, 0xd8, 0xff]),
            contentType: "image/jpeg",
        }

        const r = await backfillSearchableText("admin-uid", { dryRun: true })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.skipped.rows[0]?.reason).toBe("extraction_skipped_image")
    })

    it("maps extraction skip:audio to extraction_skipped_audio", async () => {
        resetFixture({
            libraryRows: [row("f_aud", { mimeType: "audio/mpeg" })],
        })
        fixture.storageByPath["library/f_aud.pdf"] = {
            buffer: Buffer.from([0xff, 0xfb]),
            contentType: "audio/mpeg",
        }

        const r = await backfillSearchableText("admin-uid", { dryRun: true })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.skipped.rows[0]?.reason).toBe("extraction_skipped_audio")
    })

    it("maps storage not_found to storage_missing", async () => {
        resetFixture({ libraryRows: [row("f_gone")] })
        // No storageByPath entry → downloadFromStoragePath returns not_found

        const r = await backfillSearchableText("admin-uid", { dryRun: true })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.skipped.rows[0]?.reason).toBe("storage_missing")
    })

    it("maps storage network failure to storage_download_failed", async () => {
        resetFixture({ libraryRows: [row("f_neterr")] })
        fixture.storageByPath["library/f_neterr.pdf"] = "network_error"

        const r = await backfillSearchableText("admin-uid", { dryRun: true })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.skipped.rows[0]?.reason).toBe("storage_download_failed")
        expect(r.skipped.rows[0]?.detail).toContain("network down")
    })
})

// ─── (10) Limit / fileIds bound ─────────────────────────────────────────────

describe("backfill_searchable_text bounds", () => {
    it("rejects fileIds[] over MAX_LIMIT with invalid_argument envelope", async () => {
        resetFixture()
        const fileIds = Array.from({ length: 501 }, (_, i) => `f${i}`)
        const r = await backfillSearchableText("admin-uid", {
            dryRun: true,
            fileIds,
        })
        expect(r.ok).toBe(false)
        expect((r as RichErrorEnvelope).error.machine_code).toBe(
            "invalid_argument",
        )
    })
})

// ─── (11) Status filter ─────────────────────────────────────────────────────

describe("backfill_searchable_text status filter (untargeted branch)", () => {
    it("excludes status!=active rows", async () => {
        resetFixture({
            libraryRows: [
                row("f_active"),
                row("f_orphan", { status: "orphaned" }),
                row("f_deleted", { status: "deleted" }),
            ],
        })
        setStorageBytes("library/f_active.pdf", "live body")

        const r = await backfillSearchableText("admin-uid", { dryRun: true })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.candidates).toBe(1)
        expect(r.heal.rows[0]?.fileId).toBe("f_active")
    })

    it("INCLUDES non-active rows when targeted via fileIds[]", async () => {
        // Targeted re-runs are explicit — caller knows what they're doing.
        resetFixture({
            libraryRows: [row("f_orphan", { status: "orphaned" })],
        })
        setStorageBytes("library/f_orphan.pdf", "orphan body")

        const r = await backfillSearchableText("admin-uid", {
            dryRun: true,
            fileIds: ["f_orphan"],
        })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.candidates).toBe(1)
    })
})

// ─── (12) Skipped row taxonomy completeness (no_text) ───────────────────────

describe("backfill_searchable_text empty-extraction", () => {
    it("maps extraction text:null + no_text skipReason to extraction_skipped_no_text", async () => {
        resetFixture({ libraryRows: [row("f_blank")] })
        setStorageBytes("library/f_blank.pdf", "") // empty body → mock returns text:null

        const r = await backfillSearchableText("admin-uid", { dryRun: true })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.skipped.rows[0]?.reason).toBe("extraction_skipped_no_text")
    })
})
