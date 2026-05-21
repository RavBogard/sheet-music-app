import { describe, it, expect, vi } from "vitest"

// ConfigManager's constructor initializes firebase-admin. Stub it so this unit
// test never touches a real Firebase app: `apps` is non-empty so the
// initializeApp branch is skipped, and firestore() returns a throwaway. Both
// getUserBus and isAuthorized are pure over the in-memory config, so nothing
// else from firebase-admin is exercised.
vi.mock("firebase-admin", () => ({
    apps: [{ name: "[DEFAULT]" }],
    firestore: vi.fn(() => ({})),
}))

import { ConfigManager } from "../config"
import type { BusAssignment, MonitorConfig } from "../types"

type BusAssignments = MonitorConfig["busAssignments"]

function managerWith(busAssignments: BusAssignments): ConfigManager {
    const cm = new ConfigManager()
    ;(cm as unknown as { config: MonitorConfig }).config = {
        bridgeUrl: "wss://localhost:9001",
        x32Address: "192.168.1.100",
        x32Port: 10023,
        monitorBuses: [1, 2, 3, 4],
        busAssignments,
    }
    return cm
}

const guitar: BusAssignment = { userId: "uid-guitar", userName: "Guitar" }
const bass: BusAssignment = { userId: "uid-bass", userName: "Bass" }
const keys: BusAssignment = { userId: "uid-keys", userName: "Keys" }

describe("ConfigManager.getUserBus — array-aware bus assignment (BR-04)", () => {
    it("resolves the bus for the ARRAY shape the in-app panel writes (single occupant)", () => {
        // The exact shape BusAssignmentPanel.saveAssignments writes
        // (busAssignments[bus] = BusAssignment[]). Pre-fix this returned null
        // because `assignment.userId` on an array is undefined → the BR-04
        // musician lockout.
        const cm = managerWith({ "2": [guitar] })
        expect(cm.getUserBus("uid-guitar")).toBe(2)
    })

    it("resolves co-owned buses (multiple users in one array)", () => {
        const cm = managerWith({ "3": [bass, keys] })
        expect(cm.getUserBus("uid-bass")).toBe(3)
        expect(cm.getUserBus("uid-keys")).toBe(3)
    })

    it("still resolves the legacy single-object shape", () => {
        const cm = managerWith({ "1": guitar })
        expect(cm.getUserBus("uid-guitar")).toBe(1)
    })

    it("handles a mix of array and single-object entries", () => {
        const cm = managerWith({ "1": guitar, "4": [bass, keys] })
        expect(cm.getUserBus("uid-guitar")).toBe(1)
        expect(cm.getUserBus("uid-keys")).toBe(4)
    })

    it("returns null for an unassigned user", () => {
        const cm = managerWith({ "2": [guitar] })
        expect(cm.getUserBus("uid-nobody")).toBeNull()
    })

    it("skips null bus entries without throwing", () => {
        const cm = managerWith({ "2": null, "3": [bass] })
        expect(cm.getUserBus("uid-bass")).toBe(3)
        expect(cm.getUserBus("uid-nobody")).toBeNull()
    })

    it("authorizes a non-engineer musician whose bus is array-assigned — the BR-04 lockout", () => {
        const cm = managerWith({ "2": [guitar] })
        // role=musician, soundEngineer=false: the exact non-engineer path that
        // resolved to false before the fix (getUserBus returned null → no
        // has-bus access → command rejected as "Unauthorized").
        expect(cm.isAuthorized("uid-guitar", "musician", false)).toBe(true)
        expect(cm.isAuthorized("uid-nobody", "musician", false)).toBe(false)
    })
})
