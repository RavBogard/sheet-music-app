import "server-only"

import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { isSongType } from "@/lib/setlist-track-count"
import { loadHistorySetlists, loadLibraryLite } from "@/lib/history/load"
import {
    CRC_CORE_PROFILES,
    profileKeyFor,
    rabbiRequired,
    slotKeyFor,
    type CoreProfile,
} from "@/lib/profiles/keys"
import { seedProfile, type SeedUnsure, type SeededTrack } from "@/lib/profiles/seed"
import { loadSlotUses } from "@/lib/profiles/slot-uses"
import { readStanding, standingMapKey, type StandingChoice } from "@/lib/profiles/standing"
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

        const { setlists, truncated } = await loadHistorySetlists(org, {})
        const fileIds = setlists.flatMap((s) => s.tracks.map((t) => t.fileId).filter((f): f is string => !!f))
        const library = await loadLibraryLite(org, fileIds)
        const now = new Date()
        const seeds = defs.map((def) => ({ def, seed: seedProfile(def, setlists, library, now) }))

        const profiles: SeededProfileReport[] = seeds.map(({ def, seed }) => ({
            key: def.key,
            label: def.label,
            basedOn: seed.basedOn,
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
                const ref = db.collection(TEMPLATES).doc()
                await ref.create({
                    id: ref.id,
                    name: p.def.label,
                    templateType: p.def.serviceType,
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
 * Every row of a profile template with its live tier: standing choices for
 * the profile (and, for a song slot, the bare service type) first, then
 * history. Shared by get_service_profile and draft_service.
 */
export async function loadProfileTiers(
    org: OrgId,
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    serviceType: string,
    rabbiSlot: string | null,
): Promise<LoadedProfile> {
    const data = doc.data()
    const profile = data.profile as TemplateProfile
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    const tracks = Array.isArray(data.tracks) ? (data.tracks as Record<string, unknown>[]) : []

    const { index, truncated } = await loadSlotUses(org, { serviceType, rabbiSlot })
    const slotKeys = tracks.map((t) =>
        isSongType(t.type)
            ? (str(t.slotKey) ??
              slotKeyFor(
                  { momentId: str(t.momentId), title: typeof t.title === "string" ? t.title : "", fileId: str(t.fileId) },
                  index.partGroupOf,
              ))
            : null,
    )
    // Only the profile's own scope: a choice for another rabbi's profile never shows here.
    const standing = await readStanding(
        org,
        [profileKey],
        slotKeys.filter((k): k is string => !!k),
    )

    const rows: LoadedProfileRow[] = tracks.map((t, i) => {
        const slotKey = slotKeys[i]
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
            const choice = standing.get(standingMapKey(profileKey, slotKey)) ?? null
            row.tier = computeSlotTier({
                standing: choice,
                profileUses: index.profileUses(slotKey),
                otherUses: index.otherUses(slotKey),
            })
            if (choice) row.standing = choice
        }
        return row
    })
    return {
        templateId: doc.id,
        profileKey,
        profile,
        serviceNotes: typeof data.serviceNotes === "string" ? data.serviceNotes : null,
        rows,
        truncated,
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
                "Profiles are seeded by an admin with seed_service_profiles.",
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
