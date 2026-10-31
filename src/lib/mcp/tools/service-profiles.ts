import "server-only"

import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { dayInZone, orgTimeZone } from "@/lib/org/locale"
import { isSongType } from "@/lib/setlist-track-count"
import { classifyService, rabbiSlotOf } from "@/lib/history/classify"
import {
    CRC_CORE_PROFILES,
    profileKeyFor,
    rabbiRequired,
    legacySlotKeyFor,
    slotKeyFor,
    type CoreProfile,
} from "@/lib/profiles/keys"
import { seedProfile, type LearnedFrom, type SeedResult, type SeedUnsure, type SeededTrack } from "@/lib/profiles/seed"
import { buildSlotUses, existingOnDate, historyAliases, loadMemoryHistory, type SlotUseIndex } from "@/lib/profiles/slot-uses"
import { readStandingFor, type StandingChoice } from "@/lib/profiles/standing"
import { computeSlotTier, type SlotTier } from "@/lib/profiles/tiers"
import type { TemplateProfile } from "./templates"

/**
 * Setlist memory, release 2 — profiles live on `setlistTemplates` docs that
 * carry a `profile` block.
 *
 * `seed_service_profiles` (ops, F-05) seeds CRC's core profiles from their
 * own history: one template per profile key, found by `profile.key` + orgId;
 * a template without `profile` is never touched. `get_service_profile`
 * (authoring, read) returns a profile with each slot's live tier, computed
 * from standing choices and history on every read.
 */

const TEMPLATES = "setlistTemplates"

type DB = FirebaseFirestore.Firestore

function profileBlock(def: CoreProfile): TemplateProfile {
    return { key: def.key, serviceType: def.serviceType, rabbiSlot: def.rabbiSlot, book: def.book, label: def.label }
}

/** Stable JSON of a value with object keys sorted and `house.seededAt` dropped. */
function stable(v: unknown): string {
    const norm = (x: unknown, parent?: string): unknown => {
        if (Array.isArray(x)) return x.map((y) => norm(y))
        if (x && typeof x === "object") {
            const o = x as Record<string, unknown>
            const out: Record<string, unknown> = {}
            for (const k of Object.keys(o).sort()) {
                if (parent === "house" && k === "seededAt") continue
                if (o[k] === undefined) continue
                out[k] = norm(o[k], k)
            }
            return out
        }
        return x
    }
    return JSON.stringify(norm(v))
}

async function findProfileTemplate(
    db: DB,
    org: OrgId,
    key: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
    const snap = await db.collection(TEMPLATES).where("orgId", "==", org).where("profile.key", "==", key).get()
    const docs = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)
    return docs[0] ?? null
}

async function ownerNameFor(db: DB, uid: string): Promise<string> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const d = snap.exists ? snap.data() : null
        const name = d?.displayName ?? d?.name ?? d?.email
        return typeof name === "string" && name.trim() ? name : "MCP User"
    } catch {
        return "MCP User"
    }
}

// ─── seed_service_profiles ──────────────────────────────────────────────────

export interface SeedServiceProfilesArgs {
    profiles?: string[]
    dryRun?: boolean
    force?: boolean
    /** Re-seed existing profiles. Default false: only missing ones are created. */
    replace?: boolean
}

export interface SeededProfileReport {
    key: string
    label: string
    basedOn: { setlistId: string; eventDate: string } | null
    learnedFrom: LearnedFrom | null
    trackCount: number
    tracks: Array<{ type: string; title: string; slotKind: string | null; fileId: string | null; key: string | null }>
    unsure: SeedUnsure[]
}

export interface RowChange {
    index: number
    before: { type: string; title: string; fileId: string | null; key: string | null; slotKind: string | null } | null
    after: { type: string; title: string; fileId: string | null; key: string | null; slotKind: string | null } | null
}

export interface SeedOutcome {
    key: string
    templateId: string | null
    /** `kept`: the profile exists and `replace` was not given, so it is left as it is. */
    outcome: "created" | "updated" | "unchanged" | "kept" | "no_history" | "conflict" | "not_run"
    /** With `replace`: each row an update changes. */
    rowChanges?: RowChange[]
}

function rowSummary(t: Record<string, unknown> | undefined): RowChange["before"] {
    if (!t) return null
    return {
        type: typeof t.type === "string" ? t.type : "song",
        title: typeof t.title === "string" ? t.title : "",
        fileId: typeof t.fileId === "string" ? t.fileId : null,
        key: typeof t.key === "string" ? t.key : null,
        slotKind: typeof t.slotKind === "string" ? t.slotKind : null,
    }
}

/** The rows that differ between a stored profile and its re-seed, by position. */
export function rowChangesOf(before: Record<string, unknown>[], after: Record<string, unknown>[]): RowChange[] {
    const out: RowChange[] = []
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
        if (stable(before[i] ?? null) === stable(after[i] ?? null)) continue
        out.push({ index: i, before: rowSummary(before[i]), after: rowSummary(after[i]) })
    }
    return out
}

export type SeedServiceProfilesResult =
    | { ok: true; seeded: []; note: string }
    | {
          ok: true
          dryRun: boolean
          profiles: SeededProfileReport[]
          seeded: SeedOutcome[]
          changed: number
          truncated: boolean
          /** A write was refused mid-run: `seeded` says what was written. */
          partial?: true
          conflict?: { key: string; message: string }
      }

export async function seedServiceProfiles(
    uid: string,
    args: SeedServiceProfilesArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<SeedServiceProfilesResult | RichErrorEnvelope> {
    const dryRun = args?.dryRun !== false
    const force = args?.force === true
    const replace = args?.replace === true
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor

        if (org !== DEFAULT_ORG_ID) {
            return { ok: true, seeded: [], note: "no recurring profiles for this tenant" }
        }

        const wanted = Array.isArray(args?.profiles) && args.profiles.length > 0 ? args.profiles : null
        if (wanted) {
            const unknown = wanted.filter((k) => !CRC_CORE_PROFILES.some((p) => p.key === k))
            if (unknown.length > 0) {
                return richError(
                    "invalid_argument",
                    `Unknown profile key: ${unknown.join(", ")}.`,
                    { unknown, known: CRC_CORE_PROFILES.map((p) => p.key) },
                    "Omit `profiles` to seed every core profile.",
                )
            }
        }
        const defs = CRC_CORE_PROFILES.filter((p) => !wanted || wanted.includes(p.key))

        const { setlists, library, truncated } = await loadMemoryHistory(org)
        const now = new Date()
        // Learned from services before today: a setlist already made for next week is not history.
        const today = dayInZone(now.getTime(), orgTimeZone(org))
        const seeds = defs.map((def) => ({ def, seed: seedProfile(def, setlists, library, now, { before: today }) }))

        const profiles: SeededProfileReport[] = seeds.map(({ def, seed }) => ({
            key: def.key,
            label: def.label,
            basedOn: seed.basedOn,
            learnedFrom: seed.learnedFrom ?? null,
            trackCount: seed.tracks.length,
            tracks: seed.tracks.map((t) => ({
                type: t.type,
                title: t.title,
                slotKind: t.slotKind ?? null,
                fileId: t.fileId ?? null,
                key: t.key ?? null,
            })),
            unsure: seed.unsure,
        }))

        // Plan every write before any happens, so the dry run reports what a real run does.
        const plans: Array<{
            def: CoreProfile
            tracks: SeededTrack[]
            existing: FirebaseFirestore.QueryDocumentSnapshot | null
            outcome: SeedOutcome["outcome"]
            rowChanges?: RowChange[]
        }> = []
        for (const { def, seed } of seeds) {
            const existing = await findProfileTemplate(db, org, def.key)
            let outcome: SeedOutcome["outcome"]
            if (!seed.basedOn) outcome = "no_history"
            else if (!existing) outcome = "created"
            else {
                const d = existing.data()
                const same =
                    stable(d.tracks ?? []) === stable(seed.tracks) &&
                    stable(d.profile ?? null) === stable(profileBlock(def)) &&
                    d.name === def.label &&
                    d.templateType === def.serviceType
                // Never overwrite an existing profile unless asked to.
                outcome = same ? "unchanged" : replace ? "updated" : "kept"
            }
            const plan: (typeof plans)[number] = { def, tracks: seed.tracks, existing, outcome }
            if (outcome === "updated" && existing) {
                const stored = Array.isArray(existing.data().tracks) ? (existing.data().tracks as Record<string, unknown>[]) : []
                plan.rowChanges = rowChangesOf(stored, seed.tracks as unknown as Record<string, unknown>[])
            }
            plans.push(plan)
        }
        const seeded = (): SeedOutcome[] =>
            plans.map((p) => {
                const o: SeedOutcome = { key: p.def.key, templateId: p.existing?.id ?? null, outcome: p.outcome }
                if (p.rowChanges) o.rowChanges = p.rowChanges
                return o
            })
        const changedCount = () => plans.filter((p) => p.outcome === "created" || p.outcome === "updated").length

        const report = { ok: true as const, dryRun, profiles, seeded: seeded(), changed: changedCount(), truncated }
        if (dryRun) return report
        if (!force) {
            return richError(
                "force_required",
                "seed_service_profiles requires force:true to commit.",
                { dryRunPlan: { ...report, dryRun: false } },
                "Review the dry-run report, then re-call with { dryRun: false, force: true }.",
            )
        }

        const ownerName = await ownerNameFor(db, uid)
        const out: SeedOutcome[] = []
        const writePlan = async (p: (typeof plans)[number]): Promise<SeedOutcome> => {
            if (p.outcome === "created") {
                // One doc id per profile: a concurrent second seed run fails create() instead of
                // making a duplicate profile.
                const ref = db.collection(TEMPLATES).doc(`profile__${org}__${p.def.key}`)
                await ref.create({
                    id: ref.id,
                    name: p.def.label,
                    templateType: p.def.serviceType,
                    kind: "profile",
                    profile: profileBlock(p.def),
                    orgId: org,
                    ownerId: uid,
                    ownerName,
                    tracks: p.tracks,
                    version: 1,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                })
                return { key: p.def.key, templateId: ref.id, outcome: "created" }
            }
            if (p.outcome === "updated" && p.existing) {
                await p.existing.ref.update(
                    {
                        name: p.def.label,
                        templateType: p.def.serviceType,
                        kind: "profile",
                        profile: profileBlock(p.def),
                        tracks: p.tracks,
                        version: FieldValue.increment(1),
                        updatedAt: FieldValue.serverTimestamp(),
                    },
                    { lastUpdateTime: p.existing.updateTime },
                )
                return { key: p.def.key, templateId: p.existing.id, outcome: "updated" }
            }
            return { key: p.def.key, templateId: p.existing?.id ?? null, outcome: p.outcome }
        }
        for (const [i, p] of plans.entries()) {
            try {
                out.push(await writePlan(p))
            } catch (error) {
                // Someone else wrote this profile since the plan (precondition
                // failed): stop, and say exactly what this run wrote.
                const message = error instanceof Error ? error.message : String(error)
                logger.warn("[mcp] seed_service_profiles stopped mid-run", { org, key: p.def.key, message })
                out.push({ key: p.def.key, templateId: p.existing?.id ?? null, outcome: "conflict" })
                for (const rest of plans.slice(i + 1)) {
                    out.push({ key: rest.def.key, templateId: rest.existing?.id ?? null, outcome: "not_run" })
                }
                const written = out.filter((o) => o.outcome === "created" || o.outcome === "updated").length
                return {
                    ...report,
                    dryRun: false,
                    seeded: out,
                    changed: written,
                    partial: true,
                    conflict: { key: p.def.key, message },
                }
            }
        }
        logger.info("[mcp] seed_service_profiles committed", { org, seeded: out })
        return { ...report, dryRun: false, seeded: out, changed: changedCount() }
    } catch (error) {
        logger.warn("seed_service_profiles failed:", error)
        return richError(
            "internal_error",
            "seed_service_profiles failed.",
            { errorCode: 500 },
            "Retry the dry run; nothing is written until a forced real run.",
        )
    }
}

/** The core profile definition for a key in this org; only CRC has them. */
export function coreProfileFor(org: OrgId, profileKey: string): CoreProfile | null {
    if (org !== DEFAULT_ORG_ID) return null
    return CRC_CORE_PROFILES.find((p) => p.key === profileKey) ?? null
}

/** True when the stored rows already say what `tracks` says (ignoring `house.seededAt`). */
export function sameRows(stored: unknown, tracks: SeededTrack[]): boolean {
    return stable(stored ?? []) === stable(tracks)
}

/** Why a learned order may not replace the stored one without an explicit override. */
export interface ShrinkGuard {
    reason: "empty_order" | "shrinks_by_half"
    learned: number
    stored: number
}

/**
 * A learned running order never silently replaces a profile with nothing, or
 * with less than half of what is stored: that is a learning fault (empty
 * history, a starved window), not a change of liturgy. Null when the write is fine.
 */
export function learnedOrderGuard(learned: number, stored: number): ShrinkGuard | null {
    if (learned === 0) return { reason: "empty_order", learned, stored }
    if (stored > 0 && learned * 2 < stored) return { reason: "shrinks_by_half", learned, stored }
    return null
}

function storedRowCount(existing: FirebaseFirestore.QueryDocumentSnapshot | null): number {
    const t = existing?.data().tracks
    return Array.isArray(t) ? t.length : 0
}

/**
 * Bet 1 (MCP-03): a profile is a cache of what was learned. Write the learned
 * rows to the profile doc when they differ from what is stored (or create it).
 * Best effort: a race or a failed write leaves the doc as it was, and the
 * draft still uses what it just learned. Returns the doc id.
 */
export async function cacheLearnedProfile(
    uid: string,
    org: OrgId,
    def: CoreProfile,
    seed: SeedResult,
    existing: FirebaseFirestore.QueryDocumentSnapshot | null,
): Promise<string> {
    initAdmin()
    const db = getFirestore()
    const ref = existing?.ref ?? db.collection(TEMPLATES).doc(`profile__${org}__${def.key}`)
    const guard = learnedOrderGuard(seed.tracks.length, storedRowCount(existing))
    if (guard) {
        // Never cache an empty or halved order on a draft; reseed_service_profile with allowShrink can.
        logger.warn("[mcp] profile cache write refused", { org, key: def.key, ...guard })
        return existing?.id ?? ref.id
    }
    try {
        if (existing) {
            if (sameRows(existing.data().tracks, seed.tracks)) return existing.id
            await existing.ref.update(
                {
                    tracks: seed.tracks,
                    learnedFrom: seed.learnedFrom ?? null,
                    version: FieldValue.increment(1),
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { lastUpdateTime: existing.updateTime },
            )
            logger.info("[mcp] profile re-learned", { org, key: def.key, learnedFrom: seed.learnedFrom?.count ?? 0 })
            return existing.id
        }
        await ref.create({
            id: ref.id,
            name: def.label,
            templateType: def.serviceType,
            kind: "profile",
            profile: profileBlock(def),
            orgId: org,
            ownerId: uid,
            ownerName: await ownerNameFor(db, uid),
            tracks: seed.tracks,
            learnedFrom: seed.learnedFrom ?? null,
            version: 1,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        })
        logger.info("[mcp] profile learned on first draft", { org, key: def.key, basedOn: seed.basedOn })
    } catch (error) {
        // A concurrent draft wrote it first: the next draft learns again anyway.
        logger.info("[mcp] profile cache write skipped", { org, key: def.key, error: String(error) })
    }
    return ref.id
}

/**
 * MCP-15: the newest legacy (non-profile) template of this org for a core
 * profile — same service type, and the same rabbi where the rabbi splits the
 * profile ("Randy Shabbat morning"). Its rows give a running order when the
 * profile has no history yet; it never fills a chart.
 */
export async function findLegacyTemplate(
    org: OrgId,
    def: CoreProfile,
): Promise<{ id: string; name: string; tracks: Record<string, unknown>[]; serviceNotes: string | null } | null> {
    initAdmin()
    const snap = await getFirestore().collection(TEMPLATES).where("orgId", "==", org).get()
    const matches = snap.docs
        .filter((d) => {
            const t = d.data()
            if (rowOrg(t.orgId) !== org || t.kind === "profile" || t.profile) return false
            const name = typeof t.name === "string" ? t.name : ""
            const cls = classifyService({ name, templateType: str(t.templateType) })
            if (cls.serviceType !== def.serviceType) return false
            if (!def.rabbiSlot) return true
            return (rabbiSlotOf(str(t.rabbi)) ?? rabbiSlotOf(name)) === def.rabbiSlot
        })
        .sort((a, b) => millis(b.data().updatedAt) - millis(a.data().updatedAt))
    const doc = matches[0]
    if (!doc) return null
    const d = doc.data()
    return {
        id: doc.id,
        name: typeof d.name === "string" ? d.name : def.label,
        tracks: Array.isArray(d.tracks) ? (d.tracks as Record<string, unknown>[]) : [],
        serviceNotes: typeof d.serviceNotes === "string" ? d.serviceNotes : null,
    }
}

function millis(v: unknown): number {
    if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
        return (v as { toMillis: () => number }).toMillis()
    }
    if (typeof v === "string") return Date.parse(v) || 0
    return 0
}

// ─── get_service_profile ────────────────────────────────────────────────────

export interface GetServiceProfileArgs {
    serviceType: string
    rabbiSlot?: string | null
}

export interface ProfileRow {
    index: number
    type: string
    title: string
    slotKind: string | null
    slotKey: string | null
    house: unknown
    /** Song rows only: the slot's live tier. */
    tier?: SlotTier
}

export interface GetServiceProfileResult {
    ok: true
    templateId: string
    profile: TemplateProfile
    rows: ProfileRow[]
    truncated: boolean
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

export interface LoadedProfileRow {
    index: number
    type: string
    title: string
    slotKind: string | null
    slotKey: string | null
    house: unknown
    /** The stored template row, as written. */
    track: Record<string, unknown>
    /** Song rows only. */
    tier?: SlotTier
    /** The standing choice behind a `standard` tier. */
    standing?: StandingChoice
}

export interface LoadedProfile {
    templateId: string
    profileKey: string
    profile: TemplateProfile
    serviceNotes: string | null
    rows: LoadedProfileRow[]
    truncated: boolean
    /** Setlists already on the asked date for this service type (empty without a date). */
    existing: { setlistId: string; name: string }[]
}

/** The profile template for a key in this org, or null (a template without `profile` never matches). */
export async function findProfileTemplateFor(
    org: OrgId,
    profileKey: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
    initAdmin()
    return findProfileTemplate(getFirestore(), org, profileKey)
}

/**
 * Every row of a profile with its live tier: the profile's standing choices
 * first, then history. Shared by get_service_profile and draft_service. A song
 * row's slot is recomputed (MCP-02 keys a prayer by its moment); the slot key
 * it was stored under is still read for an older standing choice.
 */
export async function tierProfileRows(
    org: OrgId,
    tracks: Record<string, unknown>[],
    profileKey: string,
    index: SlotUseIndex,
): Promise<LoadedProfileRow[]> {
    const slots = tracks.map((t) => {
        if (!isSongType(t.type)) return null
        const row = {
            momentId: str(t.momentId),
            title: typeof t.title === "string" ? t.title : "",
            fileId: str(t.fileId),
            type: "song",
        }
        // A prayer's moment wins (MCP-02); a song row keeps the slot it was learned under.
        const viaMoment = slotKeyFor(row, index.partGroupOf)
        const slotKey = viaMoment.startsWith("moment:") ? viaMoment : (str(t.slotKey) ?? viaMoment)
        const aliases = [
            ...new Set(
                [str(t.slotKey), legacySlotKeyFor(row, index.partGroupOf), ...historyAliases(index, slotKey)].filter(
                    (a): a is string => !!a && a !== slotKey,
                ),
            ),
        ]
        return { slotKey, aliases }
    })
    // Only the profile's own scope: a choice for another rabbi's profile never shows here.
    const standing = await readStandingFor(
        org,
        profileKey,
        slots.filter((x): x is { slotKey: string; aliases: string[] } => !!x),
    )
    return tracks.map((t, i) => {
        const slotKey = slots[i]?.slotKey ?? null
        const row: LoadedProfileRow = {
            index: i,
            type: typeof t.type === "string" ? t.type : "song",
            title: typeof t.title === "string" ? t.title : "",
            slotKind: str(t.slotKind),
            slotKey,
            house: t.house ?? null,
            track: t,
        }
        if (slotKey) {
            const choice = standing.get(slotKey) ?? null
            row.tier = computeSlotTier({
                standing: choice,
                profileUses: index.profileUses(slotKey),
                otherUses: index.otherUses(slotKey),
            })
            if (choice) row.standing = choice
        }
        return row
    })
}

/** A profile template with its live tiers (get_service_profile). */
export async function loadProfileTiers(
    org: OrgId,
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    serviceType: string,
    rabbiSlot: string | null,
    date?: string,
): Promise<LoadedProfile> {
    const data = doc.data()
    const profile = data.profile as TemplateProfile
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    const tracks = Array.isArray(data.tracks) ? (data.tracks as Record<string, unknown>[]) : []
    const { setlists, library, truncated } = await loadMemoryHistory(org)
    const index = buildSlotUses(setlists, library, { serviceType, rabbiSlot, before: date, byTitle: org === DEFAULT_ORG_ID })
    const existing = date ? existingOnDate(setlists, date, serviceType, orgTimeZone(org)) : []
    const rows = await tierProfileRows(org, tracks, profileKey, index)
    return {
        templateId: doc.id,
        profileKey,
        profile,
        serviceNotes: typeof data.serviceNotes === "string" ? data.serviceNotes : null,
        rows,
        truncated,
        existing,
    }
}

export async function getServiceProfileTool(
    _uid: string,
    args: GetServiceProfileArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<GetServiceProfileResult | RichErrorEnvelope> {
    const serviceType = str(args?.serviceType)
    if (!serviceType) {
        return richError("invalid_argument", "Pass `serviceType`.", { fields: ["serviceType"] }, "e.g. 'shabbat_morning'.")
    }
    const askedRabbi = str(args?.rabbiSlot)
    if (rabbiRequired(serviceType) && !askedRabbi) {
        return richError(
            "rabbi_required",
            "This service's music depends on the rabbi; say which rabbi leads it.",
            { serviceType },
            "Pass rabbiSlot: 'daniel_karen' or 'randy'.",
        )
    }
    // A service not split by rabbi has one profile whoever leads it.
    const rabbiSlot = rabbiRequired(serviceType) ? askedRabbi : null
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    try {
        initAdmin()
        const db = getFirestore()
        const doc = await findProfileTemplate(db, org, profileKey)
        if (!doc) {
            return richError(
                "profile_not_found",
                `No profile '${profileKey}' in this tenant.`,
                { profileKey },
                "Call draft_service once; it creates the profile.",
            )
        }
        const loaded = await loadProfileTiers(org, doc, serviceType, rabbiSlot)
        const rows: ProfileRow[] = loaded.rows.map((r) => {
            const row: ProfileRow = {
                index: r.index,
                type: r.type,
                title: r.title,
                slotKind: r.slotKind,
                slotKey: r.slotKey,
                house: r.house,
            }
            if (r.tier) row.tier = r.tier
            return row
        })
        const { profile, truncated } = loaded
        return { ok: true, templateId: doc.id, profile, rows, truncated }
    } catch (error) {
        logger.warn("get_service_profile failed:", error)
        return richError(
            "internal_error",
            "Could not read the service profile.",
            { errorCode: 500 },
            "Retry; get_template still shows the stored rows.",
        )
    }
}

// ─── reseed_service_profile ─────────────────────────────────────────────────

export interface ReseedServiceProfileArgs {
    serviceType: string
    rabbiSlot?: string | null
    dryRun?: boolean
    force?: boolean
    /** Write even when the learned order is empty or under half the stored one. */
    allowShrink?: boolean
}

export interface ReseedServiceProfileReport {
    ok: true
    dryRun: boolean
    profileKey: string
    label: string
    /** created: no profile yet; updated: the order or charts change; unchanged; no_history: nothing to learn from. */
    outcome: "created" | "updated" | "unchanged" | "no_history"
    /** The regular services the order is learned from, newest first. */
    learnedFrom: Array<{ setlistId: string; name: string; date: string }>
    order: Array<{ index: number; type: string; title: string; slotKind: string | null; fileId: string | null; key: string | null }>
    unsure: SeedUnsure[]
    rowChanges?: RowChange[]
    /** Set when a real run would be refused: the learned order is empty or under half the stored one. */
    shrinkGuard?: ShrinkGuard & { overridden: boolean }
    templateId: string | null
}

/**
 * MCP-25 — re-learn one profile's running order now, from its last regular
 * services, and show it. Admin / band_leader. F-05: `dryRun` defaults true
 * and returns the full report; a real run needs `dryRun: false, force: true`.
 * A draft re-learns on its own; this is for looking, and for refreshing the
 * saved profile on purpose.
 */
export async function reseedServiceProfileTool(
    uid: string,
    args: ReseedServiceProfileArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ReseedServiceProfileReport | RichErrorEnvelope> {
    const serviceType = str(args?.serviceType)
    if (!serviceType) {
        return richError("invalid_argument", "Pass `serviceType`.", { fields: ["serviceType"] }, "e.g. 'shabbat_morning'.")
    }
    const askedRabbi = str(args?.rabbiSlot)
    if (rabbiRequired(serviceType) && !askedRabbi) {
        return richError(
            "rabbi_required",
            "This service's music depends on the rabbi; say which rabbi leads it.",
            { serviceType },
            "Pass rabbiSlot: 'daniel_karen' or 'randy'. Ask; never infer it.",
        )
    }
    const rabbiSlot = rabbiRequired(serviceType) ? askedRabbi : null
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    const dryRun = args?.dryRun !== false
    const force = args?.force === true
    const allowShrink = args?.allowShrink === true
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor
        const def = coreProfileFor(org, profileKey)
        if (!def) {
            return richError(
                "profile_not_found",
                `'${profileKey}' is not a recurring service profile of this tenant.`,
                { profileKey, known: org === DEFAULT_ORG_ID ? CRC_CORE_PROFILES.map((p) => p.key) : [] },
                org === DEFAULT_ORG_ID ? "Use one of the known profile keys." : "This tenant has no service profiles.",
            )
        }
        const now = new Date()
        const today = dayInZone(now.getTime(), orgTimeZone(org))
        const { setlists, library } = await loadMemoryHistory(org)
        const seed = seedProfile(def, setlists, library, now, { before: today })
        const existing = await findProfileTemplate(db, org, profileKey)
        const outcome: ReseedServiceProfileReport["outcome"] = !seed.learnedFrom
            ? "no_history"
            : !existing
              ? "created"
              : sameRows(existing.data().tracks, seed.tracks)
                ? "unchanged"
                : "updated"
        const report: ReseedServiceProfileReport = {
            ok: true,
            dryRun,
            profileKey,
            label: def.label,
            outcome,
            learnedFrom: (seed.learnedFrom?.setlists ?? []).map((s) => ({
                setlistId: s.setlistId,
                name: s.name,
                date: dayInZone(Date.parse(s.eventDate), orgTimeZone(org)),
            })),
            order: seed.tracks.map((t, index) => ({
                index,
                type: t.type,
                title: t.title,
                slotKind: t.slotKind ?? null,
                fileId: t.fileId ?? null,
                key: t.key ?? null,
            })),
            unsure: seed.unsure,
            templateId: existing?.id ?? null,
        }
        if (outcome === "updated" && existing) {
            const stored = Array.isArray(existing.data().tracks) ? (existing.data().tracks as Record<string, unknown>[]) : []
            report.rowChanges = rowChangesOf(stored, seed.tracks as unknown as Record<string, unknown>[])
        }
        const guard = outcome === "created" || outcome === "updated" ? learnedOrderGuard(seed.tracks.length, storedRowCount(existing)) : null
        if (guard) report.shrinkGuard = { ...guard, overridden: allowShrink }
        if (dryRun || outcome === "unchanged" || outcome === "no_history") return report
        if (guard && !allowShrink) {
            return richError(
                "shrink_refused",
                guard.reason === "empty_order"
                    ? "The learned order is empty; the saved profile was not changed."
                    : `The learned order has ${guard.learned} rows, under half of the ${guard.stored} saved; the saved profile was not changed.`,
                { shrinkGuard: guard, dryRunPlan: { ...report, dryRun: false } },
                "Check learnedFrom in the dry run. To write it anyway, re-call with allowShrink: true.",
            )
        }
        if (!force) {
            return richError(
                "force_required",
                "reseed_service_profile requires force:true to write.",
                { dryRunPlan: { ...report, dryRun: false } },
                "Review the dry-run report with the author, then re-call with { dryRun: false, force: true }.",
            )
        }
        if (existing) {
            await existing.ref.update(
                {
                    tracks: seed.tracks,
                    learnedFrom: seed.learnedFrom ?? null,
                    profile: profileBlock(def),
                    kind: "profile",
                    version: FieldValue.increment(1),
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { lastUpdateTime: existing.updateTime },
            )
            logger.info("[mcp] reseed_service_profile updated", { org, key: profileKey })
            return { ...report, dryRun: false }
        }
        const ref = db.collection(TEMPLATES).doc(`profile__${org}__${def.key}`)
        await ref.create({
            id: ref.id,
            name: def.label,
            templateType: def.serviceType,
            kind: "profile",
            profile: profileBlock(def),
            orgId: org,
            ownerId: uid,
            ownerName: await ownerNameFor(db, uid),
            tracks: seed.tracks,
            learnedFrom: seed.learnedFrom ?? null,
            version: 1,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        })
        logger.info("[mcp] reseed_service_profile created", { org, key: profileKey })
        return { ...report, dryRun: false, templateId: ref.id }
    } catch (error) {
        logger.warn("reseed_service_profile failed:", error)
        return richError(
            "internal_error",
            "Could not re-learn the profile.",
            { errorCode: 500 },
            "Retry the dry run; if a real run failed, another write may have landed first.",
        )
    }
}
