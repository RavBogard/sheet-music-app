import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { loadEditableSetlist } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { classifyService } from "@/lib/history/classify"
import { loadLibraryLite } from "@/lib/history/load"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import {
    CRC_CORE_PROFILES,
    memoryServiceType,
    profileKeyFor,
    rabbiRequired,
    serviceLabelFor,
    slotKeyFor,
} from "@/lib/profiles/keys"
import {
    clearStanding,
    writeStanding,
    type Overrode,
    type StandingChoice,
} from "@/lib/profiles/standing"

/**
 * Setlist memory, release 2 — `set_standing_choice` / `clear_standing_choice`.
 *
 * "Keep it in Dm": the author points at a row of a setlist and the server
 * remembers that row's chart, key and lead as the standard for that slot of
 * the setlist's profile. A `song:` slot is also remembered per song at the
 * bare service type. Admin or band_leader only. Tenant-scoped: the setlist
 * load walls other orgs' setlists, and every doc id carries the org.
 */

type DB = FirebaseFirestore.Firestore

export { BARE_GIG_SCOPE } from "@/lib/profiles/keys"

export interface SetStandingArgs {
    setlistId: string
    trackId: string
    quote?: string
}

export interface ClearStandingArgs {
    setlistId: string
    trackId: string
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

/** `Mon D` in America/Chicago, e.g. `Oct 3`. */
export function monthDay(iso: string): string {
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return iso
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/Chicago",
    }).format(new Date(t))
}

/** The profile's label: the CRC core profile's, else the service type's catalog label. */
export function profileLabelFor(profileKey: string, serviceType: string): string {
    return (
        CRC_CORE_PROFILES.find((p) => p.key === profileKey)?.label ??
        serviceLabelFor(serviceType) ??
        serviceType
    )
}

function inKey(key: string | null | undefined): string {
    return key ? ` in ${key}` : ""
}

export function setAnnouncement(
    chartName: string,
    key: string | null,
    profileLabel: string,
    overrode?: Overrode,
): string {
    let out = `${chartName}${inKey(key)} is now standard for ${profileLabel}.`
    if (overrode) {
        out += ` (${overrode.byName} set ${overrode.chartName}${inKey(overrode.key)} on ${monthDay(overrode.at)}.)`
    }
    return out
}

export function clearAnnouncement(restored: { chartName: string; key: string | null } | null): string {
    return `Undone: back to ${restored ? `${restored.chartName}${inKey(restored.key)}` : "no standard"}.`
}

async function displayNameFor(db: DB, uid: string): Promise<string> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const d = snap.exists ? snap.data() : null
        const name = d?.displayName ?? d?.name ?? d?.email
        return typeof name === "string" && name.trim() ? name : "MCP User"
    } catch {
        return "MCP User"
    }
}

interface RowContext {
    db: DB
    profileKey: string
    serviceType: string
    profileLabel: string
    slotKey: string
    track: Record<string, unknown>
    fileId: string | null
    chartName: string | null
    partGroup: string | null
}

/** Load the setlist (editor + tenant wall), its row and its class. */
async function loadRow(
    uid: string,
    args: { setlistId?: string; trackId?: string },
    org: OrgId,
): Promise<RowContext | RichErrorEnvelope> {
    const setlistId = str(args?.setlistId)
    const trackId = str(args?.trackId)
    if (!setlistId || !trackId) {
        return richError(
            "invalid_argument",
            "Pass `setlistId` and `trackId`.",
            { fields: ["setlistId", "trackId"] },
            "Get both from get_setlist.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const loaded = await loadEditableSetlist(db, setlistId, uid, org)
    if (!loaded.ok) return loaded as RichErrorEnvelope
    const setlist = loaded.data

    const snap = await db.collection("tracks").doc(trackId).get()
    const track = snap.exists ? (snap.data() as Record<string, unknown>) : null
    if (
        !track ||
        track.setlistId !== setlistId ||
        (typeof track.orgId === "string" && track.orgId && rowOrg(track.orgId) !== org)
    ) {
        return richError(
            "track_not_found",
            `Track '${trackId}' is not on setlist '${setlistId}'.`,
            { setlistId, trackId },
            "Get the track ids from get_setlist.",
        )
    }

    const cls = classifyService({
        name: typeof setlist.name === "string" ? setlist.name : "",
        templateType: str(setlist.templateType),
        rabbi: str(setlist.rabbi),
        serviceType: str(setlist.serviceType),
        rabbiSlot: str(setlist.rabbiSlot),
        special: typeof setlist.special === "boolean" ? setlist.special : null,
    })
    const serviceType = memoryServiceType(org, cls.serviceType, str(setlist.serviceType))
    if (!serviceType) {
        return richError(
            "service_type_unknown",
            "This setlist has no service type, so there is no profile to remember the choice in.",
            { setlistId },
            "Set the setlist's serviceType with update_setlist, then try again.",
        )
    }
    if (rabbiRequired(serviceType) && !cls.rabbiSlot) {
        return richError(
            "rabbi_required",
            "This service's music depends on the rabbi, and the setlist does not say which rabbi leads it.",
            { setlistId, serviceType },
            "Set the setlist's rabbiSlot ('daniel_karen' or 'randy') with update_setlist, then try again.",
        )
    }

    const fileId = str(track.fileId)
    const library = fileId ? await loadLibraryLite(org, [fileId]) : new Map()
    const lib = fileId ? library.get(fileId) : undefined
    const partGroup = lib?.partGroup ?? null
    const slotKey = slotKeyFor(
        {
            momentId: str(track.momentId),
            title: typeof track.title === "string" ? track.title : "",
            fileId,
        },
        (fid) => library.get(fid)?.partGroup ?? null,
    )
    // The rabbi splits a profile only where the rabbi changes the music
    // (friday_night, shabbat_morning); elsewhere one profile serves every rabbi.
    const profileKey = profileKeyFor(serviceType, rabbiRequired(serviceType) ? cls.rabbiSlot : null)
    return {
        db,
        profileKey,
        serviceType,
        profileLabel: profileLabelFor(profileKey, serviceType),
        slotKey,
        track,
        fileId,
        chartName: lib?.name ?? str(track.fileName) ?? str(track.title),
        partGroup,
    }
}

/*
 * A choice is remembered in ONE scope: the row's profile. Where the rabbi is
 * part of the profile key (friday_night, shabbat_morning), a choice for one
 * rabbi's service never shapes the other's; elsewhere the profile key is the
 * bare service type already. One doc per choice, so undo and `overrode`
 * describe exactly that doc.
 */

export async function setStandingChoiceTool(
    uid: string,
    args: SetStandingArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | { ok: true; announcement: string; scope: string; slotKey: string; choice: StandingChoice; overrode?: Overrode }
    | RichErrorEnvelope
> {
    try {
        const ctx = await loadRow(uid, args, org)
        if ("error" in ctx) return ctx
        if (!ctx.fileId) {
            return richError(
                "no_chart",
                "This row has no chart, so there is nothing to keep.",
                { setlistId: args.setlistId, trackId: args.trackId },
                "Bind a chart to the row (swap_chart or update_track) first.",
            )
        }
        const byName = await displayNameFor(ctx.db, uid)
        const quote = str(args.quote)
        const input = {
            fileId: ctx.fileId,
            chartName: ctx.chartName ?? ctx.fileId,
            key: str(ctx.track.key),
            partGroup: ctx.partGroup,
            leadMusician: str(ctx.track.leadMusician),
            byName,
            quote,
        }
        const { choice, overrode } = await writeStanding(org, uid, {
            ...input,
            scope: ctx.profileKey,
            slotKey: ctx.slotKey,
        })
        const out = {
            ok: true as const,
            announcement: setAnnouncement(choice.chartName, choice.key, ctx.profileLabel, overrode),
            scope: ctx.profileKey,
            slotKey: ctx.slotKey,
            choice,
        }
        return overrode ? { ...out, overrode } : out
    } catch (error) {
        logger.warn("set_standing_choice failed:", error)
        return richError(
            "internal_error",
            "Could not save the standing choice.",
            { errorCode: 500 },
            "Retry; nothing was changed if the call failed.",
        )
    }
}

export async function clearStandingChoiceTool(
    uid: string,
    args: ClearStandingArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | { ok: true; announcement: string; scope: string; slotKey: string; restored: Omit<StandingChoice, "previous"> | null }
    | RichErrorEnvelope
> {
    try {
        const ctx = await loadRow(uid, args, org)
        if ("error" in ctx) return ctx
        const primary = await clearStanding(org, uid, ctx.profileKey, ctx.slotKey)
        if (!primary.cleared) {
            return richError(
                "standing_not_found",
                `Nothing is standard for this slot of ${ctx.profileLabel}.`,
                { setlistId: args.setlistId, trackId: args.trackId, scope: ctx.profileKey, slotKey: ctx.slotKey },
                "There is nothing to undo.",
            )
        }
        return {
            ok: true,
            announcement: clearAnnouncement(primary.restored),
            scope: ctx.profileKey,
            slotKey: ctx.slotKey,
            restored: primary.restored,
        }
    } catch (error) {
        logger.warn("clear_standing_choice failed:", error)
        return richError(
            "internal_error",
            "Could not undo the standing choice.",
            { errorCode: 500 },
            "Retry; nothing was changed if the call failed.",
        )
    }
}
