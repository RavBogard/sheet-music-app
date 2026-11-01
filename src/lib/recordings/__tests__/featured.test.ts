import { describe, it, expect } from "vitest"
import { isPlayable, pickFeatured } from "../featured"
import type { Recording } from "@/types/models"

function rec(id: string, extra: Partial<Recording> = {}): Recording {
    return { id, title: id, storagePath: `recordings/${id}.mp3`, createdAt: "2026-01-01T00:00:00Z", createdBy: "u", ...extra }
}
const src = (confidence: number) => ({ file: "f.mp3", serviceDate: "2026-01-10", startSec: 0, endSec: 60, confidence })

describe("featured take", () => {
    it("pickFeatured ignores held and hidden", () => {
        expect(pickFeatured([rec("h", { status: "held" }), rec("x", { status: "hidden", featured: true })])).toBeNull()
        expect(pickFeatured([rec("h", { status: "held", source: src(0.99) }), rec("l", { status: "live", source: src(0.2) })])?.id).toBe("l")
        expect(isPlayable(rec("a"))).toBe(true)
        expect(isPlayable(rec("b", { status: "held" }))).toBe(false)
    })

    it("explicit featured wins over confidence", () => {
        const picked = pickFeatured([rec("hi", { source: src(0.95) }), rec("chosen", { featured: true, source: src(0.4) })])
        expect(picked?.id).toBe("chosen")
    })

    it("confidence then newest", () => {
        expect(pickFeatured([rec("lo", { source: src(0.6) }), rec("hi", { source: src(0.9) })])?.id).toBe("hi")
        const older = rec("older", { source: src(0.8), createdAt: "2026-01-01T00:00:00Z" })
        const newer = rec("newer", { source: src(0.8), createdAt: { seconds: Date.parse("2026-03-01T00:00:00Z") / 1000 } })
        expect(pickFeatured([older, newer])?.id).toBe("newer")
    })

    it("legacy upload (no source) is playable and ranks as confidence 1", () => {
        expect(pickFeatured([rec("ingest", { source: src(0.97), createdAt: "2026-06-01T00:00:00Z" }), rec("legacy")])?.id).toBe("legacy")
        expect(pickFeatured([rec("legacy")])?.id).toBe("legacy")
    })
})
