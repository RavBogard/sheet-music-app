import { describe, it, expect } from "vitest"
import { resolveViewerKind } from "../resolveViewerKind"
import type { SetlistTrack, DriveFile } from "@/types/models"

const track = (overrides: Partial<SetlistTrack> = {}): SetlistTrack => ({
    id: "t1",
    title: "Sample",
    type: "song",
    ...overrides,
})
const lib = (overrides: Partial<DriveFile> = {}): DriveFile => ({
    id: overrides.id ?? "lib-1",
    name: overrides.name ?? "",
    mimeType: overrides.mimeType ?? "",
})

describe("resolveViewerKind", () => {
    describe("priority 1 — libraryRow.mimeType (authoritative)", () => {
        it.each([
            ["application/pdf", "pdf"],
            ["audio/mpeg", "audio"],
            ["audio/mp4", "audio"],
            ["image/png", "image"],
            ["image/heic", "image"],
            ["text/plain", "text"],
            ["application/vnd.recordare.musicxml+xml", "musicxml"],
            ["application/xml", "musicxml"],
            ["application/x-chordpro", "chordpro"],
        ] as const)("maps %s → %s", (mime, kind) => {
            expect(resolveViewerKind(track(), lib({ mimeType: mime }))).toBe(kind)
        })

        it("libraryRow.mimeType beats every other signal (priority-1 dominance)", () => {
            // Track signals all say PDF; library_index says audio → audio wins.
            const t = track({
                fileId: "song.pdf",
                fileName: "song.pdf",
                mimeType: "application/pdf",
            })
            const l = lib({ name: "song.pdf", mimeType: "audio/mpeg" })
            expect(resolveViewerKind(t, l)).toBe("audio")
        })
    })

    describe("priority 2 — libraryRow.name extension (rescue tier)", () => {
        it("libraryRow.name beats track.* when libraryRow.mimeType is empty (octet-stream MusicXML rescue)", () => {
            const t = track({ fileId: "upload-abc-123", fileName: "" })
            // mimeType missing or octet-stream both fall through to name.
            const l = lib({ name: "Mi Chamocha.musicxml", mimeType: "application/octet-stream" })
            expect(resolveViewerKind(t, l)).toBe("musicxml")
        })

        it("libraryRow.name catches legacy audio bond without ext on track.fileId", () => {
            // Adon Olam shape: upload-{uuid} fileId, no track mimeType, but
            // library_index row's filename retains the .mp3 extension.
            const t = track({ fileId: "upload-c7c8-aaaa-bbbb", fileName: "" })
            const l = lib({ name: "Adon Olam.mp3", mimeType: "" })
            expect(resolveViewerKind(t, l)).toBe("audio")
        })
    })

    describe("priority 3 — track.mimeType", () => {
        it("uses track.mimeType when libraryRow has no usable signal", () => {
            const t = track({ fileId: "upload-x", mimeType: "image/png" })
            expect(resolveViewerKind(t, lib())).toBe("image")
        })
    })

    describe("priority 4 — track.fileName extension", () => {
        it("catches audio via track.fileName when track.fileId has no ext", () => {
            const t = track({ fileId: "upload-abc-123", fileName: "hashkiveinu-cantor.m4a" })
            expect(resolveViewerKind(t, lib())).toBe("audio")
        })
    })

    describe("priority 5 — track.fileId extension", () => {
        it.each([
            [".mp3", "audio"],
            [".m4a", "audio"],
            [".wav", "audio"],
            [".pdf", "pdf"],
            [".musicxml", "musicxml"],
            [".xml", "musicxml"],
            [".mxl", "musicxml"],
            [".png", "image"],
            [".jpg", "image"],
            [".jpeg", "image"],
            [".heic", "image"],
            [".txt", "text"],
            [".chordpro", "chordpro"],
        ] as const)("track.fileId ending in %s → %s", (ext, kind) => {
            expect(resolveViewerKind(track({ fileId: `bond${ext}` }), lib())).toBe(kind)
        })

        it("db- prefixed fileId → musicxml (legacy Firestore-backed XML)", () => {
            expect(resolveViewerKind(track({ fileId: "db-abc123" }), lib())).toBe("musicxml")
        })
    })

    describe("priority 6 — terminal", () => {
        it("no signals → 'pdf' (legacy Drive bond default; preserves existing behavior)", () => {
            // Bare Drive ID, no fileName, no mimeType, no libraryRow.
            expect(resolveViewerKind(track({ fileId: "file-a" }), undefined)).toBe("pdf")
        })

        it("upload-{uuid} with empty libraryRow → 'pdf' (no info → legacy default)", () => {
            expect(resolveViewerKind(track({ fileId: "upload-deadbeef-0000" }), lib())).toBe("pdf")
        })

        it("positively-unrecognized libraryRow.mimeType → 'unknown'", () => {
            const t = track({ fileId: "upload-x" })
            const l = lib({ mimeType: "application/x-something-weird" })
            expect(resolveViewerKind(t, l)).toBe("unknown")
        })

        it("positively-unrecognized libraryRow.name extension → 'unknown'", () => {
            const t = track({ fileId: "upload-x" })
            const l = lib({ name: "resume.docx" })
            expect(resolveViewerKind(t, l)).toBe("unknown")
        })

        it("octet-stream mime BUT no name → 'unknown' (no rescue signal)", () => {
            const t = track({ fileId: "upload-x" })
            const l = lib({ mimeType: "application/octet-stream", name: "" })
            expect(resolveViewerKind(t, l)).toBe("unknown")
        })

        it("track.fileId with positively-unrecognized ext but no libraryRow signal → 'pdf' (track-side hints don't trigger unknown)", () => {
            // Why the terminal 'unknown' probe checks libraryRow only and
            // not track.fileId: track-side fields are missing-by-default
            // on legacy bonds, so a `.docx` here is much more likely a
            // noisy id than a real weird-ext bond. The library_index row
            // is the only place we trust an "I positively know what this
            // is" signal to fire 'unknown' from.
            const t = track({ fileId: "thing.docx" })
            expect(resolveViewerKind(t, lib())).toBe("pdf")
        })
    })

    describe("regression — Adon Olam shapes", () => {
        it("type:'song' + fileId ending in .mp3 → 'audio' (was: 'pdf' 404)", () => {
            const t = track({
                type: "song",
                fileId: "12JfLCHytM5q59btBQ05sz-V_SurQmUoT.mp3",
            })
            expect(resolveViewerKind(t, lib())).toBe("audio")
        })

        it("type:'song' + upload-{uuid} + libraryRow.name='Adon Olam.mp3' → 'audio' (was: 'pdf' 404)", () => {
            const t = track({ type: "song", fileId: "upload-c7c8-aaaa-bbbb" })
            const l = lib({ name: "Adon Olam.mp3" })
            expect(resolveViewerKind(t, l)).toBe("audio")
        })

        it("type:'song' + upload-{uuid} + libraryRow.mimeType='audio/mpeg' → 'audio' (was: 'pdf' 404)", () => {
            const t = track({ type: "song", fileId: "upload-c7c8-aaaa-bbbb" })
            const l = lib({ mimeType: "audio/mpeg" })
            expect(resolveViewerKind(t, l)).toBe("audio")
        })
    })

    describe("null safety", () => {
        it("track null → 'unknown'", () => {
            expect(resolveViewerKind(null, lib())).toBe("unknown")
        })

        it("libraryRow null → track signals still apply", () => {
            expect(resolveViewerKind(track({ fileId: "song.mp3" }), null)).toBe("audio")
        })
    })
})
