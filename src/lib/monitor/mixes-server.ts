import { FieldValue } from "firebase-admin/firestore"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import {
    assertMonitorAccess,
    canControlBus,
    isPrivilegedMonitor,
    loadMixerStateMeta,
    validBusIndicesFor,
    type AccessOk,
} from "@/lib/mcp/server-monitor"
import {
    applyCeilingsPatch,
    ceilingFor,
    raisedAboveUnity,
    faderToDb,
    normalizeCeilings,
    type CeilingsPatch,
    type MonitorCeilings,
} from "@/lib/monitor/limits"
import {
    coerceSnapshot,
    MIX_NAME_MAX,
    planRecall,
    recallList,
    recallWaves,
    RECALL_STEP_MS,
    SNAPSHOTS_ROOT,
    type MixSnapshot,
    type RecallPlan,
} from "@/lib/monitor/saved-mixes"
import type { BusInfo, ChannelInfo } from "@/types/monitor"

/**
 * Server side of BET-4 (limits and saved mixes), shared by the MCP tools and
 * the /api/monitor routes so both apply the same rules:
 *
 *  - every call goes through `assertMonitorAccess` (admin, sound engineer, or
 *    someone with an assigned bus — read from the bridge tenant, crc);
 *  - a bus is only touched by someone who owns it or is privileged
 *    (`canControlBus`), and recall writes ordinary commands under the CALLER's
 *    uid, so the bridge's own ownership and ceiling checks apply again;
 *  - named mixes are their owner's alone, even for an engineer;
 *  - only an engineer or admin may change the ceilings.
 *
 * Callers are tenant-gated before they get here (MCP: withFeatureGates on the
 * `mixer` feature; API routes: `mixerOn`).
 */

type DB = FirebaseFirestore.Firestore

/** A person may keep this many named mixes per bus. */
export const NAMED_MIX_LIMIT = 20

function snapshotsCol(db: DB, busIndex: number): FirebaseFirestore.CollectionReference {
    const [c, d, sub] = SNAPSHOTS_ROOT
    return db.collection(c).doc(d).collection(sub).doc(String(busIndex)).collection("items")
}

/** The bus a call is about: the one asked for, else the caller's first. */
export function resolveBus(access: AccessOk, busIndex: number | undefined, uid: string): number | RichErrorEnvelope {
    if (busIndex === undefined) {
        if (access.ownedBuses.length > 0) return access.ownedBuses[0]
        return richError(
            "monitor_no_bus_assigned",
            "You don't have a wedge bus of your own, so pass busIndex.",
            { validBuses: validBusIndicesFor(access.config, access.ownedBuses) },
            "Pass busIndex 1-5. Call list_monitor_buses to see who is on which bus.",
        )
    }
    if (!Number.isInteger(busIndex) || busIndex < 1 || busIndex > 5) {
        return richError("invalid_bus_index", `Bus ${busIndex} is not a wedge bus (1-5).`, { busIndex })
    }
    if (!canControlBus(access.user, access.ownedBuses, busIndex)) {
        return richError(
            "monitor_bus_forbidden",
            `Bus ${busIndex} is not yours. You can only use your own wedge bus.`,
            { busIndex, ownedBuses: access.ownedBuses, callerUid: uid },
            "Ask the sound engineer to change another person's wedge.",
        )
    }
    return busIndex
}

const isErr = (v: unknown): v is RichErrorEnvelope =>
    !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false

async function loadSnapshots(db: DB, busIndex: number): Promise<MixSnapshot[]> {
    // Small by construction (10 auto + up to 20 named per owner), and createdAt may
    // be a number (web) or a Timestamp (bridge), so sort in memory, not in a query.
    const snap = await snapshotsCol(db, busIndex).get()
    const out: MixSnapshot[] = []
    for (const d of snap.docs) {
        const s = coerceSnapshot(d.id, d.data(), busIndex)
        if (s) out.push(s)
    }
    return out
}

function describeSnapshot(s: MixSnapshot) {
    return {
        id: s.id,
        kind: s.kind,
        name: s.name,
        serviceType: s.serviceType,
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
        channelCount: s.sends.length,
        masterDb: s.master == null ? null : faderToDb(s.master),
    }
}

// ─── list ────────────────────────────────────────────────────────────────────

export interface ListSavedMixesArgs {
    busIndex?: number
    autoCount?: number
}

export async function listSavedMixes(db: DB, uid: string, args: ListSavedMixesArgs) {
    const access = await assertMonitorAccess(db, uid)
    if (isErr(access)) return access
    const bus = resolveBus(access, args.busIndex, uid)
    if (isErr(bus)) return bus
    const all = await loadSnapshots(db, bus)
    const list = recallList(all, uid, Math.min(10, Math.max(1, args.autoCount ?? 3)))
    // Home levels for double-tap: the newest snapshot this caller may see.
    const newest = [...list.named, ...list.auto].sort((a, b) => b.createdAt - a.createdAt)[0]
    return {
        ok: true as const,
        busIndex: bus,
        named: list.named.map(describeSnapshot),
        auto: list.auto.map(describeSnapshot),
        home: newest
            ? {
                  master: newest.master,
                  sends: Object.fromEntries(newest.sends.map((s) => [String(s.channelIndex), s.level])),
              }
            : null,
    }
}

// ─── save ────────────────────────────────────────────────────────────────────

export interface SaveMixArgs {
    busIndex?: number
    name: string
    serviceType?: string | null
}

export async function saveMix(db: DB, uid: string, args: SaveMixArgs) {
    const access = await assertMonitorAccess(db, uid)
    if (isErr(access)) return access
    const bus = resolveBus(access, args.busIndex, uid)
    if (isErr(bus)) return bus
    const name = typeof args.name === "string" ? args.name.trim() : ""
    if (!name || name.length > MIX_NAME_MAX) {
        return richError("invalid_argument", `A mix name is 1 to ${MIX_NAME_MAX} characters.`, { field: "name" })
    }
    const { snapshot } = await loadMixerStateMeta(db)
    const live = (Array.isArray(snapshot?.buses) ? (snapshot!.buses as BusInfo[]) : []).find((b) => b?.index === bus)
    if (!live || !Array.isArray(live.sends)) {
        return richError(
            "monitor_state_unavailable",
            "The mixer's levels for this bus are not available right now, so there is nothing to save.",
            { busIndex: bus },
            "Check that the bridge is running, then try again.",
        )
    }
    const own = await snapshotsCol(db, bus).where("ownerUid", "==", uid).get()
    const ownNamed = own.docs.filter((d) => d.get("kind") === "named")
    if (ownNamed.length >= NAMED_MIX_LIMIT) {
        return richError(
            "mix_limit_reached",
            `You already have ${NAMED_MIX_LIMIT} saved mixes on this bus.`,
            { busIndex: bus, limit: NAMED_MIX_LIMIT },
            "Recall or replace an older one first.",
        )
    }
    const channels = Array.isArray(snapshot?.channels) ? (snapshot!.channels as ChannelInfo[]) : []
    const nameOf = new Map(channels.map((c) => [c.index, c.name]))
    const doc = {
        busIndex: bus,
        kind: "named" as const,
        name,
        serviceType: typeof args.serviceType === "string" && args.serviceType ? args.serviceType : null,
        ownerUid: uid,
        createdAt: Date.now(),
        sends: live.sends
            .filter((s) => typeof s?.channelIndex === "number" && typeof s.level === "number")
            .map((s) => ({
                channelIndex: s.channelIndex,
                channelName: nameOf.get(s.channelIndex) ?? "",
                level: s.level,
                on: s.on !== false,
            })),
        master: typeof live.fader === "number" ? live.fader : null,
    }
    const ref = await snapshotsCol(db, bus).add(doc)
    return { ok: true as const, busIndex: bus, id: ref.id, name, channelCount: doc.sends.length }
}

// ─── recall ──────────────────────────────────────────────────────────────────

export interface RecallMixArgs {
    busIndex?: number
    snapshotId: string
    /** Default true: return the plan only. */
    dryRun?: boolean
}

function describePlan(plan: RecallPlan) {
    return {
        changes: plan.changes.map((c) => ({
            target: c.target,
            channelIndex: c.channelIndex,
            channelName: c.channelName,
            matchedBy: c.matchedBy,
            before: { level: c.fromLevel, db: c.fromDb, on: c.fromOn },
            after: { level: c.toLevel, db: c.toDb, on: c.toOn },
            heldAtLimit: c.clamped,
        })),
        unmatched: plan.unmatched,
        unchanged: plan.unchanged,
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function recallMix(
    db: DB,
    uid: string,
    args: RecallMixArgs,
    opts: { stepMs?: number } = {},
) {
    const access = await assertMonitorAccess(db, uid)
    if (isErr(access)) return access
    const bus = resolveBus(access, args.busIndex, uid)
    if (isErr(bus)) return bus
    if (typeof args.snapshotId !== "string" || !args.snapshotId) {
        return richError("invalid_argument", "Pass the snapshotId from list_saved_mixes.", { field: "snapshotId" })
    }
    const docSnap = await snapshotsCol(db, bus).doc(args.snapshotId).get()
    const saved = docSnap.exists ? coerceSnapshot(docSnap.id, docSnap.data(), bus) : null
    // A named mix that is someone else's reads exactly like a missing one.
    if (!saved || saved.busIndex !== bus || (saved.kind === "named" && saved.ownerUid !== uid)) {
        return richError(
            "mix_not_found",
            "No saved mix with that id on this bus.",
            { busIndex: bus, snapshotId: args.snapshotId },
            "Call list_saved_mixes for this bus.",
        )
    }
    const { snapshot } = await loadMixerStateMeta(db)
    const live = (Array.isArray(snapshot?.buses) ? (snapshot!.buses as BusInfo[]) : []).find((b) => b?.index === bus)
    if (!live || !Array.isArray(live.sends) || typeof live.fader !== "number") {
        return richError(
            "monitor_state_unavailable",
            "The mixer's current levels for this bus are not available, so a recall cannot be planned.",
            { busIndex: bus },
            "Check that the bridge is running, then try again.",
        )
    }
    const channels = (Array.isArray(snapshot?.channels) ? (snapshot!.channels as ChannelInfo[]) : []).map((c) => ({
        index: c.index,
        name: typeof c.name === "string" ? c.name : "",
    }))
    const ceilings = (access.config as { ceilings?: unknown }).ceilings
    const plan = planRecall(saved, { index: bus, fader: live.fader, sends: live.sends }, channels, ceilings)
    const base = {
        ok: true as const,
        busIndex: bus,
        snapshot: describeSnapshot(saved),
        ...describePlan(plan),
    }
    if (args.dryRun !== false) return { ...base, dryRun: true, committed: false, commandCount: 0 }

    // The normal command path: one batch per wave, under the caller's uid, so
    // the bridge's ownership and ceiling checks apply to every step.
    const pending = db.collection("monitor-live").doc("commands").collection("pending")
    const waves = recallWaves(plan)
    let commandCount = 0
    const stepMs = opts.stepMs ?? RECALL_STEP_MS
    for (let i = 0; i < waves.length; i++) {
        try {
            const batch = db.batch()
            for (const cmd of waves[i]) batch.set(pending.doc(), { ...cmd, uid, createdAt: Date.now() })
            await batch.commit()
            commandCount += waves[i].length
        } catch (err) {
            // Nothing reached the desk yet: an ordinary failure.
            if (i === 0) {
                return richError(
                    "recall_failed",
                    "The recall could not be sent. Nothing changed.",
                    { busIndex: bus, debug: err instanceof Error ? err.message : String(err) },
                    "Try again.",
                )
            }
            // Some waves landed: say so, so the caller can retry (a retry
            // re-plans from the desk's levels as they now are).
            return {
                ...base,
                dryRun: false,
                committed: "partial" as const,
                commandCount,
                failedAtWave: i,
                waveCount: waves.length,
                hint: "Recall stopped partway: some faders moved. Call recall_mix again with dryRun:false to finish.",
            }
        }
        if (i < waves.length - 1 && stepMs > 0) await sleep(stepMs)
    }
    return { ...base, dryRun: false, committed: true as const, commandCount }
}

// ─── limits ──────────────────────────────────────────────────────────────────

function limitsView(raw: unknown, buses: number[]) {
    const { ceilings, stored } = normalizeCeilings(raw)
    const at = (l: number) => ({ level: l, db: faderToDb(l) })
    return {
        source: stored ? ("stored" as const) : ("defaults" as const),
        default: { send: at(ceilings.default.send), master: at(ceilings.default.master) },
        perBus: Object.fromEntries(
            Object.entries(ceilings.perBus ?? {}).map(([k, v]) => [
                k,
                {
                    ...(v.send !== undefined ? { send: at(v.send) } : {}),
                    ...(v.master !== undefined ? { master: at(v.master) } : {}),
                },
            ]),
        ),
        perChannel: Object.fromEntries(
            Object.entries(ceilings.perChannel ?? {}).map(([k, v]) => [k, { send: at(v.send!) }]),
        ),
        effective: buses.map((b) => ({
            busIndex: b,
            send: at(ceilingFor(raw, "send", b)),
            master: at(ceilingFor(raw, "master", b)),
        })),
        updatedBy: ceilings.updatedBy ?? null,
    }
}

export async function getMonitorLimits(db: DB, uid: string) {
    const access = await assertMonitorAccess(db, uid)
    if (isErr(access)) return access
    const raw = (access.config as { ceilings?: unknown }).ceilings
    return { ok: true as const, ...limitsView(raw, validBusIndicesFor(access.config, access.ownedBuses)) }
}

export interface SetMonitorLimitsArgs extends CeilingsPatch {
    dryRun?: boolean
    /** Required when the change raises any limit above 0 dB (0.75). */
    confirm?: boolean
}

export const RAISE_ABOVE_UNITY_HINT = "Raising a wedge limit above 0 dB risks feedback; resend with confirm:true"

export async function setMonitorLimits(db: DB, uid: string, args: SetMonitorLimitsArgs) {
    const access = await assertMonitorAccess(db, uid)
    if (isErr(access)) return access
    if (!isPrivilegedMonitor(access.user)) {
        return richError(
            "monitor_limits_forbidden",
            "Only the sound engineer or an admin can change the wedge limits.",
            { callerRole: access.user.role ?? null },
        )
    }
    const current = (access.config as { ceilings?: unknown }).ceilings
    const merged = applyCeilingsPatch(current, args)
    if (!merged.ok) {
        return richError(
            "invalid_argument",
            `Limit ${merged.field} must be a fader position from 0 to 1 on bus 1-5 or channel 1-32.`,
            { field: merged.field },
        )
    }
    const buses = validBusIndicesFor(access.config, access.ownedBuses)
    const after = limitsView(merged.ceilings, buses)
    if (args.dryRun === true) return { ok: true as const, dryRun: true, committed: false, ...after }
    // Lead's ruling (after Daniel's safety ruling): a limit that RISES above
    // 0 dB is written only with confirm:true; otherwise this is a preview.
    const raised = raisedAboveUnity(current, merged.ceilings)
    if (raised.length > 0 && args.confirm !== true) {
        return {
            ok: true as const,
            dryRun: true,
            committed: false,
            needsConfirm: true,
            raised: raised.map((r) => ({
                field: r.field,
                from: { level: r.from, db: faderToDb(r.from) },
                to: { level: r.to, db: faderToDb(r.to) },
            })),
            hint: RAISE_ABOVE_UNITY_HINT,
            ...after,
        }
    }
    const value: MonitorCeilings = { ...merged.ceilings, updatedBy: uid }
    await db
        .collection("config")
        .doc("monitor")
        .update({ ceilings: { ...value, updatedAt: FieldValue.serverTimestamp() } })
    return { ok: true as const, dryRun: false, committed: true, ...after, updatedBy: uid }
}
