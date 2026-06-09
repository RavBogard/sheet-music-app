/**
 * Firebase persistence for template overrides.
 *
 * Templates have hardcoded defaults in liturgical-templates.ts.
 * This module stores admin customizations in Firestore.
 * When a custom template exists, it takes priority over the hardcoded default.
 */

import { useState, useEffect } from "react"
import {
    doc, getDoc, setDoc, deleteDoc, onSnapshot,
    collection, Timestamp,
} from "firebase/firestore"
import { getDb, subscribeWithDb } from "./firebase"
import type { TemplateSlot } from "./liturgical-templates"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { useOrg } from "@/lib/org/org-context"

const COLLECTION = "templates"

/**
 * v11-05-01: tenant-namespace a liturgical template doc-id. Doc-ids ARE the
 * liturgical-type keys (e.g. "shabbat_morning"), so two orgs would collide on the
 * same key. CRC keeps the BARE key (zero migration — no CRC lockout); every other
 * org is isolated under `${org}__${key}`. The "__" separator is the marker the
 * CRC-side snapshot filter uses to exclude other tenants' docs.
 */
export function keyFor(org: OrgId, key: string): string {
    return org === DEFAULT_ORG_ID ? key : `${org}__${key}`
}

/**
 * v11-05-01: pure selector for the org-scoped override map — extracted from
 * `useCustomTemplates` so the tenant-isolation logic is unit-testable without
 * React. CRC (default org) sees only BARE-key docs (any "${other}__key" doc is
 * another tenant's and is excluded); a non-CRC org sees only its own
 * "${org}__key" docs, with the prefix stripped back to the bare liturgical key.
 */
export function selectOrgOverrides(
    org: OrgId,
    docs: Array<{ id: string; slots?: TemplateSlot[] | null }>,
): Record<string, TemplateSlot[]> {
    const result: Record<string, TemplateSlot[]> = {}
    const prefix = `${org}__`
    for (const d of docs) {
        if (!d.slots) continue
        if (org === DEFAULT_ORG_ID) {
            if (!d.id.includes("__")) result[d.id] = d.slots
        } else if (d.id.startsWith(prefix)) {
            result[d.id.slice(prefix.length)] = d.slots
        }
    }
    return result
}

export interface CustomTemplateDoc {
    slots: TemplateSlot[]
    updatedAt: Timestamp
    updatedBy: string
}

/**
 * Fetch a single custom template override from Firebase.
 * Returns null if no override exists (use hardcoded default).
 */
export async function getCustomTemplate(
    key: string,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<TemplateSlot[] | null> {
    const db = await getDb()
    const snap = await getDoc(doc(db, COLLECTION, keyFor(org, key)))
    if (!snap.exists()) return null
    return (snap.data() as CustomTemplateDoc).slots
}

/** Strip undefined values from an object (Firestore rejects them). */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
    ) as T
}

/**
 * Save a custom template override to Firebase.
 */
export async function saveCustomTemplate(
    key: string,
    slots: TemplateSlot[],
    userId: string,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<void> {
    const db = await getDb()
    const cleanSlots = slots.map(s => stripUndefined({ ...s }))
    await setDoc(doc(db, COLLECTION, keyFor(org, key)), {
        slots: cleanSlots,
        orgId: org,
        updatedAt: Timestamp.now(),
        updatedBy: userId,
    })
}

/**
 * Delete a custom template override, reverting to hardcoded default.
 */
export async function deleteCustomTemplate(
    key: string,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<void> {
    const db = await getDb()
    await deleteDoc(doc(db, COLLECTION, keyFor(org, key)))
}

/**
 * Update a single slot in an existing custom template.
 * If no custom template exists for this type, does nothing (won't auto-create).
 * Fire-and-forget — caller should catch errors.
 */
export async function syncTemplateSlot(
    templateType: string,
    slotIndex: number,
    updates: Partial<TemplateSlot>,
    userId: string,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<void> {
    const slots = await getCustomTemplate(templateType, org)
    if (!slots) return // No custom template — don't auto-create
    if (slotIndex < 0 || slotIndex >= slots.length) return

    slots[slotIndex] = { ...slots[slotIndex], ...updates }
    await saveCustomTemplate(templateType, slots, userId, org)
}

/**
 * React hook: subscribe to all custom template overrides in real time.
 * Returns a map of templateKey → TemplateSlot[] for overridden templates only.
 */
export function useCustomTemplates(): {
    overrides: Record<string, TemplateSlot[]>
    loading: boolean
} {
    // v11-05-01: scope overrides to the active tenant. Outside an OrgProvider
    // useOrg() defaults to crc (v11-03-01), so server/test paths are unchanged.
    const org = useOrg()
    const [overrides, setOverrides] = useState<Record<string, TemplateSlot[]>>({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const unsub = subscribeWithDb((db) => onSnapshot(
            collection(db, COLLECTION),
            (snap) => {
                const docs = snap.docs.map((d) => ({
                    id: d.id,
                    slots: (d.data() as CustomTemplateDoc).slots,
                }))
                setOverrides(selectOrgOverrides(org, docs))
                setLoading(false)
            },
            (err) => {
                // Permission denied or other error — fall back to empty overrides
                // (hardcoded defaults will be used)
                logger.warn("[Templates] Listener error (using defaults):", err)
                setLoading(false)
            },
        ))
        return unsub
    }, [org])

    return { overrides, loading }
}
