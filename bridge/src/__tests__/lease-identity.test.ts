import { describe, it, expect, afterEach } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

/**
 * R1 — lease identity: the pure half of the same-host lease steal.
 *
 * `canStealLease` is the guard that stands between "a crashed bridge recovers
 * instantly" and "two live bridges both drive the X32 during a service". Its
 * default answer is NO, so most of these cases assert a REFUSAL — that is where
 * the safety lives. Firestore is not involved; see config-lease.test.ts for the
 * same rule exercised through the transaction.
 */

import { canStealLease, getMachineId, isPidAlive, type LeaseRecord } from "../lease-identity"

const SELF = {
    machineId: "machine-A",
    pid: 4242,
    staleAfterMs: 12_000,
}

/** A lease held by a DIFFERENT process on machine-A, last renewed `ageMs` ago. */
function heldLease(over: Partial<LeaseRecord> = {}, ageMs = 0): LeaseRecord {
    const now = Date.now()
    return {
        ownerId: "host-999-abcd1234",
        machineId: "machine-A",
        pid: 999,
        acquiredAt: now - ageMs,
        heartbeatAt: now - ageMs,
        expiresAt: now + 20_000,
        ...over,
    }
}

const dead = () => false
const alive = () => true
const unknown = () => null

describe("canStealLease — the same-host steal rule (R1)", () => {
    it("steals when the holder is this machine and its pid is provably gone", () => {
        const v = canStealLease(heldLease(), Date.now(), { ...SELF, isPidAlive: dead })
        expect(v.steal).toBe(true)
        expect(v.reason).toContain("pid 999 is gone")
    })

    it("REFUSES when the holder is this machine, its pid is alive AND it is still renewing", () => {
        // The two-live-bridges case. A fresh heartbeat is a bridge that is
        // genuinely running; stealing here would double-apply every fader.
        const v = canStealLease(heldLease(), Date.now(), { ...SELF, isPidAlive: alive })
        expect(v.steal).toBe(false)
        expect(v.reason).toContain("fresh")
    })

    it("steals when the pid LOOKS alive but the holder stopped renewing (Windows pid reuse)", () => {
        // A live-looking pid proves nothing: the crashed bridge's slot may have
        // been recycled onto an unrelated process. Renewal silence past 2x the
        // cadence is the signal that actually distinguishes dead from busy.
        const v = canStealLease(heldLease({}, 30_000), Date.now(), { ...SELF, isPidAlive: alive })
        expect(v.steal).toBe(true)
        expect(v.reason).toContain("stale")
    })

    it("REFUSES a cross-host holder even with a long-dead heartbeat", () => {
        // Deliberate: a second PC cannot tell "dead" from "wedged behind a slow
        // uplink". Cross-host takeover rides the TTL instead.
        const v = canStealLease(
            heldLease({ machineId: "machine-B" }, 10 * 60_000),
            Date.now(),
            { ...SELF, isPidAlive: dead },
        )
        expect(v.steal).toBe(false)
        expect(v.reason).toContain("another machine")
    })

    it("REFUSES a legacy lease that recorded no machineId", () => {
        // Pre-v10.0.8 bridge: same-host cannot be proven, so fall back to TTL.
        const v = canStealLease(
            { ownerId: "old", expiresAt: Date.now() + 20_000 },
            Date.now(),
            { ...SELF, isPidAlive: dead },
        )
        expect(v.steal).toBe(false)
        expect(v.reason).toContain("legacy lease")
    })

    it("REFUSES when we have no machine identity of our own", () => {
        expect(canStealLease(heldLease(), Date.now(), undefined).steal).toBe(false)
    })

    it("uses the heartbeat test when the pid is unprobeable, and steals only once stale", () => {
        const now = Date.now()
        const fresh = canStealLease(heldLease({}, 5_000), now, { ...SELF, isPidAlive: unknown })
        expect(fresh.steal).toBe(false)
        expect(fresh.reason).toContain("fresh")

        const stale = canStealLease(heldLease({}, 30_000), now, { ...SELF, isPidAlive: unknown })
        expect(stale.steal).toBe(true)
        expect(stale.reason).toContain("stale")
    })

    it("steals on a stale heartbeat when the holder recorded no pid at all", () => {
        const v = canStealLease(heldLease({ pid: null }, 30_000), Date.now(), SELF)
        expect(v.steal).toBe(true)
    })

    it("REFUSES a same-host lease with neither a usable pid nor a heartbeat", () => {
        const v = canStealLease(
            { ownerId: "x", machineId: "machine-A", expiresAt: Date.now() + 20_000 },
            Date.now(),
            SELF,
        )
        expect(v.steal).toBe(false)
        expect(v.reason).toContain("liveness is unknown")
    })

    it("does not probe a holder pid equal to our own (post-crash pid reuse) — heartbeat decides", () => {
        // If Windows recycled our pid onto the dead holder's slot, the pid test
        // proves nothing; the staleness test still does.
        const v = canStealLease(heldLease({ pid: SELF.pid }, 30_000), Date.now(), {
            ...SELF,
            isPidAlive: () => {
                throw new Error("must not probe our own pid")
            },
        })
        expect(v.steal).toBe(true)
    })
})

describe("isPidAlive", () => {
    it("reports this process as alive", () => {
        expect(isPidAlive(process.pid)).toBe(true)
    })

    it("reports a pid that cannot exist as provably gone", () => {
        // 2^22 + 1 is above every platform's pid_max default, so no process can
        // hold it. ESRCH ⇒ false.
        expect(isPidAlive(4_194_305)).toBe(false)
    })

    it("returns null (never false) for a nonsense pid, so callers never steal on it", () => {
        expect(isPidAlive(0)).toBeNull()
        expect(isPidAlive(-1)).toBeNull()
        expect(isPidAlive(1.5)).toBeNull()
    })
})

describe("getMachineId — stability across relaunches", () => {
    const dirs: string[] = []
    const tmpDir = () => {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), "crc-machine-id-"))
        dirs.push(d)
        return d
    }

    afterEach(() => {
        for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
    })

    it("mints, persists, and returns the SAME id on the next call (the whole point)", () => {
        const dir = tmpDir()
        const first = getMachineId(dir)
        expect(first).toBeTruthy()
        expect(getMachineId(dir)).toBe(first)
        expect(fs.existsSync(path.join(dir, "bridge-machine-id.json"))).toBe(true)
    })

    it("creates the state dir if it does not exist yet", () => {
        const dir = path.join(tmpDir(), "nested", "state")
        expect(getMachineId(dir)).toBeTruthy()
        expect(getMachineId(dir)).toBe(getMachineId(dir))
    })

    it("re-mints over a corrupt file rather than throwing", () => {
        const dir = tmpDir()
        fs.writeFileSync(path.join(dir, "bridge-machine-id.json"), "{ not json")
        const id = getMachineId(dir)
        expect(id).toBeTruthy()
        expect(getMachineId(dir)).toBe(id)
    })

    it("falls back DETERMINISTICALLY when the id cannot be persisted", () => {
        // A random fallback would silently disable the same-host steal on exactly
        // the box whose disk is unhappy. Two calls must still agree.
        const unwritable = path.join(tmpDir(), "file-not-a-dir")
        fs.writeFileSync(unwritable, "x")
        const a = getMachineId(path.join(unwritable, "sub"))
        const b = getMachineId(path.join(unwritable, "sub"))
        expect(a).toBe(b)
        expect(a.startsWith("host-")).toBe(true)
    })
})
