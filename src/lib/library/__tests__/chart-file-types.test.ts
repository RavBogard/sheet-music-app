import { describe, it, expect } from "vitest"
import {
    CHART_EXT_TO_MIME,
    ACCEPTED_CHART_EXTENSIONS,
    extOf,
    resolveChartMime,
    isAcceptedChartFile,
} from "../chart-file-types"

describe("extOf", () => {
    it("returns the lowercase extension including the dot", () => {
        expect(extOf("Chart.PDF")).toBe(".pdf")
        expect(extOf("song.MusicXML")).toBe(".musicxml")
    })

    it("returns empty string when there is no extension", () => {
        expect(extOf("README")).toBe("")
        expect(extOf("")).toBe("")
    })
})

describe("resolveChartMime", () => {
    it("resolves .mxl from the extension when reportedMime is octet-stream", () => {
        expect(
            resolveChartMime("Adon Olam.mxl", "application/octet-stream"),
        ).toBe("application/vnd.recordare.musicxml")
    })

    it("resolves uppercase .PDF extension", () => {
        expect(resolveChartMime("Chart.PDF", undefined)).toBe("application/pdf")
    })

    it("prefers an accepted reportedMime even when the filename extension disagrees", () => {
        expect(resolveChartMime("mystery.bin", "application/pdf")).toBe(
            "application/pdf",
        )
    })

    it("returns null when neither the mime nor the extension resolve", () => {
        expect(resolveChartMime("essay.docx", undefined)).toBeNull()
        expect(resolveChartMime("essay.docx", "application/octet-stream")).toBeNull()
    })

    it("returns an empty-name file's accepted reportedMime as-is", () => {
        expect(resolveChartMime("", "image/jpeg")).toBe("image/jpeg")
    })
})

describe("isAcceptedChartFile", () => {
    it("is true when resolveChartMime resolves to a mime", () => {
        expect(isAcceptedChartFile("Adon Olam.mxl", "application/octet-stream")).toBe(
            true,
        )
        expect(isAcceptedChartFile("", "image/jpeg")).toBe(true)
    })

    it("is false when resolveChartMime resolves to null", () => {
        expect(isAcceptedChartFile("essay.docx", undefined)).toBe(false)
    })
})

describe("CHART_EXT_TO_MIME / ACCEPTED_CHART_EXTENSIONS", () => {
    it("ACCEPTED_CHART_EXTENSIONS mirrors the table's keys", () => {
        expect(ACCEPTED_CHART_EXTENSIONS).toEqual(Object.keys(CHART_EXT_TO_MIME))
    })

    it("contains the expected chart extensions", () => {
        for (const ext of [
            ".pdf",
            ".png",
            ".jpg",
            ".jpeg",
            ".heic",
            ".heif",
            ".xml",
            ".musicxml",
            ".mxl",
            ".mscz",
            ".mscx",
            ".txt",
        ]) {
            expect(CHART_EXT_TO_MIME).toHaveProperty(ext)
        }
    })
})
