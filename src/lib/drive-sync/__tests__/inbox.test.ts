import { describe, expect, it, vi } from "vitest"
import {
    chartInboxUrl,
    MCP_SYNC_FILE_CAP,
    readChartInboxStatus,
    resolveChartInboxFolderId,
    syncChartInboxNow,
    type InboxStatusDb,
} from "@/lib/drive-sync/inbox"
import type { DriveSyncDeps, DriveSyncResult } from "@/lib/drive-sync/poller"

const INBOX = "1ZNdvVKeFa7jjP_iLYBv5vXaB7DyA3tTB"
const SUB = "1SubFolderAAAAAAAAAAAAAAAAAAAAAAA"

function fakeDb(opts: {
    state?: Record<string, unknown> | null
    rows?: Array<{ id: string; data: Record<string, unknown> }>
    onWhere?: (field: string, op: string, value: string[]) => void
}): InboxStatusDb {
    return {
        collection(name: string) {
            return {
                doc(id: string) {
                    return {
                        async get() {
                            if (name !== "driveWatchState" || id !== INBOX || !opts.state) {
                                return { exists: false, data: () => undefined }
                            }
                            return { exists: true, data: () => opts.state ?? undefined }
                        },
                    }
                },
                where(field: string, op: "array-contains-any", value: string[]) {
                    opts.onWhere?.(field, op, value)
                    return {
                        limit() {
                            return {
                                async get() {
                                    return {
                                        docs: (opts.rows ?? []).map((r) => ({
                                            id: r.id,
                                            data: () => r.data,
                                        })),
                                    }
                                },
                            }
                        },
                    }
                },
            }
        },
    }
}

describe("resolveChartInboxFolderId", () => {
    it("prefers CHART_INBOX_DRIVE_FOLDER_ID over the legacy David variable", () => {
        expect(
            resolveChartInboxFolderId({
                CHART_INBOX_DRIVE_FOLDER_ID: INBOX,
                DAVID_DRIVE_DROP_FOLDER_ID: "legacy",
            }),
        ).toBe(INBOX)
    })
    it("falls back to the legacy variable when the new one is blank", () => {
        expect(
            resolveChartInboxFolderId({
                CHART_INBOX_DRIVE_FOLDER_ID: "   ",
                DAVID_DRIVE_DROP_FOLDER_ID: "legacy",
            }),
        ).toBe("legacy")
    })
    it("returns null when both are unset or empty strings (the prod state that left the cron dormant)", () => {
        expect(resolveChartInboxFolderId({})).toBeNull()
        expect(
            resolveChartInboxFolderId({
                CHART_INBOX_DRIVE_FOLDER_ID: "",
                DAVID_DRIVE_DROP_FOLDER_ID: "",
            }),
        ).toBeNull()
    })
})

describe("chartInboxUrl", () => {
    it("builds the Drive folder link", () => {
        expect(chartInboxUrl(INBOX)).toBe(
            `https://drive.google.com/drive/folders/${INBOX}`,
        )
    })
})

describe("readChartInboxStatus", () => {
    it("reports unconfigured without touching Firestore when there is no folder id", async () => {
        const db = fakeDb({ onWhere: () => { throw new Error("should not query") } })
        const s = await readChartInboxStatus(db, null)
        expect(s.configured).toBe(false)
        expect(s.folderUrl).toBeNull()
        expect(s.recentImports).toEqual([])
    })

    it("configured but never ticked → watching:false, still lists nothing", async () => {
        const s = await readChartInboxStatus(fakeDb({ state: null }), INBOX)
        expect(s.configured).toBe(true)
        expect(s.watching).toBe(false)
        expect(s.folderUrl).toContain(INBOX)
        expect(s.pollIntervalMinutes).toBe(5)
    })

    it("surfaces watcher health, subfolder map, and recent imports newest-first", async () => {
        const seen: string[][] = []
        const db = fakeDb({
            state: {
                parentFolderId: INBOX,
                lastTickAt: "2026-09-11T14:00:00.000Z",
                lastSuccessfulSyncAt: "2026-09-11T14:00:00.000Z",
                lastError: null,
                consecutiveFailures: 0,
                collectionMap: { [SUB]: { name: "Core drops", collection: "core" } },
            },
            rows: [
                { id: "a", data: { name: "Older.pdf", uploadedAt: "2026-09-11T13:00:00Z", collection: "supplemental", status: "active", driveFileId: "dA" } },
                { id: "b", data: { name: "Newer.pdf", uploadedAt: "2026-09-11T13:30:00Z", collection: "core", status: "active", driveFileId: "dB" } },
            ],
            onWhere: (_f, _op, value) => seen.push(value),
        })
        const s = await readChartInboxStatus(db, INBOX, { recentLimit: 5 })
        expect(s.watching).toBe(true)
        expect(s.lastTickAt).toBe("2026-09-11T14:00:00.000Z")
        expect(s.subfolders).toEqual([{ id: SUB, name: "Core drops", collection: "core" }])
        // The provenance query covers the inbox root AND every mapped subfolder.
        expect(seen[0]).toEqual([INBOX, SUB])
        expect(s.recentImports.map((r) => r.fileId)).toEqual(["b", "a"])
        expect(s.recentImports[0]).toMatchObject({ name: "Newer.pdf", collection: "core", driveFileId: "dB" })
    })
})

describe("syncChartInboxNow", () => {
    const deps = {} as DriveSyncDeps
    const base: DriveSyncResult = {
        watching: true,
        parentFolderId: INBOX,
        filesScanned: 0,
        imported: 0,
        renamed: 0,
        replaced: 0,
        moved: 0,
        skipped: 0,
        queued: 0,
        errors: [],
    }

    it("runs one tick with the MCP file cap and reports capReached:false when under it", async () => {
        const run = vi.fn(async () => ({ ...base, filesScanned: 3, imported: 3 }))
        const r = await syncChartInboxNow(INBOX, deps, { run })
        expect(run).toHaveBeenCalledWith({ deps, parentFolderId: INBOX, perTickFileCap: MCP_SYNC_FILE_CAP })
        expect(r.imported).toBe(3)
        expect(r.capReached).toBe(false)
        expect(r.folderUrl).toContain(INBOX)
    })

    it("flags capReached when the tick scanned as many files as the cap", async () => {
        const run = vi.fn(async () => ({ ...base, filesScanned: 4, imported: 4 }))
        const r = await syncChartInboxNow(INBOX, deps, { run, fileCap: 4 })
        expect(r.capReached).toBe(true)
        expect(r.fileCap).toBe(4)
    })

    it("clamps a requested cap into [1, 25]", async () => {
        const caps: Array<number | undefined> = []
        const run = vi.fn(async (o: { perTickFileCap?: number }) => {
            caps.push(o.perTickFileCap)
            return base
        })
        await syncChartInboxNow(INBOX, deps, { run, fileCap: 999 })
        await syncChartInboxNow(INBOX, deps, { run, fileCap: 0 })
        expect(caps).toEqual([25, 1])
    })
})
