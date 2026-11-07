import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor, loadEditableSetlist } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { classifyService } from "@/lib/history/classify"
import { loadLibraryLite } from "@/lib/history/load"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { getMoment } from "@/lib/books/moments"
import { catalogServiceType } from "@/lib/history/classify"
import {
    CRC_CORE_PROFILES,
    memoryServiceType,
    profileKeyFor,
    rabbiRequired,
    serviceLabelFor,
} from "@/lib/profiles/keys"
import { momentForTitle } from "@/lib/profiles/moment-key"
import { loadSlotUses, type SlotUseIndex } from "@/lib/profiles/slot-uses"
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
 * the setlist's profile. Or, with no row (Daniel 2026-11-07), the author names
 * the profile, the slot (a moment, or a song) and a library chart and key.
 * Either way the slot is keyed as history keys it — moment first, then chart —
 * so a standard always fills the learned slot it was meant for. Admin or
 * band_leader only. Tenant-scoped: the setlist
 * load walls other orgs' setlists, and every doc id carries the org.
 */

type DB = FirebaseFirestore.Firestore

export { BARE_GIG_SCOPE } from "@/lib/profiles/keys"

export interface SetStandingArgs {
    /** Row path: a row of a setlist. */
    setlistId?: string
    trackId?: string
    /** Library path: the profile… */
    serviceType?: string
    rabbiSlot?: string | null
    /** …the slot: a moment id or name ("mah-tovu", "Bar'chu"), a slotKey from get_service_profile, or a song title… */
    slot?: string
    /** …and the chart and its key. */
    fileId?: string
    key?: string | null
    leadMusician?: string | null
    quote?: string
}

export interface ClearStandingArgs {
    setlistId?: string
    trackId?: string
    serviceType?: string
    rabbiSlot?: string | null
    slot?: string
    fileId?: string
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
    /** Older keys an earlier choice for this slot may be stored under. */
    aliasKeys: string[]
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
    const rabbiSlot = rabbiRequired(serviceType) ? cls.rabbiSlot : null
    // The slot is keyed exactly as the profile's history keys it (moment, then chart), so the
    // standard fills the learned row it was meant for.
    const { index, library } = await loadSlotUses(org, { serviceType, rabbiSlot })
    const lib = fileId ? (library.get(fileId) ?? (await loadLibraryLite(org, [fileId])).get(fileId)) : undefined
    // A chart no dated setlist has played yet still resolves to its partGroup.
    if (fileId && lib && !library.has(fileId)) library.set(fileId, lib)
    const partGroup = lib?.partGroup ?? null
    const row = { momentId: str(track.momentId), title: typeof track.title === "string" ? track.title : "", fileId }
    const slotKey = index.slotKeyOf(row)
    const aliasKeys = index.aliasesOf(row, slotKey)
    // The rabbi splits a profile only where the rabbi changes the music
    // (friday_night, shabbat_morning); elsewhere one profile serves every rabbi.
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    return {
        db,
        profileKey,
        serviceType,
        profileLabel: profileLabelFor(profileKey, serviceType),
        slotKey,
        aliasKeys,
        track,
        fileId,
        chartName: lib?.name ?? str(track.fileName) ?? str(track.title),
        partGroup,
    }
}

/** The slot a standard set from the library fills, resolved as history resolves it. */
export function librarySlotKey(
    org: OrgId,
    index: SlotUseIndex,
    slot: string | null,
    fileId: string | null,
    chartName: string | null,
): string | null {
    if (slot && /^(moment|song):./.test(slot)) return slot
    if (slot && org === DEFAULT_ORG_ID) {
        if (getMoment(slot)) return `moment:${slot}`
        const m = momentForTitle(slot, "song")
        if (m) return `moment:${m}`
    }
    const title = slot ?? chartName ?? ""
    if (!fileId && !title) return null
    return index.slotKeyOf({ momentId: null, title, fileId })
}

interface LibraryContext {
    db: DB
    profileKey: string
    serviceType: string
    rabbiSlot: string | null
    profileLabel: string
    slotKey: string
    fileId: string | null
    chartName: string | null
    partGroup: string | null
    index: SlotUseIndex
    setlists: Awaited<ReturnType<typeof loadSlotUses>>["setlists"]
    library: Awaited<ReturnType<typeof loadSlotUses>>["library"]
}

/** The profile, slot and chart named without a setlist row (Daniel 2026-11-07). */
async function loadLibrarySlot(
    uid: string,
    args: { serviceType?: string; rabbiSlot?: string | null; slot?: string; fileId?: string },
    org: OrgId,
    needChart: boolean,
): Promise<LibraryContext | RichErrorEnvelope> {
    const asked = str(args?.serviceType)
    if (!asked) {
        return richError(
            "invalid_argument",
            "Pass a row (`setlistId` and `trackId`), or a profile and a chart (`serviceType`, `fileId`, and `slot` when the chart is not enough to name it).",
            { fields: ["setlistId", "trackId", "serviceType", "fileId", "slot"] },
            "e.g. { serviceType: 'bnei_mitzvah_saturday', slot: 'Ahava Raba', fileId: '…', key: 'Dm' }.",
        )
    }
    const serviceType = org === DEFAULT_ORG_ID ? catalogServiceType(asked) : asked
    if (!serviceType) {
        return richError("invalid_argument", `Unknown service type '${asked}'.`, { serviceType: asked }, "e.g. 'shabbat_morning', 'bnei_mitzvah_saturday'.")
    }
    const askedRabbi = str(args?.rabbiSlot)
    if (rabbiRequired(serviceType) && !askedRabbi) {
        return richError(
            "rabbi_required",
            "This service's music depends on the rabbi; say which rabbi's profile the standard is for.",
            { serviceType },
            "Pass rabbiSlot: 'daniel_karen' or 'randy'. Ask; never infer it.",
        )
    }
    const rabbiSlot = rabbiRequired(serviceType) ? askedRabbi : null
    const fileId = str(args?.fileId)
    const slot = str(args?.slot)
    if (needChart && !fileId) {
        return richError("invalid_argument", "Pass the chart's `fileId`.", { fields: ["fileId"] }, "Find it with search_library.")
    }
    if (!fileId && !slot) {
        return richError("invalid_argument", "Pass `slot` or `fileId`.", { fields: ["slot", "fileId"] }, "get_service_profile lists each row's slotKey.")
    }
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid, org)
    if (!editor.ok) return editor
    const loaded = await loadSlotUses(org, { serviceType, rabbiSlot })
    const lib = fileId ? (loaded.library.get(fileId) ?? (await loadLibraryLite(org, [fileId])).get(fileId)) : undefined
    if (fileId && lib && !loaded.library.has(fileId)) loaded.library.set(fileId, lib)
    if (fileId && !lib) {
        return richError("chart_not_found", `No chart '${fileId}' in this library.`, { fileId }, "Find the fileId with search_library.")
    }
    const slotKey = librarySlotKey(org, loaded.index, slot, fileId, lib?.name ?? null)
    if (!slotKey) {
        return richError("invalid_argument", "Name the slot or the chart.", { fields: ["slot", "fileId"] }, "get_service_profile lists each row's slotKey.")
    }
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    return {
        db,
        profileKey,
        serviceType,
        rabbiSlot,
        profileLabel: profileLabelFor(profileKey, serviceType),
        slotKey,
        fileId,
        chartName: lib?.name ?? null,
        partGroup: lib?.partGroup ?? null,
        index: loaded.index,
        setlists: loaded.setlists,
        library: loaded.library,
    }
}

/** The row of the profile's current order (learned rows and pins) that a slot fills, if any. */
async function rowFilling(org: OrgId, ctx: LibraryContext): Promise<{ index: number; title: string } | null> {
    const { findProfileTemplateFor, profileOrderNow, profileRowSlot } = await import("./service-profiles")
    const doc = await findProfileTemplateFor(org, ctx.profileKey)
    const order = profileOrderNow(org, ctx.serviceType, ctx.rabbiSlot, doc, { setlists: ctx.setlists, library: ctx.library })
    const i = order.tracks.findIndex((t) => profileRowSlot(t, order.index)?.slotKey === ctx.slotKey)
    if (i < 0) return null
    const t = order.tracks[i]
    return { index: i, title: typeof t.title === "string" ? t.title : "" }
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
        if (!str(args?.setlistId) && !str(args?.trackId)) return await setFromLibrary(uid, args, org)
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
        if (!str(args?.setlistId) && !str(args?.trackId)) return await clearFromLibrary(uid, args, org)
        const ctx = await loadRow(uid, args, org)
        if ("error" in ctx) return ctx
        let primary = await clearStanding(org, uid, ctx.profileKey, ctx.slotKey)
        // A choice made before slots were keyed this way is stored under an older key.
        for (const alias of ctx.aliasKeys) {
            if (primary.cleared) break
            primary = await clearStanding(org, uid, ctx.profileKey, alias)
        }
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

async function setFromLibrary(
    uid: string,
    args: SetStandingArgs,
    org: OrgId,
): Promise<
    | {
          ok: true
          announcement: string
          scope: string
          slotKey: string
          choice: StandingChoice
          overrode?: Overrode
          /** The row of the current order this standard fills; null when none does yet. */
          fills: { index: number; title: string } | null
          note?: string
      }
    | RichErrorEnvelope
> {
    const ctx = await loadLibrarySlot(uid, args, org, true)
    if ("error" in ctx) return ctx
    const byName = await displayNameFor(ctx.db, uid)
    const { choice, overrode } = await writeStanding(org, uid, {
        scope: ctx.profileKey,
        slotKey: ctx.slotKey,
        fileId: ctx.fileId!,
        chartName: ctx.chartName ?? ctx.fileId!,
        key: str(args.key),
        partGroup: ctx.partGroup,
        leadMusician: str(args.leadMusician),
        byName,
        quote: str(args.quote),
    })
    const fills = await rowFilling(org, ctx)
    const out = {
        ok: true as const,
        announcement: setAnnouncement(choice.chartName, choice.key, ctx.profileLabel, overrode),
        scope: ctx.profileKey,
        slotKey: ctx.slotKey,
        choice,
        fills,
        ...(fills
            ? {}
            : { note: `No row of the ${ctx.profileLabel} order fills this slot yet. Pin it with pin_profile_row to keep it in the order.` }),
    }
    return overrode ? { ...out, overrode } : out
}

async function clearFromLibrary(
    uid: string,
    args: ClearStandingArgs,
    org: OrgId,
): Promise<
    | { ok: true; announcement: string; scope: string; slotKey: string; restored: Omit<StandingChoice, "previous"> | null }
    | RichErrorEnvelope
> {
    const ctx = await loadLibrarySlot(uid, args, org, false)
    if ("error" in ctx) return ctx
    const primary = await clearStanding(org, uid, ctx.profileKey, ctx.slotKey)
    if (!primary.cleared) {
        return richError(
            "standing_not_found",
            `Nothing is standard for this slot of ${ctx.profileLabel}.`,
            { scope: ctx.profileKey, slotKey: ctx.slotKey },
            "There is nothing to undo. get_service_profile shows each row's slotKey and tier.",
        )
    }
    return {
        ok: true,
        announcement: clearAnnouncement(primary.restored),
        scope: ctx.profileKey,
        slotKey: ctx.slotKey,
        restored: primary.restored,
    }
}
