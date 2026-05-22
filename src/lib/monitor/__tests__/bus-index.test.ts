import { describe, it, expect } from "vitest"
import { hasAssignedBus } from "@/lib/monitor/bus-index"

/**
 * DEFECT-REGISTER C-11: bus index 0 is a VALID bus. The old `!myBusIndex`
 * truthiness check dropped commands for a musician assigned bus 0.
 */
describe("hasAssignedBus (C-11 bus-index-0)", () => {
    it("treats bus index 0 as a real assignment (the regression)", () => {
        expect(hasAssignedBus(0)).toBe(true)
    })

    it("treats other valid indices as assigned", () => {
        expect(hasAssignedBus(1)).toBe(true)
        expect(hasAssignedBus(5)).toBe(true)
    })

    it("treats null / undefined as no bus", () => {
        expect(hasAssignedBus(null)).toBe(false)
        expect(hasAssignedBus(undefined)).toBe(false)
    })
})
