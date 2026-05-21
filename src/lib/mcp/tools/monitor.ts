import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import {
    assertMonitorAccess,
    canControlBus,
    computeStateAgeSeconds,
    enqueueCommand,
    isPrivilegedMonitor,
    isStateStale,
    loadMixerState,
    loadMixerStateMeta,
    serializeLastSeen,
} from "@/lib/mcp/server-monitor"
import type {
    BridgeStatus,
    BusAssignment,
    BusInfo,
    BusSend,
    ChannelInfo,
} from "@/types/monitor"

/**
 * MCP monitor-control tools. Owner-scoped: any musician with an assigned bus
 * may adjust their own mix; admins and sound engineers may touch any bus,
 * plus the matrix outputs. Wire-level commands are appended to
 * `monitor-live/commands/pending` — the same path the iPad UI uses — so the
 * bridge propagation requires zero new wiring.
 */

// Cycle-2 REG-001b: every monitor tool returns the canonical rich envelope
// (validation, access, state, index errors) so the wire envelope is uniform
// across read + write surfaces. The legacy {error: string} shape is gone.

/**
 * Defensive coercion for Firestore-state arrays that the type system lies
 * about. Production has seen `state.buses` come back as a non-array object
 * (cycle-1 F-001/F-002, 2026-05-17) — likely a stale write or a manual
 * edit in the Firebase console. `Array.isArray(x) ? x : []` is the only
 * safe default; the alternative `x ?? []` evaluates a `{}` object as truthy
 * and proceeds to `.map`, which crashes the handler.
 */
function safeArray<T>(x: unknown): T[] {
    return Array.isArray(x) ? (x as T[]) : []
}

/**
 * F-7: deterministic bus "active / configured" predicate. A bus counts as
 * active if it carries any signal of being in use: a non-empty name, a bus
 * master above zero, or at least one send turned on. A bus with no name, a
 * zeroed master, and every send off reads as inactive (truly unused) — which
 * lets a caller tell a deliberately pulled-down-but-named bus apart from one
 * that was never set up. Pure function of the live-state row; no I/O.
 */
function isBusActive(b: {
    name?: string
    fader?: number
    sends?: Array<{ level: number; on: boolean }>
}): boolean {
    const hasName = typeof b.name === "string" && b.name.trim().length > 0
    const faderUp = typeof b.fader === "number" && b.fader > 0
    const anySendOn = safeArray<{ level: number; on: boolean }>(b.sends).some(
        (s) => s.on === true,
    )
    return hasName || faderUp || anySendOn
}

function readBusAssignment(
    assignments: Record<string, BusAssignment | BusAssignment[] | null> | undefined,
    busIndex: number,
): Array<{ uid: string; userName: string }> {
    const raw = assignments?.[String(busIndex)]
    if (!raw) return []
    const list: BusAssignment[] = Array.isArray(raw) ? raw : [raw]
    return list.map((a) => ({ uid: a.userId, userName: a.userName }))
}

/**
 * Bridge-health block shared by the read tools (list_monitor_buses / get_mix /
 * get_matrix). Splices the FRESH `config/monitor` heartbeat (status /
 * x32Connected / lastSeen / clients) onto a freshness signal for the SEPARATE
 * `monitor-live/state` doc the fader/mute values come from.
 */
interface MonitorBridgeHealth {
    status: "online" | "offline"
    x32Connected: boolean
    lastSeenIso: string | null
    clients: number
    /**
     * Age of `monitor-live/state` (now − updatedAt) in seconds; null when the
     * state doc or its `updatedAt` is missing. The fader/mute values in this
     * response are only as fresh as this.
     */
    stateAgeSeconds: number | null
    /**
     * true when the live snapshot is stale (age > ~90s) OR carries no
     * timestamp. When true the mixer values are NOT live and writes should not
     * be assumed to apply — the heartbeat can read green (status:"online",
     * x32Connected:true) while the bridge has stopped refreshing state (the
     * post-BR-02 idle-freeze; coder-2 F-1 FINDINGS).
     */
    stateStale: boolean
}

/**
 * Build the read-tools' bridge-health block. `bridge` is the `config/monitor`
 * heartbeat; `updatedAt` is the raw `monitor-live/state` timestamp from
 * loadMixerStateMeta. Returns null when no bridge is configured at all (a
 * stronger "no bridge" signal than a stale snapshot).
 */
function buildBridgeHealth(
    bridge: BridgeStatus | undefined,
    updatedAt: unknown,
): MonitorBridgeHealth | null {
    if (!bridge) return null
    const stateAgeSeconds = computeStateAgeSeconds(updatedAt)
    return {
        status: bridge.status,
        x32Connected: bridge.x32Connected,
        lastSeenIso: serializeLastSeen(bridge.lastSeen),
        clients: bridge.clients ?? 0,
        stateAgeSeconds,
        stateStale: isStateStale(stateAgeSeconds),
    }
}

// ─── list_monitor_buses ─────────────────────────────────────────────────────

export async function listMonitorBuses(uid: string): Promise<
    | {
          buses: Array<{
              index: number
              name: string
              /**
               * F-7: deterministic "this bus is configured / in use" signal so a
               * pulled-down bus (named, fader 0, all sends off) is distinguishable
               * from a truly-unused one. active = has a name OR fader>0 OR any send on.
               */
              active: boolean
              assignedTo: Array<{ uid: string; userName: string }>
          }>
          matrices: Array<{ index: number; name: string }> | null
          myAssignedBuses: number[]
          isPrivileged: boolean
          bridge: MonitorBridgeHealth | null
      }
    | RichErrorEnvelope
> {
    try {
        initAdmin()
        const db = getFirestore()

        const access = await assertMonitorAccess(db, uid)
        if (!access.ok) return access

        const { snapshot: state, updatedAt } = await loadMixerStateMeta(db)
        const stateBuses = safeArray<{
            index: number
            name: string
            fader?: number
            sends?: Array<{ channelIndex: number; level: number; on: boolean }>
        }>(state?.buses)
        const buses = stateBuses.map((b) => ({
            index: b.index,
            name: b.name,
            active: isBusActive(b),
            assignedTo: readBusAssignment(access.config.busAssignments, b.index),
        }))

        // Matrices are FOH-only — only surface to admin/SE so a musician's tool
        // catalog isn't cluttered with controls they can't act on.
        const privileged = isPrivilegedMonitor(access.user)
        const matrices = privileged
            ? safeArray<{ index: number; name: string }>(
                  state?.matrices,
              ).map((m) => ({ index: m.index, name: m.name }))
            : null

        const bridge = buildBridgeHealth(access.config.bridge, updatedAt)

        return {
            buses,
            matrices,
            myAssignedBuses: access.ownedBuses,
            isPrivileged: privileged,
            bridge,
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `list_monitor_buses internal error: ${msg}`,
            { tool: "list_monitor_buses" },
            "Retry; if the error persists, check the bridge connection.",
        )
    }
}

// ─── get_mix ────────────────────────────────────────────────────────────────

export interface GetMixArgs {
    /** Omit to default to the caller's first assigned bus. */
    busIndex?: number
}

export async function getMix(
    uid: string,
    args: GetMixArgs,
): Promise<
    | {
          busIndex: number
          name: string
          fader: number
          sends: Array<{
              channelIndex: number
              channelName: string
              level: number
              /** true = unmuted. KEEP — iPad /monitor + useMonitorStore read this. */
              on: boolean
              /** F-6: additive convenience inverse of `on` (true = muted) so a
               * caller never has to invert when round-tripping into set_send_mute. */
              muted: boolean
          }>
          /**
           * Bridge health incl. `stateStale` — get_mix returns LIVE fader/mute
           * values off monitor-live/state, so the staleness of that snapshot is
           * exactly what tells a caller whether these values are trustworthy.
           */
          bridge: MonitorBridgeHealth | null
      }
    | RichErrorEnvelope
> {
    try {
        initAdmin()
        const db = getFirestore()

        const access = await assertMonitorAccess(db, uid)
        if (!access.ok) return access

        const busIndex =
            args.busIndex !== undefined ? args.busIndex : access.ownedBuses[0]
        if (busIndex === undefined) {
            // C9I4-007: this is a client-precondition (caller passed no busIndex
            // and owns none), not a server fault — emit 400, not the default 500.
            // machine_code is unchanged; only the HTTP-like code is corrected via
            // the factory's documented errorCode override (errors.ts is hard-rule
            // read-only, and the map defaults unknown codes to 500).
            return richError(
                "monitor_no_bus_assigned",
                "No bus specified and you don't own any bus.",
                { yourAssignedBuses: access.ownedBuses, errorCode: 400 },
                "Pass a busIndex or ask an admin to assign one to you.",
            )
        }

        if (!canControlBus(access.user, access.ownedBuses, busIndex)) {
            return richError(
                "monitor_bus_forbidden",
                `You don't have access to bus ${busIndex}.`,
                { busIndex, yourAssignedBuses: access.ownedBuses },
                "Use one of your assigned buses or ask an admin for access.",
            )
        }

        const { snapshot: state, updatedAt } = await loadMixerStateMeta(db)
        if (!state)
            return richError(
                "monitor_state_unavailable",
                "Mixer state not available — is the bridge online?",
                undefined,
                "Check the bridge status via list_monitor_buses then retry.",
            )

        // Cycle-1 F-001/F-002 defense (was missing on get_mix — the gap that let
        // the staleness-guard ship throw `state.buses.find is not a function` at
        // the deployed surface, 2026-05-21 auditor BLOCK). The LIVE-stale prod
        // `monitor-live/state` carries `buses`/`channels` as NON-arrays (corrupt
        // / frozen write), so every array access here MUST go through safeArray —
        // exactly as list_monitor_buses + get_matrix already do. Against a corrupt
        // snapshot get_mix now degrades to a graceful `invalid_bus_index` envelope
        // (validBusIndices: []) instead of a raw uncaught throw.
        const buses = safeArray<BusInfo>(state.buses)
        const bus = buses.find((b) => b.index === busIndex)
        if (!bus)
            return richError(
                "invalid_bus_index",
                `Bus ${busIndex} is not active on the live mixer.`,
                {
                    busIndex,
                    validBusIndices: buses.map((b) => b.index),
                },
                "Call list_monitor_buses to see active buses.",
            )

        const channelNameByIndex = new Map<number, string>()
        for (const ch of safeArray<ChannelInfo>(state.channels))
            channelNameByIndex.set(ch.index, ch.name)

        return {
            busIndex: bus.index,
            name: bus.name,
            fader: bus.fader,
            sends: safeArray<BusSend>(bus.sends).map((s) => ({
                channelIndex: s.channelIndex,
                channelName:
                    channelNameByIndex.get(s.channelIndex) ??
                    `Ch ${s.channelIndex}`,
                level: s.level,
                on: s.on,
                muted: !s.on,
            })),
            bridge: buildBridgeHealth(access.config.bridge, updatedAt),
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `get_mix internal error: ${msg}`,
            { tool: "get_mix" },
            "Retry; if the error persists, check the bridge connection.",
        )
    }
}

// ─── get_matrix ─────────────────────────────────────────────────────────────

export interface GetMatrixArgs {
    /** 1-based matrix output index (1–6 on X32). Omit to return all. */
    matrixIndex?: number
}

export async function getMatrix(
    uid: string,
    args: GetMatrixArgs,
): Promise<
    | {
          matrices: Array<{
              index: number
              name: string
              fader: number
              /** true = unmuted. KEEP — iPad /monitor + useMonitorStore read this. */
              on: boolean
              /** F-6: additive inverse of `on` (true = muted) — mirrors set_matrix_mute's `muted` arg. */
              muted: boolean
          }>
          /**
           * Bridge health incl. `stateStale` — matrix fader/mute values come
           * off the same monitor-live/state snapshot, so they're only live if
           * `stateStale` is false.
           */
          bridge: MonitorBridgeHealth | null
      }
    | RichErrorEnvelope
> {
    try {
        initAdmin()
        const db = getFirestore()

        const access = await assertMonitorAccess(db, uid)
        if (!access.ok) return access
        // Matrix outputs are FOH territory — admin/SE only, same as the write tools.
        if (!isPrivilegedMonitor(access.user)) {
            return richError(
                "monitor_privilege_required",
                "Matrix read requires an admin or sound engineer account.",
                {
                    callerRole: access.user.role ?? null,
                    soundEngineer: access.user.soundEngineer,
                },
                "Ask an admin to elevate your account.",
            )
        }

        const { snapshot: state, updatedAt } = await loadMixerStateMeta(db)
        if (!state)
            return richError(
                "monitor_state_unavailable",
                "Mixer state not available — is the bridge online?",
                undefined,
                "Check the bridge status via list_monitor_buses then retry.",
            )

        const all = safeArray<{
            index: number
            name: string
            fader: number
            on: boolean
        }>(state.matrices).map((m) => ({
            index: m.index,
            name: m.name,
            fader: m.fader,
            on: m.on,
            muted: !m.on,
        }))
        if (args.matrixIndex !== undefined) {
            const one = all.find((m) => m.index === args.matrixIndex)
            if (!one)
                return richError(
                    "invalid_matrix_index",
                    `Matrix ${args.matrixIndex} is not active on the live mixer.`,
                    {
                        matrixIndex: args.matrixIndex,
                        validMatrixIndices: all.map((m) => m.index),
                    },
                    "Call get_matrix without matrixIndex to see active matrices.",
                )
            return {
                matrices: [one],
                bridge: buildBridgeHealth(access.config.bridge, updatedAt),
            }
        }
        return {
            matrices: all,
            bridge: buildBridgeHealth(access.config.bridge, updatedAt),
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return richError(
            "internal_error",
            `get_matrix internal error: ${msg}`,
            { tool: "get_matrix" },
            "Retry; if the error persists, check the bridge connection.",
        )
    }
}

// ─── shared write-side preflight ────────────────────────────────────────────

async function preflightBusWrite(
    db: FirebaseFirestore.Firestore,
    uid: string,
    busIndex: number,
    channelIndex?: number,
): Promise<{ ok: true } | RichErrorEnvelope> {
    const access = await assertMonitorAccess(db, uid)
    if (!access.ok) return access
    if (!canControlBus(access.user, access.ownedBuses, busIndex)) {
        return richError(
            "monitor_bus_forbidden",
            `You don't have access to bus ${busIndex}.`,
            {
                busIndex,
                yourAssignedBuses: access.ownedBuses,
            },
            access.ownedBuses.length
                ? `Use one of your assigned buses (${access.ownedBuses.join(", ")}) or ask an admin to widen access.`
                : "Ask an admin to assign you a bus.",
        )
    }
    // F-018 (cycle-1): validate the indices against the live mixer state
    // before enqueueing. Pre-fix these tools returned `ok:true` even for
    // bus/channel 99 (the bridge silently dropped the command); agents
    // had no signal the write was nonsense. Cheap — one Firestore read of
    // the monitor-live doc that's already in hot cache from the read tools.
    const state = await loadMixerState(db)
    if (!state) {
        return richError(
            "monitor_state_unavailable",
            "Mixer state not available — is the bridge online?",
            undefined,
            "Check the bridge status via list_monitor_buses then retry.",
        )
    }
    const busIndices = safeArray<{ index: number }>(state.buses).map(
        (b) => b.index,
    )
    if (!busIndices.includes(busIndex)) {
        return richError(
            "invalid_bus_index",
            `Bus ${busIndex} is not active on the live mixer.`,
            { busIndex, validBusIndices: busIndices },
            "Call list_monitor_buses to see active buses.",
        )
    }
    if (channelIndex !== undefined) {
        const channelIndices = safeArray<{ index: number }>(state.channels).map(
            (c) => c.index,
        )
        if (!channelIndices.includes(channelIndex)) {
            // F-5: annotate the hint with each channel's name + whether it's live
            // on THIS bus (a send that is on, or above zero), so the LLM can pick a
            // real target instead of guessing from a bare [1..32]. The flat
            // `validChannelIndices` array stays for back-compat.
            const targetBus = safeArray<{
                index: number
                sends?: Array<{ channelIndex: number; level: number; on: boolean }>
            }>(state.buses).find((b) => b.index === busIndex)
            const sendByChannel = new Map<number, { level: number; on: boolean }>()
            for (const s of safeArray<{
                channelIndex: number
                level: number
                on: boolean
            }>(targetBus?.sends)) {
                sendByChannel.set(s.channelIndex, { level: s.level, on: s.on })
            }
            const validChannels = safeArray<{ index: number; name: string }>(
                state.channels,
            ).map((c) => {
                const send = sendByChannel.get(c.index)
                return {
                    index: c.index,
                    name: c.name,
                    active: !!send && (send.on === true || send.level > 0),
                }
            })
            // F-3 (R-12): `invalid_channel_index` isn't in ERROR_CODE_MAP, so it
            // defaulted to 500 — a caller-fixable bad argument. Override to 400 so
            // it's symmetric with `invalid_bus_index` (400). machine_code unchanged;
            // only the HTTP-like code via the factory's documented errorCode override
            // (errors.ts is hard-rule read-only).
            return richError(
                "invalid_channel_index",
                `Channel ${channelIndex} is not active on the live mixer.`,
                {
                    channelIndex,
                    validChannelIndices: channelIndices,
                    validChannels,
                    errorCode: 400,
                },
                "Call get_mix to see the bus's active channels — validChannels lists each channel's name and whether it's live on this bus.",
            )
        }
    }
    return { ok: true }
}

async function preflightPrivilegedWrite(
    db: FirebaseFirestore.Firestore,
    uid: string,
    matrixIndex?: number,
): Promise<{ ok: true } | RichErrorEnvelope> {
    const access = await assertMonitorAccess(db, uid)
    if (!access.ok) return access
    if (!isPrivilegedMonitor(access.user)) {
        return richError(
            "monitor_privilege_required",
            "Matrix and bus-master tools require an admin or sound engineer account.",
            undefined,
            "Ask an admin to elevate your account.",
        )
    }
    if (matrixIndex !== undefined) {
        // F-018: validate matrixIndex against live state, same rationale as
        // preflightBusWrite. Matrix outputs are 1-based on X32 (1–6).
        const state = await loadMixerState(db)
        if (!state) {
            return richError(
                "monitor_state_unavailable",
                "Mixer state not available — is the bridge online?",
                undefined,
                "Check the bridge status then retry.",
            )
        }
        const matrixIndices = safeArray<{ index: number }>(state.matrices).map(
            (m) => m.index,
        )
        if (!matrixIndices.includes(matrixIndex)) {
            return richError(
                "invalid_matrix_index",
                `Matrix ${matrixIndex} is not active on the live mixer.`,
                { matrixIndex, validMatrixIndices: matrixIndices },
                "Call list_monitor_buses (matrices field) to see active matrix outputs.",
            )
        }
    }
    return { ok: true }
}

// ─── set_send_level ─────────────────────────────────────────────────────────

export interface SetSendLevelArgs {
    busIndex: number
    channelIndex: number
    level: number
}

export async function setSendLevel(
    uid: string,
    args: SetSendLevelArgs,
): Promise<
    { ok: true; commandId: string; confidence: "queued" } | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightBusWrite(db, uid, args.busIndex, args.channelIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_send_level",
        busIndex: args.busIndex,
        channelIndex: args.channelIndex,
        value: args.level,
    })
    // R-2: honest fire-and-forget receipt. ALWAYS "queued" — the command was
    // accepted into monitor-live/commands/pending; the app side cannot confirm
    // the X32 OSC ack (that's the held bridge lane), so it never claims "applied".
    return { ok: true, commandId: r.id, confidence: "queued" as const }
}

// ─── set_send_mute ──────────────────────────────────────────────────────────

export interface SetSendMuteArgs {
    busIndex: number
    channelIndex: number
    muted: boolean
}

/**
 * Mute or unmute one channel in one bus. The X32 wire term is `set_send_on`
 * where `value: true` = unmuted; we flip the polarity at the MCP layer so the
 * tool name + arg read naturally ("muted: true" muting).
 */
export async function setSendMute(
    uid: string,
    args: SetSendMuteArgs,
): Promise<
    { ok: true; commandId: string; confidence: "queued" } | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightBusWrite(db, uid, args.busIndex, args.channelIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_send_on",
        busIndex: args.busIndex,
        channelIndex: args.channelIndex,
        value: !args.muted,
    })
    // R-2: honest fire-and-forget receipt. ALWAYS "queued" — the command was
    // accepted into monitor-live/commands/pending; the app side cannot confirm
    // the X32 OSC ack (that's the held bridge lane), so it never claims "applied".
    return { ok: true, commandId: r.id, confidence: "queued" as const }
}

// ─── set_bus_fader (bus master) ─────────────────────────────────────────────

export interface SetBusFaderArgs {
    busIndex: number
    level: number
}

export async function setBusFader(
    uid: string,
    args: SetBusFaderArgs,
): Promise<
    { ok: true; commandId: string; confidence: "queued" } | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightBusWrite(db, uid, args.busIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_bus_master",
        busIndex: args.busIndex,
        value: args.level,
    })
    // R-2: honest fire-and-forget receipt. ALWAYS "queued" — the command was
    // accepted into monitor-live/commands/pending; the app side cannot confirm
    // the X32 OSC ack (that's the held bridge lane), so it never claims "applied".
    return { ok: true, commandId: r.id, confidence: "queued" as const }
}

// ─── set_matrix_fader (admin/SE only) ───────────────────────────────────────

export interface SetMatrixFaderArgs {
    matrixIndex: number
    level: number
}

export async function setMatrixFader(
    uid: string,
    args: SetMatrixFaderArgs,
): Promise<
    { ok: true; commandId: string; confidence: "queued" } | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightPrivilegedWrite(db, uid, args.matrixIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_matrix_fader",
        matrixIndex: args.matrixIndex,
        value: args.level,
    })
    // R-2: honest fire-and-forget receipt. ALWAYS "queued" — the command was
    // accepted into monitor-live/commands/pending; the app side cannot confirm
    // the X32 OSC ack (that's the held bridge lane), so it never claims "applied".
    return { ok: true, commandId: r.id, confidence: "queued" as const }
}

// ─── set_matrix_mute (admin/SE only) ────────────────────────────────────────

export interface SetMatrixMuteArgs {
    matrixIndex: number
    muted: boolean
}

export async function setMatrixMute(
    uid: string,
    args: SetMatrixMuteArgs,
): Promise<
    { ok: true; commandId: string; confidence: "queued" } | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightPrivilegedWrite(db, uid, args.matrixIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_matrix_on",
        matrixIndex: args.matrixIndex,
        value: !args.muted,
    })
    // R-2: honest fire-and-forget receipt. ALWAYS "queued" — the command was
    // accepted into monitor-live/commands/pending; the app side cannot confirm
    // the X32 OSC ack (that's the held bridge lane), so it never claims "applied".
    return { ok: true, commandId: r.id, confidence: "queued" as const }
}
