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

/**
 * Save a custom template override to Firebase.
 */
export async function saveCustomTemplate(
    key: string,
    slots: TemplateSlot[],
    userId: string,
): Promise<void> {
    await setDoc(doc(db, COLLECTION, key), {
        slots,
        updatedAt: Timestamp.now(),
        updatedBy: userId,
    } satisfies CustomTemplateDoc)
}

/**
 * Delete a custom template override, reverting to hardcoded default.
 */
export async function deleteCustomTemplate(key: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, key))
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
            () => {
                // Permission denied or other error — fall back to empty overrides
                // (hardcoded defaults will be used)
                setLoading(false)
            },
        )
        return unsub
    }, [])

    return { overrides, loading }
}
