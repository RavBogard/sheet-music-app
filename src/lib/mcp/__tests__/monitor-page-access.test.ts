import { describe, expect, it } from "vitest"
import { hasMonitorPageAccess, getOwnedBuses } from "@/lib/mcp/server-monitor"
import type { MonitorConfig } from "@/types/monitor"

/**
 * Lane C-1 regression — server `/monitor` page access gate
 * (`hasMonitorPageAccess`, used by `src/app/(main)/monitor/page.tsx`).
 *
 * The bug (AUDIT-consumers C-1): the page indexed `config.busAssignments[uid]`,
 * but `busAssignments` is keyed by BUS INDEX (stringified number), not uid —
 * so a plain musician assigned their own IEM bus never matched and was denied
 * at the server, never loading the mixer UI. The fix reuses `getOwnedBuses`
 * (value-iterating, array-aware) so the server gate agrees with the client
 * `useMonitorAccess` hook (`src/hooks/use-monitor-access.ts:59-67`).
 */

const MUSICIAN = "uid-musician"
const OTHER = "uid-other"

function configWith(
    busAssignments: MonitorConfig["busAssignments"],
): MonitorConfig {
    return {
        bridgeUrl: "",
        x32Address: "",
        x32Port: 10023,
        monitorBuses: [1, 2, 3, 4, 5],
        busAssignments,
    }
}

const notPrivileged = { isAdmin: false, isSoundEngineer: false }

describe("hasMonitorPageAccess (server /monitor gate)", () => {
    it("ALLOWS a plain musician assigned to their own bus (single-object form)", () => {
        // bus index 3 owned by the musician — the exact North Star scenario the
        // old `busAssignments[uid]` lookup wrongly denied.
        const config = configWith({
            "3": { userId: MUSICIAN, userName: "Musician" },
        })
        expect(hasMonitorPageAccess(notPrivileged, config, MUSICIAN)).toBe(true)
    })

    it("ALLOWS a musician when their bus is stored in the array (co-owned) form", () => {
        const config = configWith({
            "4": [
                { userId: OTHER, userName: "Other" },
                { userId: MUSICIAN, userName: "Musician" },
            ],
        })
        expect(hasMonitorPageAccess(notPrivileged, config, MUSICIAN)).toBe(true)
        // co-owner on the same bus also passes
        expect(hasMonitorPageAccess(notPrivileged, config, OTHER)).toBe(true)
    })

    it("DENIES a non-privileged user with no bus assigned", () => {
        const config = configWith({
            "3": { userId: OTHER, userName: "Other" },
        })
        expect(hasMonitorPageAccess(notPrivileged, config, MUSICIAN)).toBe(false)
    })

    it("DENIES a non-privileged user when busAssignments is empty", () => {
        expect(hasMonitorPageAccess(notPrivileged, configWith({}), MUSICIAN)).toBe(false)
    })

    it("ALLOWS admins regardless of bus assignment (and without a config)", () => {
        expect(
            hasMonitorPageAccess({ isAdmin: true, isSoundEngineer: false }, null, MUSICIAN),
        ).toBe(true)
        expect(
            hasMonitorPageAccess({ isAdmin: true, isSoundEngineer: false }, configWith({}), MUSICIAN),
        ).toBe(true)
    })

    it("ALLOWS sound engineers regardless of bus assignment (and without a config)", () => {
        expect(
            hasMonitorPageAccess({ isAdmin: false, isSoundEngineer: true }, null, MUSICIAN),
        ).toBe(true)
    })

    it("DENIES a non-privileged user when config is missing (doc absent)", () => {
        expect(hasMonitorPageAccess(notPrivileged, null, MUSICIAN)).toBe(false)
    })

    it("ignores null assignment slots without throwing", () => {
        const config = configWith({
            "1": null,
            "2": { userId: MUSICIAN, userName: "Musician" },
        })
        expect(hasMonitorPageAccess(notPrivileged, config, MUSICIAN)).toBe(true)
    })

    it("agrees with getOwnedBuses (no drift): access iff owns >= 1 bus", () => {
        // Parity guard: the gate's has-a-bus arm is exactly getOwnedBuses(...).length > 0,
        // the same predicate the client useMonitorAccess hook computes.
        const config = configWith({
            "5": { userId: MUSICIAN, userName: "Musician" },
        })
        const owns = getOwnedBuses(config, MUSICIAN).length > 0
        expect(hasMonitorPageAccess(notPrivileged, config, MUSICIAN)).toBe(owns)
        const ownsOther = getOwnedBuses(config, OTHER).length > 0
        expect(hasMonitorPageAccess(notPrivileged, config, OTHER)).toBe(ownsOther)
    })
})
