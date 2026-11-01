import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: vi.fn(), getFirestore: vi.fn() }))
vi.mock("@/lib/file-fetcher", () => ({ fetchFileById: vi.fn() }))

import { listPresetsForOrg, partNamesFromXml } from "../part-presets"

/** A one-collection stand-in honouring where(field, "==", value). */
function fakeDb(docs: Record<string, unknown>[]) {
    return {
        collection: () => ({
            where: (field: string, _op: string, value: unknown) => ({
                get: async () => {
                    const hits = docs.filter((d) => d[field] === value)
                    return { forEach: (fn: (d: { data: () => unknown }) => void) => hits.forEach((h) => fn({ data: () => h })) }
                },
            }),
        }),
    } as unknown as FirebaseFirestore.Firestore
}

const A = { orgId: "crc", scope: { kind: "user", uid: "u1" }, patterns: ["Bass"], updatedAt: "t" }
const B = { orgId: "brotherslazaroff", scope: { kind: "instrument", instrument: "piano" }, patterns: ["Piano"], updatedAt: "t" }

describe("list_part_presets tenant wall", () => {
    it("tenant B never sees tenant A presets, and the reverse", async () => {
        const db = fakeDb([A, B])
        const forB = await listPresetsForOrg(db, "brotherslazaroff")
        expect(forB.presets.map((p) => p.patterns)).toEqual([["Piano"]])
        const forA = await listPresetsForOrg(db, "crc")
        expect(forA.presets.map((p) => p.patterns)).toEqual([["Bass"]])
    })

    it("filters by instrument loosely", async () => {
        const db = fakeDb([B])
        expect((await listPresetsForOrg(db, "brotherslazaroff", { instrument: "Piano" })).presets).toHaveLength(1)
        expect((await listPresetsForOrg(db, "brotherslazaroff", { instrument: "bass" })).presets).toHaveLength(0)
    })
})

describe("partNamesFromXml", () => {
    it("reads part names in score order and decodes entities", () => {
        const xml = `<score-partwise><part-list>
          <score-part id="P1"><part-name>Bass &amp; Keys</part-name></score-part>
          <score-part id="P2"><part-name print-object="no"></part-name></score-part>
          <score-part id="P3"><part-name>Vocals</part-name></score-part>
        </part-list><part id="P1"/></score-partwise>`
        expect(partNamesFromXml(xml)).toEqual(["Bass & Keys", "", "Vocals"])
    })
})
