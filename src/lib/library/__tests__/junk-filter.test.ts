import { describe, it, expect } from "vitest"
import { isJunkLibraryRow, isNonChartArtifactShape } from "../junk-filter"

/**
 * v11.5-04-02 (library hygiene) — the shared pure junk predicate used by the
 * consumer browse, the bind picker, and (via isNonChartArtifactShape) the MCP
 * read tools. These cases pin BOTH that junk is hidden and that real charts are
 * never misclassified.
 */
describe("junk-filter", () => {
    describe("isNonChartArtifactShape (extracted; MCP-tool parity)", () => {
        it("flags non-chart artifacts", () => {
            expect(isNonChartArtifactShape({ name: ".DS_Store" })).toBe(true)
            expect(isNonChartArtifactShape({ mimeType: "audio/mpeg" })).toBe(true)
            expect(
                isNonChartArtifactShape({
                    mimeType:
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
            ).toBe(true)
            expect(
                isNonChartArtifactShape({ mimeType: "application/vnd.google-apps.folder" }),
            ).toBe(true)
            expect(isNonChartArtifactShape({ mimeType: "application/octet-stream" })).toBe(true)
            expect(isNonChartArtifactShape({ name: "demo.mp3" })).toBe(true)
            expect(isNonChartArtifactShape({ name: "roster.xlsx" })).toBe(true)
        })

        it("does NOT flag real charts", () => {
            expect(
                isNonChartArtifactShape({ name: "Adon Olam.pdf", mimeType: "application/pdf" }),
            ).toBe(false)
            expect(
                isNonChartArtifactShape({
                    name: "Hashkivenu.musicxml",
                    mimeType: "application/vnd.recordare.musicxml+xml",
                }),
            ).toBe(false)
            expect(isNonChartArtifactShape({ name: "chords.txt", mimeType: "text/plain" })).toBe(
                false,
            )
        })
    })

    describe("isJunkLibraryRow", () => {
        it("hides non-chart artifacts", () => {
            expect(isJunkLibraryRow({ name: ".DS_Store", status: "active" })).toBe(true)
            expect(isJunkLibraryRow({ name: "loop.mp3", mimeType: "audio/mpeg" })).toBe(true)
        })

        it("hides reconcile cruft by status", () => {
            expect(isJunkLibraryRow({ name: "X.pdf", status: "orphaned" })).toBe(true)
            expect(isJunkLibraryRow({ name: "X.pdf", status: "duplicate" })).toBe(true)
            expect(isJunkLibraryRow({ name: "X.pdf", status: "archived" })).toBe(true)
        })

        it("hides test-uid-owned rows (the [role-*] tiny cowork seeds)", () => {
            expect(
                isJunkLibraryRow({
                    name: "[role-musician] tiny",
                    status: "active",
                    uploadedBy: "test-musician-abc123",
                }),
            ).toBe(true)
            expect(
                isJunkLibraryRow({
                    name: "[role-band_leader] tiny",
                    uploadedBy: "c7i3a-probe-xyz",
                }),
            ).toBe(true)
        })

        it("does NOT hide a real active chart with a normal uploader", () => {
            expect(
                isJunkLibraryRow({
                    name: "Oseh Shalom.pdf",
                    mimeType: "application/pdf",
                    status: "active",
                    uploadedBy: "9aZ-realfirebaseuid",
                }),
            ).toBe(false)
        })

        it("degrades gracefully on partial records (no uploadedBy → judged on name/mime/status)", () => {
            // Bind-picker shape: title-as-name + status, no uploadedBy.
            expect(isJunkLibraryRow({ name: ".DS_Store", status: "active" })).toBe(true)
            expect(isJunkLibraryRow({ name: "Lecha Dodi.pdf", status: "active" })).toBe(false)
        })
    })
})
