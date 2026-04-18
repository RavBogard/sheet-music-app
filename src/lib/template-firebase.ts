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
import { db } from "./firebase"
import type { TemplateSlot } from "./liturgical-templates"
import { logger } from "@/lib/logger"

const COLLECTION = "templates"

export interface CustomTemplateDoc {
    slots: TemplateSlot[]
    updatedAt: Timestamp
    updatedBy: string
}

/**
 * Fetch a single custom template override from Firebase.
 * Returns null if no override exists (use hardcoded default).
 */
export async function getCustomTemplate(key: string): Promise<TemplateSlot[] | null> {
    const snap = await getDoc(doc(db, COLLECTION, key))
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
): Promise<void> {
    const cleanSlots = slots.map(s => stripUndefined({ ...s }))
    await setDoc(doc(db, COLLECTION, key), {
        slots: cleanSlots,
        updatedAt: Timestamp.now(),
        updatedBy: userId,
    })
}

/**
 * Delete a custom template override, reverting to hardcoded default.
 */
export async function deleteCustomTemplate(key: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, key))
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
): Promise<void> {
    const slots = await getCustomTemplate(templateType)
    if (!slots) return // No custom template — don't auto-create
    if (slotIndex < 0 || slotIndex >= slots.length) return

    slots[slotIndex] = { ...slots[slotIndex], ...updates }
    await saveCustomTemplate(templateType, slots, userId)
}

/**
 * React hook: subscribe to all custom template overrides in real time.
 * Returns a map of templateKey → TemplateSlot[] for overridden templates only.
 */
export function useCustomTemplates(): {
    overrides: Record<string, TemplateSlot[]>
    loading: boolean
} {
    const [overrides, setOverrides] = useState<Record<string, TemplateSlot[]>>({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, COLLECTION),
            (snap) => {
                const result: Record<string, TemplateSlot[]> = {}
                snap.forEach((d) => {
                    const data = d.data() as CustomTemplateDoc
                    if (data.slots) result[d.id] = data.slots
                })
                setOverrides(result)
                setLoading(false)
            },
            (err) => {
                // Permission denied or other error — fall back to empty overrides
                // (hardcoded defaults will be used)
                logger.warn("[Templates] Listener error (using defaults):", err)
                setLoading(false)
            },
        )
        return unsub
    }, [])

    return { overrides, loading }
}
