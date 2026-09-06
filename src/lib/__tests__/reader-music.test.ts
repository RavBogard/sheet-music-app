import { describe, expect, it, vi } from "vitest"

import {
    selectLatestReaderMusic,
    type ReaderMusicCrosswalk,
    type ReaderMusicSetlist,
} from "@/lib/reader-music"
import type { LocalTrack } from "@/lib/local/types"

const crosswalk: ReaderMusicCrosswalk = {
    orgId: "crc",
    momentId: "unit-1",
    pieceId: "piece-1",
    status: "reviewed",
}
const now = Date.parse("2026-09-06T12:00:00Z")

function setlist(
    id: string,
    eventDate: unknown,
    extra: Partial<ReaderMusicSetlist> = {},
): ReaderMusicSetlist {
    return {
        id,
        orgId: "crc",
        eventDate,
        isTest: false,
        isTemplate: false,
        ...extra,
    }
}

function track(id: string, extra: Partial<LocalTrack> = {}): LocalTrack {
    return {
        id,
        setlistId: "ignored",
        order: 0,
        songId: "song-1",
        fileId: "file-1",
        title: "Mi Chamocha",
        key: "Em",
        arrangement: "Band",
        version: "v3",
        mimeType: "application/pdf",
        readerMusic: { momentId: "unit-1", pieceId: "piece-1" },
        ...extra,
    }
}

function deps(rows: Record<string, LocalTrack[]>, active = true) {
    return {
        getTracksForSetlist: vi.fn(async (id: string) => rows[id] ?? []),
        isBindingAuthorized: vi.fn(async () => active),
    }
}

describe("selectLatestReaderMusic", () => {
    it("chooses the newest eligible past occurrence and preserves the exact binding", async () => {
        const d = deps({ older: [track("t-old", { key: "D" })], newest: [track("t-new")] })
        const result = await selectLatestReaderMusic(
            [
                setlist("older", "2026-08-01T18:00:00Z"),
                setlist("newest", "2026-09-01T18:00:00Z"),
            ],
            crosswalk,
            now,
            d,
        )
        expect(result).toEqual({
            status: "available",
            binding: expect.objectContaining({
                setlistId: "newest",
                trackId: "t-new",
                songId: "song-1",
                fileId: "file-1",
                key: "Em",
                arrangement: "Band",
                version: "v3",
                lastUsedDate: "2026-09-01",
                lastUsedLabel: "Last used 2026-09-01",
            }),
        })
    })

    it("uses the legacy date only when eventDate is absent or unparseable", async () => {
        const d = deps({ legacy: [track("t")] })
        const result = await selectLatestReaderMusic(
            [setlist("legacy", "bad", { date: "2026-08-20" })],
            crosswalk,
            now,
            d,
        )
        expect(result.status).toBe("available")
        if (result.status === "available") {
            expect(result.binding.lastUsedDate).toBe("2026-08-20")
        }
    })

    it("reports the service calendar date rather than the next UTC day", async () => {
        const d = deps({ friday: [track("t")] })
        const result = await selectLatestReaderMusic(
            [setlist("friday", "2026-08-28T19:00:00-05:00")],
            crosswalk,
            now,
            d,
        )
        expect(result.status).toBe("available")
        if (result.status === "available") {
            expect(result.binding.lastUsedLabel).toBe("Last used 2026-08-28")
        }
    })

    it("excludes future, undated, test, template, and cross-org setlists", async () => {
        const d = deps({ valid: [track("valid")] })
        const result = await selectLatestReaderMusic(
            [
                setlist("future", "2026-10-01", { date: "2020-01-01" }),
                setlist("undated", undefined, { date: undefined }),
                setlist("test", "2026-09-05", { isTest: true }),
                setlist("unknown-test", "2026-09-05", { isTest: undefined }),
                setlist("template", "2026-09-05", { isTemplate: true }),
                setlist("other", "2026-09-05", { orgId: "other" }),
                setlist("valid", "2026-08-01"),
            ],
            crosswalk,
            now,
            d,
        )
        expect(result.status).toBe("available")
        expect(d.getTracksForSetlist).toHaveBeenCalledTimes(1)
        expect(d.getTracksForSetlist).toHaveBeenCalledWith("valid", expect.anything())
    })

    it("requires exact persisted moment and piece ids (no title matching)", async () => {
        const d = deps({ s: [track("wrong", { readerMusic: { momentId: "unit-1", pieceId: "other" }, title: "unit-1 piece-1" })] })
        await expect(
            selectLatestReaderMusic([setlist("s", "2026-08-01")], crosswalk, now, d),
        ).resolves.toEqual({ status: "unavailable" })
    })

    it("treats same-instant differing bindings as ambiguous", async () => {
        const d = deps({
            a: [track("ta", { fileId: "file-a" })],
            b: [track("tb", { fileId: "file-b" })],
        })
        await expect(
            selectLatestReaderMusic(
                [setlist("a", "2026-09-01"), setlist("b", "2026-09-01")],
                crosswalk,
                now,
                d,
            ),
        ).resolves.toEqual({ status: "unavailable" })
        expect(d.isBindingAuthorized).not.toHaveBeenCalled()
    })

    it("does not fall back when the latest occurrence is unbound", async () => {
        const d = deps({
            old: [track("old")],
            latest: [track("latest", { fileId: undefined })],
        })
        await expect(
            selectLatestReaderMusic(
                [setlist("old", "2026-08-01"), setlist("latest", "2026-09-01")],
                crosswalk,
                now,
                d,
            ),
        ).resolves.toEqual({ status: "unavailable" })
    })

    it("does not fall back when the latest binding is missing or revoked", async () => {
        const d = deps({
            old: [track("old")],
            latest: [track("latest", { fileId: "revoked" })],
        }, false)
        await expect(
            selectLatestReaderMusic(
                [setlist("old", "2026-08-01"), setlist("latest", "2026-09-01")],
                crosswalk,
                now,
                d,
            ),
        ).resolves.toEqual({ status: "unavailable" })
        expect(d.isBindingAuthorized).toHaveBeenCalledTimes(1)
        expect(d.isBindingAuthorized).toHaveBeenCalledWith(
            expect.objectContaining({ fileId: "revoked", setlistId: "latest" }),
        )
    })
})
