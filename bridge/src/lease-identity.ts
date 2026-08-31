/**
 * Lease identity — stable machine ID, PID liveness, and the same-host steal rule.
 *
 * R1 (crash-relaunch blind window). The B10 lease keys ownership on
 * `bridgeInstanceId`, which is minted fresh on every launch
 * (`hostname-pid-uuid`). So a bridge that CRASHES and relaunches cannot renew
 * its own lease: the new process is, to the lease, a stranger, and it stands by
 * until the dead process's TTL runs out. During that window it drains no
 * commands, writes no state and publishes no heartbeat — the desk is dark while
 * the cloud still reads the corpse's `bridge.lastSeen` as "online".
 *
 * The fix is an identity that SURVIVES the crash. A machine/install ID persisted
 * beside the bridge's config lets the relaunched process recognise the lease it
 * left behind and take it back immediately, without weakening the guarantee the
 * lease exists for: that two LIVE bridges never both drive the X32.
 *
 * This module is pure + Firestore-free so the steal rule can be unit-tested
 * without a database; `config.ts` applies it inside the lease transaction.
 */

import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { createHash, randomUUID } from "crypto"

/** Filename of the persisted machine ID, written beside `bridge-config.json`. */
const MACHINE_ID_FILENAME = "bridge-machine-id.json"

/**
 * The lease document as stored at `config/monitor.bridgeLease`.
 *
 * `machineId` / `pid` / `heartbeatAt` are additive (v10.0.8). A lease written by
 * an older bridge has none of them; every rule below then declines to steal and
 * we fall back to plain TTL expiry, which is the pre-existing behavior.
 */
export interface LeaseRecord {
    ownerId?: string
    machineId?: string | null
    pid?: number | null
    acquiredAt?: number
    /** Wall-clock ms of the last acquire/renew by the holder. */
    heartbeatAt?: number
    expiresAt?: number
}

/** Who WE are, for the purposes of the steal rule. */
export interface LeaseIdentity {
    /** Stable across relaunches AND reinstalls (see `getMachineId`). */
    machineId: string
    pid: number
    /**
     * A same-host lease whose `heartbeatAt` is older than this is treated as
     * abandoned. Callers pass 2x the renew interval so a single missed renewal
     * never looks like death.
     */
    staleAfterMs: number
    /** Seam for tests; defaults to the real process probe. */
    isPidAlive?: (pid: number) => boolean | null
}

/**
 * Directory for bridge-local durable state.
 *
 * `main.ts` exports `BRIDGE_STATE_DIR` (Electron's `userData`, which is keyed by
 * app name and therefore survives reinstalls — the same durability argument as
 * the Bug#1 credential move). Off Electron we sit beside the service-account key
 * if one was configured, and fall back to a dotdir in $HOME. The fallback is
 * still STABLE per machine, which is all the steal rule needs.
 */
export function getStateDir(): string {
    if (process.env.BRIDGE_STATE_DIR) return process.env.BRIDGE_STATE_DIR
    if (process.env.FIREBASE_SA_KEY_PATH) return path.dirname(process.env.FIREBASE_SA_KEY_PATH)
    return path.join(os.homedir(), ".centralreform-bridge")
}

/**
 * Read (or mint and persist) this install's machine ID.
 *
 * Correctness requirement: the value MUST be identical across a crash-relaunch,
 * or the same-host steal never fires and we are back to waiting out the TTL. So
 * the failure path is DETERMINISTIC — a hash of the hostname — not a fresh
 * random. A random fallback would silently disable the fix on exactly the box
 * whose disk is unhappy. Hostname collisions between two PCs on one LAN would
 * be needed to make that fallback unsafe, and Windows does not permit them.
 */
export function getMachineId(stateDir: string = getStateDir()): string {
    const file = path.join(stateDir, MACHINE_ID_FILENAME)
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { machineId?: unknown }
        if (typeof raw.machineId === "string" && raw.machineId.length > 0) return raw.machineId
    } catch {
        // Missing / unreadable / corrupt — fall through and mint a new one.
    }
    const minted = randomUUID()
    try {
        fs.mkdirSync(stateDir, { recursive: true })
        fs.writeFileSync(file, JSON.stringify({ machineId: minted, hostname: os.hostname() }, null, 2))
        return minted
    } catch (err) {
        console.warn(
            "[Lease] Could not persist machine ID (%s) — falling back to a hostname-derived ID:",
            file,
            (err as Error).message,
        )
        return `host-${createHash("sha256").update(os.hostname()).digest("hex").slice(0, 16)}`
    }
}

/**
 * Is `pid` a live process?
 *
 * `true` = alive, `false` = PROVABLY gone, `null` = undeterminable. Signal 0
 * performs the permission/existence check without delivering anything. EPERM
 * means the PID exists but belongs to another user, which is still "alive" —
 * and is why we answer `true` there rather than guessing.
 *
 * Callers must treat `null` exactly like `true` (do not steal): every ambiguity
 * in this probe has to fail toward leaving a possibly-live bridge alone.
 */
export function isPidAlive(pid: number): boolean | null {
    if (!Number.isInteger(pid) || pid <= 0) return null
    try {
        process.kill(pid, 0)
        return true
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === "ESRCH") return false
        if (code === "EPERM") return true
        return null
    }
}

/**
 * May we take a still-unexpired lease held by someone else?
 *
 * DEFAULT IS NO. Two live bridges both driving the X32 is the failure this lease
 * exists to prevent, and it is far worse than a slow takeover: the desk gets
 * double-applied faders during a service. Every branch below therefore has to
 * argue its way to `true`.
 *
 * The one argument we accept is SAME MACHINE. `main.ts` holds a Windows
 * single-instance lock (`app.requestSingleInstanceLock`), so two live bridges
 * cannot coexist on one PC by construction — a same-host lease held by someone
 * who is not us is a relic of a process that is gone. We still demand corroborating
 * evidence before acting on that:
 *
 *   1. the holder's PID is PROVABLY dead (`ESRCH`), or
 *   2. its `heartbeatAt` is older than `staleAfterMs` (2x the renew cadence) — a
 *      live bridge renews three times inside its own TTL, so this cannot fire
 *      against one that is merely slow.
 *
 * A fresh heartbeat from a same-host holder is a refusal: that is a bridge that
 * is actually running, and the single-instance lock says it is the only one.
 *
 * CROSS-HOST steals are refused outright, even on a stale heartbeat. A second PC
 * cannot see whether the holder is dead or merely wedged behind a slow uplink,
 * and the shortened TTL (v10.0.8) already caps that takeover at ~TTL + one renew
 * tick. Trading a few seconds there for a split-brain risk is a bad trade; the
 * near-instant path is the same-host relaunch, which is the case R1 is about.
 *
 * The `reason` is returned (not logged here) so the caller can put it in the
 * bridge's own log line — a steal is exactly the kind of event you want a
 * sentence about when reading the console two days later.
 */
export function canStealLease(
    lease: LeaseRecord,
    now: number,
    self: LeaseIdentity | undefined,
): { steal: boolean; reason: string } {
    if (!self?.machineId) {
        return { steal: false, reason: "no local machine identity" }
    }
    if (!lease.machineId) {
        // Pre-v10.0.8 lease: no machine identity recorded, so we cannot prove
        // same-host. Wait out the TTL, exactly as before.
        return { steal: false, reason: "holder recorded no machineId (legacy lease)" }
    }
    if (lease.machineId !== self.machineId) {
        return { steal: false, reason: "holder is on another machine" }
    }

    // ── Same machine from here down. ──
    //
    // The PID probe can only ever ADD evidence, never withhold it. A dead PID is
    // proof; a live one proves nothing, because Windows recycles PIDs freely and
    // the dead bridge's slot may already belong to an unrelated process. Treating
    // "pid looks alive" as a veto would pin a crash-relaunch to the full TTL on
    // exactly the boxes where PIDs turn over fastest. So a live/unknown/absent PID
    // falls through to the renewal-staleness test below, which a genuinely live
    // bridge cannot fail (it renews three times per TTL) and a wedged one cannot
    // pass — and a bridge wedged enough to stop renewing has already demoted
    // ITSELF to standby, because its own renewal returning false is what the
    // transport's active-gate reads.
    const probe = self.isPidAlive ?? isPidAlive
    if (typeof lease.pid === "number" && lease.pid !== self.pid && probe(lease.pid) === false) {
        return { steal: true, reason: `same machine, holder pid ${lease.pid} is gone` }
    }

    if (typeof lease.heartbeatAt === "number") {
        const age = now - lease.heartbeatAt
        if (age > self.staleAfterMs) {
            return { steal: true, reason: `same machine, holder heartbeat ${age}ms stale` }
        }
        return { steal: false, reason: `same machine, but holder heartbeat is fresh (${age}ms)` }
    }

    return { steal: false, reason: "same machine, but holder liveness is unknown" }
}
