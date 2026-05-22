import { describe, expect, it } from "vitest"

import {
    coerceCommandAck,
    computeBusAssignmentAdd,
    computeBusAssignmentRemove,
    normalizeBusAssignmentList,
} from "../server-monitor"
import type { BusAssignment } from "@/types/monitor"

/**
 * P2-B pure helpers (no emulator). The ack coercion + bus-assignment mutation
 * logic is total + side-effect-free; the emulator suite
 * (mcp-monitor-observability.emulator.test.ts) covers the gated tool wrappers.
 */

describe("coerceCommandAck (MCP-D3)", () => {
    it("absent doc → pending / not found, never throws", () => {
        expect(coerceCommandAck(undefined)).toEqual({
            status: "pending",
            confirmedValue: null,
            reason: null,
            at: null,
            found: false,
        })
        expect(coerceCommandAck(null)).toMatchObject({
            status: "pending",
            found: false,
        })
    })

    it("applied with a numeric confirmedValue", () => {
        const ack = coerceCommandAck({
            commandId: "abc",
            status: "applied",
            confirmedValue: 0.42,
            at: "2026-05-22T01:00:00.000Z",
        })
        expect(ack).toMatchObject({
            status: "applied",
            confirmedValue: 0.42,
            reason: null,
            at: "2026-05-22T01:00:00.000Z",
            found: true,
        })
    })

    it("preserves a boolean confirmedValue (mute acks)", () => {
        expect(
            coerceCommandAck({ status: "applied", confirmedValue: false }),
        ).toMatchObject({ status: "applied", confirmedValue: false })
    })

    it("rejected / timeout carry the reason", () => {
        expect(
            coerceCommandAck({ status: "rejected", reason: "bus not owned" }),
        ).toMatchObject({ status: "rejected", reason: "bus not owned" })
        expect(coerceCommandAck({ status: "timeout" })).toMatchObject({
            status: "timeout",
            confirmedValue: null,
        })
    })

    it("unrecognized status → unknown (found stays true)", () => {
        expect(coerceCommandAck({ status: "weird" })).toMatchObject({
            status: "unknown",
            found: true,
        })
        // missing status entirely
        expect(coerceCommandAck({ confirmedValue: 1 })).toMatchObject({
            status: "unknown",
            confirmedValue: 1,
            found: true,
        })
    })

    it("drops a non-number/boolean confirmedValue and a non-string reason", () => {
        const ack = coerceCommandAck({
            status: "applied",
            confirmedValue: { nope: true },
            reason: 42,
        })
        expect(ack.confirmedValue).toBeNull()
        expect(ack.reason).toBeNull()
    })

    it("coerces `at` from epoch millis, {seconds,nanoseconds}, and Timestamp-like toMillis", () => {
        const ms = Date.UTC(2026, 4, 22, 2, 0, 0)
        expect(coerceCommandAck({ status: "applied", at: ms }).at).toBe(
            new Date(ms).toISOString(),
        )
        expect(
            coerceCommandAck({
                status: "applied",
                at: { seconds: Math.floor(ms / 1000), nanoseconds: 0 },
            }).at,
        ).toBe(new Date(ms).toISOString())
        expect(
            coerceCommandAck({
                status: "applied",
                at: { toMillis: () => ms },
            }).at,
        ).toBe(new Date(ms).toISOString())
        // uncoercible → null
        expect(coerceCommandAck({ status: "applied", at: "not-a-date" }).at).toBeNull()
    })
})

describe("normalizeBusAssignmentList", () => {
    it("null/undefined → empty array", () => {
        expect(normalizeBusAssignmentList(null)).toEqual([])
        expect(normalizeBusAssignmentList(undefined)).toEqual([])
    })
    it("wraps a single legacy object into an array", () => {
        const one: BusAssignment = { userId: "u1", userName: "One" }
        expect(normalizeBusAssignmentList(one)).toEqual([one])
    })
    it("passes through an array, filtering malformed entries", () => {
        const raw = [
            { userId: "u1", userName: "One" },
            null,
            { userName: "no-uid" },
        ] as unknown as BusAssignment[]
        expect(normalizeBusAssignmentList(raw)).toEqual([
            { userId: "u1", userName: "One" },
        ])
    })
})

describe("computeBusAssignmentAdd (MCP-D4)", () => {
    const entry: BusAssignment = { userId: "u1", userName: "One" }

    it("adds to an empty slot", () => {
        const m = computeBusAssignmentAdd(null, entry)
        expect(m).toEqual({ next: [entry], matched: false, changed: true })
    })

    it("is a no-op when the same uid+name is already present", () => {
        const m = computeBusAssignmentAdd([entry], entry)
        expect(m.matched).toBe(true)
        expect(m.changed).toBe(false)
        expect(m.next).toEqual([entry])
    })

    it("refreshes a changed display name (matched + changed)", () => {
        const m = computeBusAssignmentAdd([{ userId: "u1", userName: "Old" }], {
            userId: "u1",
            userName: "New",
        })
        expect(m.matched).toBe(true)
        expect(m.changed).toBe(true)
        expect(m.next).toEqual([{ userId: "u1", userName: "New" }])
    })

    it("supports co-ownership — appends a second user, preserving the first", () => {
        const existing: BusAssignment = { userId: "u1", userName: "One" }
        const m = computeBusAssignmentAdd([existing], {
            userId: "u2",
            userName: "Two",
        })
        expect(m.matched).toBe(false)
        expect(m.changed).toBe(true)
        expect(m.next).toEqual([existing, { userId: "u2", userName: "Two" }])
    })

    it("normalizes a legacy single-object slot before adding", () => {
        const m = computeBusAssignmentAdd(
            { userId: "u1", userName: "One" },
            { userId: "u2", userName: "Two" },
        )
        expect(m.next).toEqual([
            { userId: "u1", userName: "One" },
            { userId: "u2", userName: "Two" },
        ])
    })
})

describe("computeBusAssignmentRemove (MCP-D4)", () => {
    it("removes a present uid", () => {
        const m = computeBusAssignmentRemove(
            [
                { userId: "u1", userName: "One" },
                { userId: "u2", userName: "Two" },
            ],
            "u1",
        )
        expect(m.matched).toBe(true)
        expect(m.changed).toBe(true)
        expect(m.next).toEqual([{ userId: "u2", userName: "Two" }])
    })

    it("is a safe no-op when the uid isn't assigned", () => {
        const m = computeBusAssignmentRemove([{ userId: "u1", userName: "One" }], "ghost")
        expect(m.matched).toBe(false)
        expect(m.changed).toBe(false)
        expect(m.next).toEqual([{ userId: "u1", userName: "One" }])
    })

    it("empties the slot when the last user is removed", () => {
        const m = computeBusAssignmentRemove([{ userId: "u1", userName: "One" }], "u1")
        expect(m.changed).toBe(true)
        expect(m.next).toEqual([])
    })

    it("no-op on an already-empty slot", () => {
        expect(computeBusAssignmentRemove(null, "u1")).toEqual({
            next: [],
            matched: false,
            changed: false,
        })
    })
})
