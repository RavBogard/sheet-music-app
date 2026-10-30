import "server-only"

import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import type { OpenItem } from "@/lib/profiles/readback"

/**
 * Setlist memory, release 3 — open items: what a setlist still needs ("chart
 * still needed", "new arrangement; swap when it lands"). They live on the
 * setlist doc as `openItems`; resolved ones stay there with `resolvedAt`, and
 * every read shows only the unresolved ones, oldest first. Every readback
 * repeats them until they are resolved.
 *
 * Writes run in a transaction, bump the setlist `version` and stamp
 * `updatedAt`. Adding an item whose text matches an unresolved one (trimmed,
 * any case) writes nothing and returns the existing item. Admin or
 * band_leader; tenant-scoped (another tenant's setlist is setlist_not_found,
 * another tenant's item is open_item_not_found).
 */

export const OPEN_ITEM_MAX_LENGTH = 300

export interface StoredOpenItem extends OpenItem {
    resolvedAt: string | null
    resolvedByName: string | null
}

type DB = FirebaseFirestore.Firestore

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

function storedItems(data: Record<string, unknown>): StoredOpenItem[] {
    const raw = Array.isArray(data.openItems) ? data.openItems : []
    const out: StoredOpenItem[] = []
    for (const r of raw) {
        if (!r || typeof r !== "object") continue
        const o = r as Record<string, unknown>
        const id = str(o.id)
        const text = str(o.text)
        if (!id || !text) continue
        out.push({
            id,
            text,
            trackId: str(o.trackId),
            createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
            createdByName: typeof o.createdByName === "string" ? o.createdByName : "",
            resolvedAt: str(o.resolvedAt),
            resolvedByName: str(o.resolvedByName),
        })
    }
    return out
}

function publicItem(i: StoredOpenItem): OpenItem {
    return { id: i.id, text: i.text, trackId: i.trackId, createdAt: i.createdAt, createdByName: i.createdByName }
}

/** The unresolved open items of a setlist doc, oldest first. */
export function readOpenItems(data: Record<string, unknown>): OpenItem[] {
    return storedItems(data)
        .filter((i) => !i.resolvedAt)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
        .map(publicItem)
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

function setlistNotFound(setlistId: string): RichErrorEnvelope {
    return richError("setlist_not_found", `Setlist '${setlistId}' was not found.`, { setlistId }, "Verify the id via list_setlists.")
}

function itemNotFound(setlistId: string, itemId: string): RichErrorEnvelope {
    return richError(
        "open_item_not_found",
        `No open item '${itemId}' on this setlist.`,
        { setlistId, itemId },
        "It may already be resolved. get_setlist lists the open items.",
    )
}

/** Thrown inside a transaction to return an envelope without writing. */
class Refusal {
    constructor(readonly envelope: RichErrorEnvelope) {}
}

// ─── add_open_item ──────────────────────────────────────────────────────────

export interface AddOpenItemArgs {
    setlistId: string
    text: string
    trackId?: string | null
}

export interface AddOpenItemResult {
    ok: true
    setlistId: string
    item: OpenItem
    openItems: OpenItem[]
}

export async function addOpenItemTool(
    uid: string,
    args: AddOpenItemArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<AddOpenItemResult | RichErrorEnvelope> {
    const setlistId = str(args?.setlistId)
    if (!setlistId) {
        return richError("invalid_argument", "Pass `setlistId`.", { fields: ["setlistId"] }, "Get it from list_setlists.")
    }
    const text = typeof args?.text === "string" ? args.text.trim() : ""
    if (text.length < 1 || text.length > OPEN_ITEM_MAX_LENGTH) {
        return richError(
            "invalid_argument",
            `Pass \`text\`: 1 to ${OPEN_ITEM_MAX_LENGTH} characters.`,
            { fields: ["text"] },
            "e.g. 'chart still needed'.",
        )
    }
    const trackId = str(args?.trackId)
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor
        if (trackId) {
            const t = await db.collection("tracks").doc(trackId).get()
            const td = t.exists ? t.data() : null
            if (!td || td.setlistId !== setlistId || rowOrg(td.orgId) !== org) {
                return richError(
                    "track_not_found",
                    `Track '${trackId}' is not on setlist '${setlistId}'.`,
                    { setlistId, trackId },
                    "Use a track id from get_setlist, or leave trackId out.",
                )
            }
        }
        const createdByName = await displayNameFor(db, uid)
        const ref = db.collection("setlists").doc(setlistId)
        const item: StoredOpenItem = {
            id: crypto.randomUUID(),
            text,
            trackId,
            createdAt: new Date().toISOString(),
            createdByName,
            resolvedAt: null,
            resolvedByName: null,
        }
        const after = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref)
            const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
            if (!data || rowOrg(data.orgId) !== org) throw new Refusal(setlistNotFound(setlistId))
            const raw = Array.isArray(data.openItems) ? data.openItems : []
            const same = text.toLowerCase()
            const existing = storedItems(data).find((i) => !i.resolvedAt && i.text.toLowerCase() === same)
            if (existing) return { data, item: existing }
            const next = [...raw, item]
            tx.update(ref, {
                openItems: next,
                version: FieldValue.increment(1),
                lastModifiedAt: new Date().toISOString(),
                updatedAt: FieldValue.serverTimestamp(),
            })
            return { data: { ...data, openItems: next }, item }
        })
        return { ok: true, setlistId, item: publicItem(after.item), openItems: readOpenItems(after.data) }
    } catch (error) {
        if (error instanceof Refusal) return error.envelope
        logger.warn("add_open_item failed:", error)
        return richError("internal_error", "Could not add the open item.", { errorCode: 500 }, "Retry; check get_setlist first.")
    }
}

// ─── resolve_open_item ──────────────────────────────────────────────────────

export interface ResolveOpenItemArgs {
    setlistId: string
    itemId: string
}

export interface ResolveOpenItemResult {
    ok: true
    setlistId: string
    resolved: OpenItem
    openItems: OpenItem[]
}

export async function resolveOpenItemTool(
    uid: string,
    args: ResolveOpenItemArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ResolveOpenItemResult | RichErrorEnvelope> {
    const setlistId = str(args?.setlistId)
    const itemId = str(args?.itemId)
    if (!setlistId || !itemId) {
        return richError(
            "invalid_argument",
            "Pass `setlistId` and `itemId`.",
            { fields: ["setlistId", "itemId"] },
            "get_setlist lists the open items with their ids.",
        )
    }
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor
        const resolvedByName = await displayNameFor(db, uid)
        const ref = db.collection("setlists").doc(setlistId)
        const out = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref)
            const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
            // Another tenant's setlist hides its items too: the item is simply not found.
            if (!data || rowOrg(data.orgId) !== org) throw new Refusal(itemNotFound(setlistId, itemId))
            const raw = Array.isArray(data.openItems) ? (data.openItems as Record<string, unknown>[]) : []
            const at = raw.findIndex((r) => r && r.id === itemId && !str(r.resolvedAt))
            if (at < 0) throw new Refusal(itemNotFound(setlistId, itemId))
            const resolvedAt = new Date().toISOString()
            const next = raw.map((r, i) => (i === at ? { ...r, resolvedAt, resolvedByName } : r))
            tx.update(ref, {
                openItems: next,
                version: FieldValue.increment(1),
                lastModifiedAt: resolvedAt,
                updatedAt: FieldValue.serverTimestamp(),
            })
            const resolved = storedItems({ openItems: [next[at]] })[0]
            return { resolved: publicItem(resolved), openItems: readOpenItems({ openItems: next }) }
        })
        return { ok: true, setlistId, ...out }
    } catch (error) {
        if (error instanceof Refusal) return error.envelope
        logger.warn("resolve_open_item failed:", error)
        return richError("internal_error", "Could not resolve the open item.", { errorCode: 500 }, "Retry; check get_setlist first.")
    }
}
