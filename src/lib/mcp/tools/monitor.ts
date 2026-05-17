import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import {
    assertMonitorAccess,
    canControlBus,
    enqueueCommand,
    isPrivilegedMonitor,
    loadMixerState,
    serializeLastSeen,
} from "@/lib/mcp/server-monitor"
import type { BusAssignment } from "@/types/monitor"

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

function readBusAssignment(
    assignments: Record<string, BusAssignment | BusAssignment[] | null> | undefined,
    busIndex: number,
): Array<{ uid: string; userName: string }> {
    const raw = assignments?.[String(busIndex)]
    if (!raw) return []
    const list: BusAssignment[] = Array.isArray(raw) ? raw : [raw]
    return list.map((a) => ({ uid: a.userId, userName: a.userName }))
}

// ─── list_monitor_buses ─────────────────────────────────────────────────────

export async function listMonitorBuses(uid: string): Promise<
    | {
          buses: Array<{
              index: number
              name: string
              assignedTo: Array<{ uid: string; userName: string }>
          }>
          matrices: Array<{ index: number; name: string }> | null
          myAssignedBuses: number[]
          isPrivileged: boolean
          bridge: {
              status: "online" | "offline"
              x32Connected: boolean
              lastSeenIso: string | null
              clients: number
          } | null
      }
    | RichErrorEnvelope
> {
    try {
        initAdmin()
        const db = getFirestore()

        const access = await assertMonitorAccess(db, uid)
        if (!access.ok) return access

        const state = await loadMixerState(db)
        const stateBuses = safeArray<{ index: number; name: string }>(
            state?.buses,
        )
        const buses = stateBuses.map((b) => ({
            index: b.index,
            name: b.name,
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

        const bridge = access.config.bridge
            ? {
                  status: access.config.bridge.status,
                  x32Connected: access.config.bridge.x32Connected,
                  lastSeenIso: serializeLastSeen(access.config.bridge.lastSeen),
                  clients: access.config.bridge.clients ?? 0,
              }
            : null

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
              on: boolean
          }>
      }
    | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()

    const access = await assertMonitorAccess(db, uid)
    if (!access.ok) return access

    const busIndex =
        args.busIndex !== undefined ? args.busIndex : access.ownedBuses[0]
    if (busIndex === undefined) {
        return richError(
            "monitor_no_bus_assigned",
            "No bus specified and you don't own any bus.",
            { yourAssignedBuses: access.ownedBuses },
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

    const state = await loadMixerState(db)
    if (!state)
        return richError(
            "monitor_state_unavailable",
            "Mixer state not available — is the bridge online?",
            undefined,
            "Check the bridge status via list_monitor_buses then retry.",
        )

    const bus = state.buses.find((b) => b.index === busIndex)
    if (!bus)
        return richError(
            "invalid_bus_index",
            `Bus ${busIndex} is not active on the live mixer.`,
            {
                busIndex,
                validBusIndices: state.buses.map((b) => b.index),
            },
            "Call list_monitor_buses to see active buses.",
        )

    const channelNameByIndex = new Map<number, string>()
    for (const ch of state.channels) channelNameByIndex.set(ch.index, ch.name)

    return {
        busIndex: bus.index,
        name: bus.name,
        fader: bus.fader,
        sends: bus.sends.map((s) => ({
            channelIndex: s.channelIndex,
            channelName: channelNameByIndex.get(s.channelIndex) ?? `Ch ${s.channelIndex}`,
            level: s.level,
            on: s.on,
        })),
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
              on: boolean
          }>
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

        const state = await loadMixerState(db)
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
            return { matrices: [one] }
        }
        return { matrices: all }
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
            return richError(
                "invalid_channel_index",
                `Channel ${channelIndex} is not active on the live mixer.`,
                { channelIndex, validChannelIndices: channelIndices },
                "Call get_mix to see the bus's active channels.",
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
): Promise<{ ok: true; commandId: string } | RichErrorEnvelope> {
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
    return { ok: true, commandId: r.id }
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
): Promise<{ ok: true; commandId: string } | RichErrorEnvelope> {
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
    return { ok: true, commandId: r.id }
}

// ─── set_bus_fader (bus master) ─────────────────────────────────────────────

export interface SetBusFaderArgs {
    busIndex: number
    level: number
}

export async function setBusFader(
    uid: string,
    args: SetBusFaderArgs,
): Promise<{ ok: true; commandId: string } | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightBusWrite(db, uid, args.busIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_bus_master",
        busIndex: args.busIndex,
        value: args.level,
    })
    return { ok: true, commandId: r.id }
}

// ─── set_matrix_fader (admin/SE only) ───────────────────────────────────────

export interface SetMatrixFaderArgs {
    matrixIndex: number
    level: number
}

export async function setMatrixFader(
    uid: string,
    args: SetMatrixFaderArgs,
): Promise<{ ok: true; commandId: string } | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightPrivilegedWrite(db, uid, args.matrixIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_matrix_fader",
        matrixIndex: args.matrixIndex,
        value: args.level,
    })
    return { ok: true, commandId: r.id }
}

// ─── set_matrix_mute (admin/SE only) ────────────────────────────────────────

export interface SetMatrixMuteArgs {
    matrixIndex: number
    muted: boolean
}

export async function setMatrixMute(
    uid: string,
    args: SetMatrixMuteArgs,
): Promise<{ ok: true; commandId: string } | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const pre = await preflightPrivilegedWrite(db, uid, args.matrixIndex)
    if (pre.ok !== true) return pre

    const r = await enqueueCommand(db, uid, {
        type: "set_matrix_on",
        matrixIndex: args.matrixIndex,
        value: !args.muted,
    })
    return { ok: true, commandId: r.id }
}
