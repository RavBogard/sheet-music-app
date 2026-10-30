import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { rowOrg } from "@/lib/mcp/org-context"
import type { OrgId } from "@/lib/org/types"
import type { StandingChoice as TierStandingChoice } from "./tiers"

/**
 * Setlist memory, release 2 — standing choices: "keep it in Dm" remembered
 * for a slot of a profile. One doc per (org, scope, slotKey) in the
 * tenant-scoped `standing_choices` collection; the org is in the doc id and
 * in `orgId`, and every read re-checks `rowOrg`.
 *
 * `scope` is a profile key (`friday_night:randy`), or a bare service type for
 * per-song memory (BrosLaz uses its service type, e.g. `gig`).
 *
 * Each write keeps the doc it replaced in `previous` (one step deep), so a
 * clear restores it. Server-only: clients never write (firestore.rules).
 */

export const STANDING_COLLECTION = "standing_choices"

/** A change by someone else younger than this is reported as `overrode`. */
export const OVERRIDE_WINDOW_DAYS = 28

/** The stored doc. Assignable to the tiers' `StandingChoice`. */
export interface StandingChoice extends TierStandingChoice {
    orgId: OrgId
    scope: string
    slotKey: string
    fileId: string
    chartName: string
    key: string | null
    /** The chart's partGroup when known, so tiers compare instrument copies as one chart. */
    partGroup: string | null
    leadMusician: string | null
    by: string
    byName: string
    at: string
    quote: string | null
    previous: Omit<StandingChoice, "previous"> | null
}

export type StandingInput = Pick<
    StandingChoice,
    "scope" | "slotKey" | "fileId" | "chartName" | "key" | "partGroup" | "leadMusician" | "byName" | "quote"
>

export interface Overrode {
    byName: string
    at: string
    fileId: string
    chartName: string
    key: string | null
}

export function standingDocId(org: OrgId, scope: string, slotKey: string): string {
    return `${org}__${encodeURIComponent(scope)}__${encodeURIComponent(slotKey)}`
}

export function standingMapKey(scope: string, slotKey: string): string {
    return `${scope}|${slotKey}`
}

function str(v: unknown): string | null {
    return typeof v === "string" && v ? v : null
}

function withoutPrevious(raw: Record<string, unknown>): Omit<StandingChoice, "previous"> | null {
    const fileId = str(raw.fileId)
    const scope = str(raw.scope)
    const slotKey = str(raw.slotKey)
    if (!fileId || !scope || !slotKey) return null
    return {
        orgId: rowOrg(raw.orgId),
        scope,
        slotKey,
        fileId,
        chartName: str(raw.chartName) ?? fileId,
        key: str(raw.key),
        partGroup: str(raw.partGroup),
        leadMusician: str(raw.leadMusician),
        by: str(raw.by) ?? "",
        byName: str(raw.byName) ?? "",
        at: str(raw.at) ?? "",
        quote: str(raw.quote),
    }
}

/** Parse a stored doc; null when it is malformed. */
export function parseStanding(raw: Record<string, unknown> | undefined): StandingChoice | null {
    if (!raw) return null
    const base = withoutPrevious(raw)
    if (!base) return null
    const prev =
        raw.previous && typeof raw.previous === "object"
            ? withoutPrevious(raw.previous as Record<string, unknown>)
            : null
    return { ...base, previous: prev }
}

/** True when `prev` was set by someone other than `uid` within the override window. */
export function overrodeOf(
    prev: Omit<StandingChoice, "previous"> | null,
    uid: string,
    now: Date = new Date(),
): Overrode | undefined {
    if (!prev || prev.by === uid) return undefined
    const t = Date.parse(prev.at)
    if (Number.isNaN(t)) return undefined
    if (now.getTime() - t >= OVERRIDE_WINDOW_DAYS * 24 * 60 * 60 * 1000) return undefined
    return { byName: prev.byName, at: prev.at, fileId: prev.fileId, chartName: prev.chartName, key: prev.key }
}

/**
 * Standing choices for every (scope, slotKey) pair asked for, keyed
 * `${scope}|${slotKey}`. Only this org's docs are returned.
 */
export async function readStanding(
    org: OrgId,
    scopes: string[],
    slotKeys: string[],
): Promise<Map<string, StandingChoice>> {
    const out = new Map<string, StandingChoice>()
    const uScopes = [...new Set(scopes.filter(Boolean))]
    const uSlots = [...new Set(slotKeys.filter(Boolean))]
    if (uScopes.length === 0 || uSlots.length === 0) return out
    initAdmin()
    const db = getFirestore()
    const col = db.collection(STANDING_COLLECTION)
    const refs = uScopes.flatMap((scope) => uSlots.map((slot) => col.doc(standingDocId(org, scope, slot))))
    for (let i = 0; i < refs.length; i += 100) {
        const snaps = await db.getAll(...refs.slice(i, i + 100))
        for (const s of snaps) {
            if (!s.exists) continue
            const raw = s.data() as Record<string, unknown>
            if (rowOrg(raw.orgId) !== org) continue
            const choice = parseStanding(raw)
            if (choice) out.set(standingMapKey(choice.scope, choice.slotKey), choice)
        }
    }
    return out
}

/**
 * Set a standing choice. In one transaction: the doc it replaces becomes
 * `previous`. `overrode` is set when that doc was another person's, younger
 * than 28 days.
 */
export async function writeStanding(
    org: OrgId,
    uid: string,
    input: StandingInput,
): Promise<{ choice: StandingChoice; overrode?: Overrode }> {
    initAdmin()
    const db = getFirestore()
    const ref = db.collection(STANDING_COLLECTION).doc(standingDocId(org, input.scope, input.slotKey))
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const old = snap.exists ? parseStanding(snap.data() as Record<string, unknown>) : null
        const prev = old && rowOrg(old.orgId) === org ? withoutPreviousOf(old) : null
        const choice: StandingChoice = {
            orgId: org,
            scope: input.scope,
            slotKey: input.slotKey,
            fileId: input.fileId,
            chartName: input.chartName,
            key: input.key ?? null,
            partGroup: input.partGroup ?? null,
            leadMusician: input.leadMusician ?? null,
            by: uid,
            byName: input.byName,
            at: new Date().toISOString(),
            quote: input.quote ?? null,
            previous: prev,
        }
        tx.set(ref, choice)
        const overrode = overrodeOf(prev, uid)
        return overrode ? { choice, overrode } : { choice }
    })
}

function withoutPreviousOf(c: StandingChoice): Omit<StandingChoice, "previous"> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { previous, ...rest } = c
    return rest
}

/**
 * Undo a standing choice: restore `previous`, or delete the doc when there is
 * none. Returns what was cleared and what is standing now (null for nothing).
 */
export async function clearStanding(
    org: OrgId,
    _uid: string,
    scope: string,
    slotKey: string,
): Promise<{ cleared: StandingChoice | null; restored: Omit<StandingChoice, "previous"> | null }> {
    initAdmin()
    const db = getFirestore()
    const ref = db.collection(STANDING_COLLECTION).doc(standingDocId(org, scope, slotKey))
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const old = snap.exists ? parseStanding(snap.data() as Record<string, unknown>) : null
        if (!old || rowOrg(old.orgId) !== org) return { cleared: null, restored: null }
        if (old.previous) {
            tx.set(ref, { ...old.previous, orgId: org, previous: null })
            return { cleared: old, restored: old.previous }
        }
        tx.delete(ref)
        return { cleared: old, restored: null }
    })
}
