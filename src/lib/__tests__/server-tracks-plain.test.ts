import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { toPlain } from "@/lib/server-tracks"

class FakeTimestamp {
    constructor(private ms: number) {}
    toMillis() {
        return this.ms
    }
}

describe("toPlain (Perform SSR rows)", () => {
    it("turns every Timestamp-like value into millis, at any depth", () => {
        const row = { createdAt: new FakeTimestamp(5), gig: { at: new FakeTimestamp(7) }, list: [new FakeTimestamp(9)], n: 1, s: "x", z: null }
        const out = toPlain(row) as Record<string, unknown>
        expect(out).toEqual({ createdAt: 5, gig: { at: 7 }, list: [9], n: 1, s: "x", z: null })
        // Only plain objects remain, so React can pass it to a Client Component.
        expect(Object.getPrototypeOf(out.gig)).toBe(Object.prototype)
    })
})
