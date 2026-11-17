import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { getTenantMembership, listTenantMembers } from "@/lib/org/access"
import {
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant P2: roster-list reads come from the tenant's memberships
 * (`listTenantMembers(org, {roles})`) and show the MEMBERSHIP role — no more
 * `users where role in [...]` + in-memory `orgIds` wall (v11-05-02).
 */

/**
 * Roster MCP tools: list_musicians, find_user and get_musician_profile.
 * All three are read-only and gated to trusted leaders (admin OR
 * band_leader) via `assertEditor`, returning the rich `forbidden_role`
 * envelope on refusal.
 */

type DB = FirebaseFirestore.Firestore

// ────────────────────────────────────────────────────────────────────────────
// shared types
// ────────────────────────────────────────────────────────────────────────────

interface MusicianRow {
    uid: string
    displayName: string
    email: string
    role: string
    instrument: string | null
    instrumentLabel: string | null
    schedulingTier: "core" | "regular" | "guest"
    phone: string | null
    notificationPreferences: {
        email: boolean
        sms: boolean
        push: boolean
    }
}

function buildMusicianRow(
    uid: string,
    data: FirebaseFirestore.DocumentData,
    opts?: { allowProfileless?: boolean },
): MusicianRow | null {
    const profile = data.musicianProfile as
        | Record<string, unknown>
        | undefined
    const instrument =
        profile && typeof profile.instrument === "string"
            ? (profile.instrument as string)
            : null
    // v11.7-02: instrument-less users are dropped UNLESS the caller opts in
    // (find_user / list_musicians includeProfileless). suggest_* + the default
    // list_musicians path pass no flag → behavior unchanged (David-is-invisible
    // bug is confined to that default; the directory tools surface him).
    if (!instrument && !opts?.allowProfileless) return null

    const presetLabel = instrument
        ? (INSTRUMENT_PRESETS[instrument]?.label ?? null)
        : null
    const rawTier =
        profile && typeof profile.schedulingTier === "string"
            ? (profile.schedulingTier as string)
            : "regular"
    const schedulingTier =
        rawTier === "core" || rawTier === "regular" || rawTier === "guest"
            ? (rawTier as "core" | "regular" | "guest")
            : "regular"

    const prefs =
        (profile?.notificationPreferences as
            | Record<string, unknown>
            | undefined) ?? {}
    const notificationPreferences = {
        email: prefs.email !== false, // default true
        sms: prefs.sms === true, // default false
        push: prefs.push !== false, // default true
    }

    return {
        uid,
        displayName:
            typeof data.displayName === "string" && data.displayName
                ? (data.displayName as string)
                : typeof data.email === "string"
                  ? (data.email as string).split("@")[0]
                  : uid,
        email: typeof data.email === "string" ? (data.email as string) : "",
        role: typeof data.role === "string" ? (data.role as string) : "musician",
        instrument,
        instrumentLabel: presetLabel,
        schedulingTier,
        phone:
            profile && typeof profile.phone === "string"
                ? (profile.phone as string)
                : null,
        notificationPreferences,
    }
}

/**
 * Multi-tenant P2: the roster of tenant `org` — its members holding a roster
 * role, each as `{uid, data}` where `data` is the users/{uid} profile with
 * `role` replaced by the MEMBERSHIP role in this tenant (never the global
 * users.role). Replaces `users where role in [...]` + the in-memory orgIds
 * wall.
 */
const ROSTER_ROLES = ["musician", "band_leader", "admin"] as const

async function tenantRoster(
    org: OrgId,
): Promise<Array<{ uid: string; data: FirebaseFirestore.DocumentData }>> {
    const members = await listTenantMembers(org, { roles: [...ROSTER_ROLES] })
    return members.map((m) => ({
        uid: m.uid,
        data: { ...(m.profile ?? {}), role: m.role },
    }))
}

/**
 * One person's musician row in tenant `org`: null when the user doesn't exist
 * or holds no role in this tenant (cross-tenant wall — the same "not found" as
 * an absent user). The row's `role` is the tenant role.
 */
async function loadUserMusicianRow(
    db: DB,
    uid: string,
    org: OrgId,
): Promise<MusicianRow | null> {
    const [snap, membership] = await Promise.all([
        db.collection("users").doc(uid).get(),
        getTenantMembership(uid, org, { db }),
    ])
    if (!snap.exists) return null
    if (!membership || membership.role === "denied") return null
    return buildMusicianRow(uid, { ...(snap.data() ?? {}), role: membership.role })
}

// ────────────────────────────────────────────────────────────────────────────
// list_musicians
// ────────────────────────────────────────────────────────────────────────────

export interface ListMusiciansArgs {
    instrument?: string
    schedulingTier?: "core" | "regular" | "guest"
    /**
     * v11.7-02 interim: include users with no `musicianProfile.instrument`
     * (e.g. band leaders who never filled a profile). Default false preserves
     * the historical "configured instrument only" roster. For a full directory
     * search prefer `find_user`.
     */
    includeProfileless?: boolean
}

export interface ListMusiciansResult {
    ok: true
    musicians: MusicianRow[]
    count: number
}

export async function listMusicians(
    uid: string,
    args: ListMusiciansArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ListMusiciansResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, uid, org)
    if (!gate.ok) return gate

    try {
        // Multi-tenant P2: tenant members with their tenant role.
        const roster = await tenantRoster(org)

        const filterInstrument = args.instrument?.trim().toLowerCase()
        const filterTier = args.schedulingTier

        const rows: MusicianRow[] = []
        for (const d of roster) {
            const row = buildMusicianRow(d.uid, d.data, {
                allowProfileless: args.includeProfileless === true,
            })
            if (!row) continue
            if (filterTier && row.schedulingTier !== filterTier) continue
            if (filterInstrument) {
                const key = row.instrument?.toLowerCase() ?? ""
                const label = row.instrumentLabel?.toLowerCase() ?? ""
                if (
                    key !== filterInstrument &&
                    !key.includes(filterInstrument) &&
                    !filterInstrument.includes(key) &&
                    !label.includes(filterInstrument)
                ) {
                    continue
                }
            }
            rows.push(row)
        }

        rows.sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, {
                sensitivity: "base",
            }),
        )

        return { ok: true, musicians: rows, count: rows.length }
    } catch (err) {
        return richError(
            "list_musicians_failed",
            `Failed to enumerate musicians: ${
                err instanceof Error ? err.message : String(err)
            }`,
            {},
            "Check Firestore connectivity; the users collection is the source.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// find_user (v11.7-02 — the Asymmetry-Principle directory resolver)
// ────────────────────────────────────────────────────────────────────────────

export interface FindUserArgs {
    /** Exact email match (case-insensitive, in-memory at current scale). */
    email?: string
    /** Case-insensitive substring of displayName. */
    nameContains?: string
    /** Narrow to one role. */
    role?: "musician" | "band_leader" | "admin"
    /**
     * Include users with no `musicianProfile.instrument`. DEFAULTS TO TRUE —
     * find_user is a directory: surfacing instrument-less people (band leaders
     * like David) is the whole point. Pass false to narrow to instrument-bearing
     * musicians only.
     */
    includeProfileless?: boolean
}

export interface FindUserResult {
    ok: true
    users: MusicianRow[]
    count: number
}

/**
 * v11.7-02: resolve a person's uid (and profile row) by email / name / role —
 * the read partner to the act-by-uid tools (assign_monitor_bus,
 * get_musician_profile). Unlike list_musicians it does NOT drop instrument-less
 * users by default, so band leaders without a musicianProfile are discoverable.
 *
 * Tenant-scoped exactly like list_musicians (the tenant's members only — no
 * cross-tenant leakage), editor-gated via assertEditor. All filters run
 * in-memory over the tenant roster (viable at current roster scale).
 */
export async function findUser(
    uid: string,
    args: FindUserArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<FindUserResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, uid, org)
    if (!gate.ok) return gate

    const emailArg = args.email?.trim().toLowerCase()
    const nameArg = args.nameContains?.trim().toLowerCase()
    // find_user includes profileless users unless explicitly told not to.
    const allowProfileless = args.includeProfileless !== false

    try {
        // Multi-tenant P2: tenant members with their tenant role (no leakage).
        const roster = await tenantRoster(org)

        const rows: MusicianRow[] = []
        for (const d of roster) {
            const row = buildMusicianRow(d.uid, d.data, { allowProfileless })
            if (!row) continue
            if (args.role && row.role !== args.role) continue
            if (emailArg && row.email.toLowerCase() !== emailArg) continue
            if (nameArg && !row.displayName.toLowerCase().includes(nameArg)) {
                continue
            }
            rows.push(row)
        }

        rows.sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, {
                sensitivity: "base",
            }),
        )

        return { ok: true, users: rows, count: rows.length }
    } catch (err) {
        return richError(
            "find_user_failed",
            `Failed to search users: ${
                err instanceof Error ? err.message : String(err)
            }`,
            {},
            "Check Firestore connectivity; the users collection is the source.",
        )
    }
}

// ────────────────────────────────────────────────────────────────────────────
// get_musician_profile
// ────────────────────────────────────────────────────────────────────────────

export interface GetMusicianProfileArgs {
    uid: string
}

export interface GetMusicianProfileResult {
    ok: true
    musician: MusicianRow
}

export async function getMusicianProfile(
    callerUid: string,
    args: GetMusicianProfileArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<GetMusicianProfileResult | RichErrorEnvelope> {
    if (!args?.uid || typeof args.uid !== "string") {
        return richError(
            "invalid_argument",
            "`uid` must be a non-empty string.",
            { field: "uid" },
            "Pass a valid Firebase user uid (use list_musicians to discover one).",
        )
    }
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, callerUid, org)
    if (!gate.ok) return gate

    try {
        const row = await loadUserMusicianRow(db, args.uid, org)
        if (!row) {
            return richError(
                "not_found",
                `User '${args.uid}' has no musician profile (instrument not set, or user does not exist).`,
                { uid: args.uid },
                "Verify the uid via list_musicians, or have the user complete their MusicianProfileSettings.",
            )
        }
        return { ok: true, musician: row }
    } catch (err) {
        return richError(
            "get_musician_profile_failed",
            `Failed to read musician profile: ${
                err instanceof Error ? err.message : String(err)
            }`,
            { uid: args.uid },
            "Check Firestore connectivity.",
        )
    }
}
