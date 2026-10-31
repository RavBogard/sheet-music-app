import { describe, expect, it } from "vitest"
import { readClamp } from "@/lib/firestore-monitor-client"

describe("BET-4 clamped ack", () => {
    it("reads the bridge's clamped block", () => {
        expect(readClamp({ requested: 0.95, applied: 0.7, cap: 0.7 })).toEqual({ requested: 0.95, applied: 0.7, cap: 0.7 })
    })

    it("an ack from an older bridge (no clamped field) or a malformed one is no clamp", () => {
        for (const raw of [undefined, null, {}, { applied: "0.7", cap: 0.7 }, { applied: Number.NaN, cap: 0.7 }]) {
            expect(readClamp(raw)).toBeNull()
        }
    })
})
