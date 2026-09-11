import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    createBatch,
    getBatch,
    addItems,
    updateItem,
    setBatchStatus,
    listParkedForOrg,
} from "../batch-store"
import {
    BATCH_COLLECTION,
    MAX_ITEMS_PER_BATCH,
    newItemId,
    titleFromFileName,
    type UploadBatchItem,
} from "../batch-types"

function item(fileName: string, overrides: Partial<UploadBatchItem> = {}): UploadBatchItem {
    return {
        itemId: newItemId(),
        fileName,
        mimeType: "application/pdf",
        sizeBytes: 1234,
        title: titleFromFileName(fileName),
        status: "awaiting-bytes",
        updatedAt: new Date().toISOString(),
        ...overrides,
    }
}

describe("batch-store (emulator)", () => {
    let app: App
    const OWNER = "rabbi-daniel"
    const ORG = "crc"
    const OTHER_ORG = "broslaz"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-batch-store" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const snap = await db().collection(BATCH_COLLECTION).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    it("createBatch writes an open batch with zeroed counts and a 24h expiry", async () => {
        const before = Date.now()
        const { batchId, expiresAt } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: { collection: "uploads", tags: ["shabbat"] },
        })

        expect(batchId).toMatch(/^ub-[0-9a-f]{12}$/)
        expect(expiresAt.getTime()).toBeGreaterThan(before)

        const batch = await getBatch(db(), batchId)
        expect(batch).not.toBeNull()
        expect(batch!.batchId).toBe(batchId)
        expect(batch!.status).toBe("open")
        expect(batch!.ownerUid).toBe(OWNER)
        expect(batch!.orgId).toBe(ORG)
        expect(batch!.source).toBe("dropzone")
        expect(batch!.defaults).toEqual({ collection: "uploads", tags: ["shabbat"] })
        expect(batch!.items).toEqual({})
        expect(batch!.counts).toEqual({
            total: 0,
            pending: 0,
            imported: 0,
            parked: 0,
            failed: 0,
            skipped: 0,
        })
    })

    it("getBatch returns null for an unknown batch", async () => {
        expect(await getBatch(db(), "ub-000000000000")).toBeNull()
    })

    it("addItems stores items and recomputes counts", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        const a = item("Mi_Chamocha-Friedman (2).pdf")
        const b = item("Adon Olam.musicxml", { mimeType: "application/vnd.recordare.musicxml+xml" })
        await addItems(db(), batchId, [a, b])

        const batch = await getBatch(db(), batchId)
        expect(batch!.counts.total).toBe(2)
        expect(batch!.counts.pending).toBe(2)
        expect(Object.keys(batch!.items).sort()).toEqual([a.itemId, b.itemId].sort())
        expect(batch!.items[a.itemId].title).toBe("Mi Chamocha Friedman (2)")
    })

    it("updateItem merges a patch, bumps updatedAt and recomputes counts", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        const a = item("A.pdf", { updatedAt: "2000-01-01T00:00:00.000Z" })
        const b = item("B.pdf", { updatedAt: "2000-01-01T00:00:00.000Z" })
        await addItems(db(), batchId, [a, b])

        const doc = await updateItem(db(), batchId, a.itemId, {
            status: "imported",
            resultFileId: "file-xyz",
        })

        expect(doc.counts.imported).toBe(1)
        expect(doc.counts.pending).toBe(1)
        expect(doc.counts.total).toBe(2)
        expect(doc.items[a.itemId].resultFileId).toBe("file-xyz")
        // untouched fields survive the merge
        expect(doc.items[a.itemId].fileName).toBe("A.pdf")
        expect(doc.items[a.itemId].updatedAt).not.toBe("2000-01-01T00:00:00.000Z")
        expect(doc.items[b.itemId].status).toBe("awaiting-bytes")

        const reread = await getBatch(db(), batchId)
        expect(reread!.counts.imported).toBe(1)
    })

    it("updateItem tolerates undefined-valued patch fields (Firestore rejects undefined)", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        const a = item("Dup.pdf")
        await addItems(db(), batchId, [a])

        const doc = await updateItem(db(), batchId, a.itemId, {
            status: "parked",
            parked: {
                reason: "duplicate_similar",
                matchedFileId: "file-abc",
                matchedTitle: "Shalom Rav",
                score: undefined,
            },
        })
        expect(doc.counts.parked).toBe(1)
        expect(doc.items[a.itemId].parked?.matchedFileId).toBe("file-abc")
    })

    it("updateItem throws item_not_found for an unknown item", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        await expect(
            updateItem(db(), batchId, "it-deadbeef", { status: "imported" }),
        ).rejects.toThrow("item_not_found")
    })

    it("addItems on a committed batch throws batch_not_open", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        await setBatchStatus(db(), batchId, "committed", {
            committedAt: new Date(),
            inngestEventId: "evt-1",
        })

        const after = await getBatch(db(), batchId)
        expect(after!.status).toBe("committed")
        expect(after!.inngestEventId).toBe("evt-1")

        await expect(addItems(db(), batchId, [item("C.pdf")])).rejects.toThrow(
            "batch_not_open",
        )
    })

    it("addItems past MAX_ITEMS_PER_BATCH throws batch_full", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "cli",
            defaults: {},
        })
        const many = Array.from({ length: MAX_ITEMS_PER_BATCH + 1 }, (_, i) =>
            item(`f${i}.pdf`),
        )
        await expect(addItems(db(), batchId, many)).rejects.toThrow("batch_full")

        // nothing was written
        const batch = await getBatch(db(), batchId)
        expect(batch!.counts.total).toBe(0)
    })

    it("addItems fills exactly to the cap, and one more overflows", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "cli",
            defaults: {},
        })
        const full = Array.from({ length: MAX_ITEMS_PER_BATCH }, (_, i) =>
            item(`f${i}.pdf`),
        )
        await addItems(db(), batchId, full)
        expect((await getBatch(db(), batchId))!.counts.total).toBe(MAX_ITEMS_PER_BATCH)
        await expect(addItems(db(), batchId, [item("one-too-many.pdf")])).rejects.toThrow(
            "batch_full",
        )
    })

    it("listParkedForOrg returns only this org's parked items", async () => {
        // org batch with one parked item
        const mine = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        const parkedItem = item("Hashkivenu.pdf")
        const importedItem = item("Oseh Shalom.pdf")
        await addItems(db(), mine.batchId, [parkedItem, importedItem])
        await updateItem(db(), mine.batchId, parkedItem.itemId, {
            status: "parked",
            parked: {
                reason: "duplicate_exact",
                matchedFileId: "file-1",
                matchedTitle: "Hashkivenu (Klepper)",
                score: 1,
            },
        })
        await updateItem(db(), mine.batchId, importedItem.itemId, {
            status: "imported",
            resultFileId: "file-2",
        })

        // same org, nothing parked
        const clean = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        const okItem = item("Lecha Dodi.pdf")
        await addItems(db(), clean.batchId, [okItem])
        await updateItem(db(), clean.batchId, okItem.itemId, {
            status: "imported",
            resultFileId: "file-3",
        })

        // other org, parked
        const theirs = await createBatch(db(), {
            ownerUid: "other-uid",
            orgId: OTHER_ORG,
            source: "dropzone",
            defaults: {},
        })
        const theirParked = item("Theirs.pdf")
        await addItems(db(), theirs.batchId, [theirParked])
        await updateItem(db(), theirs.batchId, theirParked.itemId, {
            status: "parked",
            parked: {
                reason: "duplicate_similar",
                matchedFileId: "file-9",
                matchedTitle: "Theirs",
                score: 0.9,
            },
        })

        const rows = await listParkedForOrg(db(), ORG)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            batchId: mine.batchId,
            itemId: parkedItem.itemId,
            fileName: "Hashkivenu.pdf",
            title: "Hashkivenu",
        })
        expect(rows[0].parked.matchedFileId).toBe("file-1")
        expect(typeof rows[0].createdAt).toBe("string")

        expect(await listParkedForOrg(db(), OTHER_ORG)).toHaveLength(1)
        expect(await listParkedForOrg(db(), "nobody")).toHaveLength(0)
    })

    it("listParkedForOrg honours the limit", async () => {
        const b = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: {},
        })
        const items = [item("P1.pdf"), item("P2.pdf"), item("P3.pdf")]
        await addItems(db(), b.batchId, items)
        for (const it of items) {
            await updateItem(db(), b.batchId, it.itemId, {
                status: "parked",
                parked: {
                    reason: "duplicate_exact",
                    matchedFileId: "file-x",
                    matchedTitle: "X",
                    score: 1,
                },
            })
        }
        expect(await listParkedForOrg(db(), ORG, 2)).toHaveLength(2)
    })
})
