import { describe, expect, it } from "vitest"

import {
    normalizeForMatch,
    matchOrphans,
    type OrphanRow,
} from "../heal-orphans-from-local"

describe("normalizeForMatch", () => {
    it("drops extension, lowercases, strips non-alphanumerics", () => {
        expect(normalizeForMatch("Adon Olam (Folk).pdf")).toBe("adonolamfolk")
        expect(normalizeForMatch("adon_olam-folk.PDF")).toBe("adonolamfolk")
    })
    it("ignores directory components", () => {
        expect(normalizeForMatch("C:/batch/sub/T'Filat Haderech (Friedman).pdf")).toBe(
            "tfilathaderechfriedman",
        )
    })
    it("matches a name without an extension to the same key", () => {
        // upload-keyed rows store `name` without ext, `originalName` with ext
        expect(normalizeForMatch("Ve'imru amen - Full Score")).toBe(
            normalizeForMatch("Ve'imru amen - Full Score.pdf"),
        )
    })

    it("strips the Shireinu/Ruach catalog-code prefix so it matches the prefix-less orphan title", () => {
        // local batch: "993122D003 ADONAI OZ (KLEPPER-FREELANDER).pdf"
        // orphan row title: "Adonai Oz (Klepper-Freelander)"
        expect(normalizeForMatch("993122D003 ADONAI OZ (KLEPPER-FREELANDER).pdf")).toBe(
            normalizeForMatch("Adonai Oz (Klepper-Freelander)"),
        )
        // multi-song entry aligns 1:1 modulo the prefix
        expect(
            normalizeForMatch("993122D001 ABANIBI (HIRSCH) - ACHSHAV (FOLK).pdf"),
        ).toBe(normalizeForMatch("Abanibi (Hirsch) - Achshav (Folk)"))
        // Ruach 994059D prefix also stripped
        expect(normalizeForMatch("994059D012 SHALOM RAV (STEINBERG).pdf")).toBe(
            normalizeForMatch("Shalom Rav (Steinberg)"),
        )
        // a real title that merely starts with a digit is NOT mangled (no 99-prefix)
        expect(normalizeForMatch("36 Tzadikim (Folk).pdf")).toBe("36tzadikimfolk")
    })

    it("matches local catalog-prefixed files end-to-end via matchOrphans", () => {
        const plan = matchOrphans(
            ["993122D900 Adon Olam (Folk).pdf"],
            [{ id: "uuid-adon", title: "Adon Olam (Folk).pdf", fileName: "Adon Olam (Folk).pdf" }],
        )
        expect(plan.matched.map((m) => m.fileId)).toEqual(["uuid-adon"])
        expect(plan.unmatchedLocal).toEqual([])
    })
})

const orphans: OrphanRow[] = [
    { id: "uuid-adon", title: "Adon Olam (Folk).pdf", fileName: "Adon Olam (Folk).pdf" },
    { id: "uuid-tfilat", title: "T'Filat Haderech (Friedman).pdf", fileName: "T'Filat Haderech (Friedman).pdf" },
    { id: "upload-veimru", title: "Ve'imru amen - Full Score", fileName: "Ve'imru amen - Full Score.pdf" },
]

describe("matchOrphans", () => {
    it("matches by exact filename (case/punctuation-insensitive)", () => {
        const plan = matchOrphans(["Adon Olam (Folk).pdf"], orphans)
        expect(plan.matched).toEqual([
            { localFile: "Adon Olam (Folk).pdf", fileId: "uuid-adon", matchedKey: "adonolamfolk", via: "fileName" },
        ])
        expect(plan.unmatchedLocal).toEqual([])
    })

    it("matches a local file whose name lacks ext to a row whose title lacks ext", () => {
        const plan = matchOrphans(["veimru amen - full score.pdf"], orphans)
        expect(plan.matched.map((m) => m.fileId)).toEqual(["upload-veimru"])
    })

    it("reports a local file with no orphan as unmatchedLocal", () => {
        const plan = matchOrphans(["Some Random Chart.pdf"], orphans)
        expect(plan.unmatchedLocal).toEqual(["Some Random Chart.pdf"])
        expect(plan.matched).toEqual([])
    })

    it("reports orphans with no local file as unmatchedOrphan (= data loss)", () => {
        const plan = matchOrphans(["Adon Olam (Folk).pdf"], orphans)
        expect(plan.unmatchedOrphan.map((o) => o.id).sort()).toEqual(
            ["upload-veimru", "uuid-tfilat"],
        )
    })

    it("flags >1 local file sharing a key as ambiguous (no auto-match)", () => {
        const plan = matchOrphans(
            ["Adon Olam (Folk).pdf", "adon-olam-folk.pdf"],
            orphans,
        )
        expect(plan.ambiguous).toHaveLength(1)
        expect(plan.ambiguous[0].localFiles).toHaveLength(2)
        expect(plan.matched).toEqual([])
        // an orphan stuck in ambiguous is NOT counted as data loss
        expect(plan.unmatchedOrphan.map((o) => o.id)).not.toContain("uuid-adon")
    })

    it("flags >1 orphan sharing a key as ambiguous", () => {
        const dupOrphans: OrphanRow[] = [
            { id: "a", title: "Hodu", fileName: "Hodu.pdf" },
            { id: "b", title: "Hodu", fileName: "hodu.PDF" },
        ]
        const plan = matchOrphans(["Hodu.pdf"], dupOrphans)
        expect(plan.ambiguous).toHaveLength(1)
        expect(plan.ambiguous[0].orphanIds.sort()).toEqual(["a", "b"])
        expect(plan.matched).toEqual([])
    })

    it("handles the full 3-row corpus end to end", () => {
        const plan = matchOrphans(
            ["Adon Olam (Folk).pdf", "T'Filat Haderech (Friedman).pdf", "Ve'imru amen - Full Score.pdf", "Extra.pdf"],
            orphans,
        )
        expect(plan.matched.map((m) => m.fileId).sort()).toEqual([
            "upload-veimru",
            "uuid-adon",
            "uuid-tfilat",
        ])
        expect(plan.unmatchedLocal).toEqual(["Extra.pdf"])
        expect(plan.unmatchedOrphan).toEqual([])
        expect(plan.ambiguous).toEqual([])
    })
})
