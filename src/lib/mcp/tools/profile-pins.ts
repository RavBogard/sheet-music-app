import "server-only"

import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { loadLibraryLite } from "@/lib/history/load"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { isSongType } from "@/lib/setlist-track-count"
import { profileKeyFor, rabbiRequired } from "@/lib/profiles/keys"
import { applyPins, labelStem, parsePins, pinMatchesRow, type ProfilePin } from "@/lib/profiles/pins"
import { loadMemoryHistory } from "@/lib/profiles/slot-uses"
import { writeStanding } from "@/lib/profiles/standing"
import { cleanLabel } from "@/lib/profiles/tiers"
import { coreProfileFor, findProfileTemplateFor, profileOrderNow, profileRowSlot } from "./service-profiles"
import { profileLabelFor, setAnnouncement } from "./standing"

/**
 * Pinned rows (Daniel 2026-11-07) — `pin_profile_row` / `unpin_profile_row`.
 *
 * A pinned row is always in its profile's running order, in its pinned
 * place, whatever history shows; history still decides every other row and
 * fills the charts. Pins are stored on the profile doc (`pins`), apart from
 * the learned rows, so no re-learn drops one. Pinning a song with a chart
 * also makes that chart the slot's standard, so the draft fills it. Admin or
 * band_leader. CRC's core profiles (and any profile doc of the tenant).
 */

const TEMPLATES = "setlistTemplates"

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

async function displayNameFor(db: FirebaseFirestore.Firestore, uid: string): Promise<string> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const d = snap.exists ? snap.data() : null
        const name = d?.displayName ?? d?.name ?? d?.email
        return typeof name === "string" && name.trim() ? name : "MCP User"
    } catch {
        return "MCP User"
    }
}

export interface PinProfileRowArgs {
    serviceType: string
    rabbiSlot?: string | null
    /** The row's title as the order should say it ("Ma Tovu", "Hakafah", "Adon Olam"). */
    title: string
    /** `song` (default), `header`, `reading`, `note`, `transition`… */
    type?: string
    /** 1 is first. */
    position?: number
    /** The label of the row it follows ("Bar'chu"). */
    after?: string
    /** A library chart; it becomes the slot's standard. */
    fileId?: string
    /** The key that chart is played in, with fileId. */
    key?: string
    quote?: string
}

export interface UnpinProfileRowArgs {
    serviceType: string
    rabbiSlot?: string | null
    /** The pin's id, from get_service_profile `pins`. */
    pinId?: string
    /** Or the pinned row's title. */
    title?: string
}

interface ProfileScope {
    serviceType: string
    rabbiSlot: string | null
    profileKey: string
    label: string
}

function scopeOf(args: { serviceType?: unknown; rabbiSlot?: unknown }): ProfileScope | RichErrorEnvelope {
    const serviceType = str(args?.serviceType)
    if (!serviceType) {
        return richError("invalid_argument", "Pass `serviceType`.", { fields: ["serviceType"] }, "e.g. 'bnei_mitzvah_saturday'.")
    }
    const askedRabbi = str(args?.rabbiSlot)
    if (rabbiRequired(serviceType) && !askedRabbi) {
        return richError(
            "rabbi_required",
            "This service's music depends on the rabbi; say which rabbi's profile to change.",
            { serviceType },
            "Pass rabbiSlot: 'daniel_karen' or 'randy'. Ask; never infer it.",
        )
    }
    const rabbiSlot = rabbiRequired(serviceType) ? askedRabbi : null
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    return { serviceType, rabbiSlot, profileKey, label: profileLabelFor(profileKey, serviceType) }
}

function placeText(pin: Pick<ProfilePin, "position" | "after">): string {
    if (pin.position) return pin.position === 1 ? "first" : `at place ${pin.position}`
    if (pin.after) return `after ${pin.after}`
    return "where the order has it, else last"
}

export async function pinProfileRowTool(
    uid: string,
    args: PinProfileRowArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | {
          ok: true
          announcement: string
          pin: ProfilePin
          replaced: boolean
          order: Array<{ index: number; type: string; title: string; pinned?: true }>
          pinNotices?: string[]
      }
    | RichErrorEnvelope
> {
    const scope = scopeOf(args)
    if ("error" in scope) return scope
    const title = str(args?.title)
    if (!title || title.length > 200) {
        return richError("invalid_argument", "Pass the row's `title` (1–200 characters).", { fields: ["title"] }, "e.g. 'Ma Tovu'.")
    }
    const type = str(args?.type) ?? "song"
    const position = args?.position
    if (position !== undefined && (!Number.isInteger(position) || position < 1)) {
        return richError("invalid_argument", "`position` is a whole number, 1 for first.", { fields: ["position"] }, "Or pass `after` instead.")
    }
    const after = str(args?.after)
    if (position !== undefined && after) {
        return richError("invalid_argument", "Pass `position` or `after`, not both.", { fields: ["position", "after"] }, "Pick one.")
    }
    const fileId = str(args?.fileId)
    const key = str(args?.key)
    if (fileId && !isSongType(type)) {
        return richError("invalid_argument", "Only a song row takes a chart.", { fields: ["fileId", "type"] }, "Leave out fileId, or use type 'song'.")
    }
    if (key && !fileId) {
        return richError("invalid_argument", "`key` goes with `fileId`.", { fields: ["key"] }, "Pass the chart's fileId too.")
    }
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor
        const doc = await findProfileTemplateFor(org, scope.profileKey)
        const def = coreProfileFor(org, scope.profileKey)
        if (!doc && !def) {
            return richError(
                "profile_not_found",
                `'${scope.profileKey}' is not a recurring service profile of this tenant.`,
                { profileKey: scope.profileKey },
                "Use one of the profile keys get_service_profile accepts.",
            )
        }
        const lib = fileId ? (await loadLibraryLite(org, [fileId])).get(fileId) : undefined
        if (fileId && !lib) {
            return richError("chart_not_found", `No chart '${fileId}' in this library.`, { fileId }, "Find the fileId with search_library.")
        }

        const memory = await loadMemoryHistory(org)
        const order = profileOrderNow(org, scope.serviceType, scope.rabbiSlot, doc, memory)
        // The slot is resolved as history and standards resolve it; a pin that is already a learned
        // row takes that row's slot, so its standard fills the very row the order has.
        let slotKey: string | null = isSongType(type)
            ? order.index.slotKeyOf({ momentId: null, title, fileId, type: "song" })
            : null
        const draftPin: ProfilePin = { id: "", title, type, slotKey, fileId, by: uid, byName: "", at: "" }
        const learnedRow = order.baseTracks.find((r) => pinMatchesRow(draftPin, r, (row) => profileRowSlot(row, order.index)?.slotKey ?? null))
        if (learnedRow && isSongType(type)) slotKey = profileRowSlot(learnedRow, order.index)?.slotKey ?? slotKey
        const momentId = slotKey?.startsWith("moment:") ? slotKey.slice("moment:".length) : null

        const byName = await displayNameFor(db, uid)
        const at = new Date().toISOString()
        const ref = doc?.ref ?? db.collection(TEMPLATES).doc(`profile__${org}__${scope.profileKey}`)
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref)
            const pins = parsePins(snap.exists ? snap.data()?.pins : [])
            // One pin per row: pinning a row again moves it.
            const prior = pins.find(
                (p) => (slotKey && p.slotKey === slotKey) || (p.type === type && labelStem(p.title) === labelStem(title)),
            )
            const pin: ProfilePin = {
                id: prior?.id ?? crypto.randomUUID(),
                title,
                type,
                slotKey,
                momentId,
                fileId,
                chartName: lib ? cleanLabel(lib.name) || lib.name : null,
                key,
                position: position ?? null,
                after,
                by: uid,
                byName,
                at,
            }
            const next = [...pins.filter((p) => p !== prior), pin]
            if (snap.exists) {
                tx.update(ref, { pins: next, updatedAt: FieldValue.serverTimestamp() })
            } else {
                // The first pin of a profile no draft has saved yet: save its learned rows with it.
                tx.create(ref, {
                    id: ref.id,
                    name: def!.label,
                    templateType: def!.serviceType,
                    kind: "profile",
                    profile: { key: def!.key, serviceType: def!.serviceType, rabbiSlot: def!.rabbiSlot, book: def!.book, label: def!.label },
                    orgId: org,
                    ownerId: uid,
                    ownerName: byName,
                    tracks: order.baseTracks,
                    learnedFrom: order.learned?.learnedFrom ?? null,
                    pins: next,
                    version: 1,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                })
            }
            return { pin, replaced: !!prior, pins: next }
        })

        let announcement = `${title} is pinned to ${scope.label}, ${placeText(result.pin)}.`
        if (fileId && slotKey && lib) {
            const { choice, overrode } = await writeStanding(org, uid, {
                scope: scope.profileKey,
                slotKey,
                fileId,
                chartName: result.pin.chartName ?? fileId,
                key,
                partGroup: lib.partGroup ?? null,
                leadMusician: null,
                byName,
                quote: str(args?.quote),
            })
            announcement += ` ${setAnnouncement(choice.chartName, choice.key, scope.label, overrode)}`
        }
        const laid = applyPins(order.baseTracks, result.pins, (row) => profileRowSlot(row, order.index)?.slotKey ?? null)
        logger.info("[mcp] pin_profile_row", { org, profileKey: scope.profileKey, pinId: result.pin.id, replaced: result.replaced })
        return {
            ok: true,
            announcement,
            pin: result.pin,
            replaced: result.replaced,
            order: laid.tracks.map((t, i) => ({
                index: i,
                type: typeof t.type === "string" ? t.type : "song",
                title: typeof t.title === "string" ? t.title : "",
                ...(t.pinned === true ? { pinned: true as const } : {}),
            })),
            ...(laid.notices.length > 0 ? { pinNotices: laid.notices } : {}),
        }
    } catch (error) {
        logger.warn("pin_profile_row failed:", error)
        return richError("internal_error", "Could not pin the row.", { errorCode: 500 }, "Retry; nothing was changed if the call failed.")
    }
}

export async function unpinProfileRowTool(
    uid: string,
    args: UnpinProfileRowArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<{ ok: true; announcement: string; removed: ProfilePin; pins: ProfilePin[] } | RichErrorEnvelope> {
    const scope = scopeOf(args)
    if ("error" in scope) return scope
    const pinId = str(args?.pinId)
    const title = str(args?.title)
    if (!pinId && !title) {
        return richError("invalid_argument", "Pass `pinId` or `title`.", { fields: ["pinId", "title"] }, "get_service_profile lists the pins.")
    }
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor
        const doc = await findProfileTemplateFor(org, scope.profileKey)
        const pins = parsePins(doc?.data().pins)
        const target = pins.find((p) => (pinId ? p.id === pinId : labelStem(p.title) === labelStem(title!)))
        if (!doc || !target) {
            return richError(
                "pin_not_found",
                `Nothing like that is pinned in ${scope.label}.`,
                { profileKey: scope.profileKey, pinId, title, pins: pins.map((p) => ({ id: p.id, title: p.title })) },
                "get_service_profile lists the pins.",
            )
        }
        const removed = await db.runTransaction(async (tx) => {
            const snap = await tx.get(doc.ref)
            const now = parsePins(snap.data()?.pins)
            const next = now.filter((p) => p.id !== target.id)
            tx.update(doc.ref, { pins: next, updatedAt: FieldValue.serverTimestamp() })
            return next
        })
        logger.info("[mcp] unpin_profile_row", { org, profileKey: scope.profileKey, pinId: target.id })
        return {
            ok: true,
            announcement: `${target.title} is no longer pinned to ${scope.label}: it stays in the order only while history keeps it. Its standard, if any, is unchanged.`,
            removed: target,
            pins: removed,
        }
    } catch (error) {
        logger.warn("unpin_profile_row failed:", error)
        return richError("internal_error", "Could not unpin the row.", { errorCode: 500 }, "Retry; nothing was changed if the call failed.")
    }
}
