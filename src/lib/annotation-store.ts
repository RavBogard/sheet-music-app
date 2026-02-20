"use client"

import { create } from "zustand"
import { db } from "@/lib/firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { logger } from "@/lib/logger"
import { saveOfflineAnnotation, getOfflineAnnotation } from "@/lib/offline-store"
import type { Annotation, PageAnnotations, AnnotationTool, AnnotationColor } from "@/types/annotations"

interface AnnotationState {
    // Data
    fileId: string | null
    uid: string | null
    pageAnnotations: PageAnnotations
    loading: boolean

    // UI state
    isAnnotating: boolean
    activeTool: AnnotationTool
    activeColor: AnnotationColor
    strokeWidth: number

    // Actions
    loadAnnotations: (uid: string, fileId: string) => Promise<void>
    addAnnotation: (annotation: Annotation) => void
    undoLastAnnotation: (pageNumber: number) => void
    clearPage: (pageNumber: number) => void
    save: () => Promise<void>

    // UI actions
    setAnnotating: (v: boolean) => void
    setTool: (tool: AnnotationTool) => void
    setColor: (color: AnnotationColor) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
    fileId: null,
    uid: null,
    pageAnnotations: {},
    loading: false,
    isAnnotating: false,
    activeTool: "freehand",
    activeColor: "#ef4444",
    strokeWidth: 3,

    loadAnnotations: async (uid, fileId) => {
        set({ loading: true, fileId, uid, pageAnnotations: {} })
        try {
            let localData: any = null
            try {
                localData = await getOfflineAnnotation(uid, fileId)
            } catch (e) {
                logger.warn("[Annotations] IDB read failed:", e)
            }

            // Apply local data immediately for fast visual response
            if (localData?.pageAnnotations) {
                set({ pageAnnotations: localData.pageAnnotations })
            }

            // Attempt network fetch
            const ref = doc(db, "users", uid, "annotations", fileId)
            const snap = await getDoc(ref)
            if (snap.exists()) {
                const data = snap.data()

                // Very simple conflict resolution: If network has annotations and local doesn't,
                // or if we just want to trust the network as the source of truth, we overwrite.
                // For a true sync queue, we would compare timestamps. For now, if we have local,
                // we assume we might have unsynced edits. Let's merge or use local if it's newer.
                // We'll prefer local for now if it exists, otherwise use network.

                if (!localData || data.updatedAt?.toMillis?.() > (localData.updatedAt || 0)) {
                    set({ pageAnnotations: data.pageAnnotations || {} })
                    // Cache the newly fetched network data
                    saveOfflineAnnotation(uid, fileId, data.pageAnnotations || {}).catch(e => logger.warn(e))
                }
            }
        } catch (e) {
            logger.warn("[Annotations] Failed to load from network, using local:", e)
        } finally {
            set({ loading: false })
        }
    },

    addAnnotation: (annotation) => {
        const { pageAnnotations } = get()
        const key = String(annotation.pageNumber)
        const existing = pageAnnotations[key] || []
        set({
            pageAnnotations: {
                ...pageAnnotations,
                [key]: [...existing, annotation],
            },
        })
        // Debounced auto-save
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => get().save(), 800)
    },

    undoLastAnnotation: (pageNumber) => {
        const { pageAnnotations } = get()
        const key = String(pageNumber)
        const existing = pageAnnotations[key] || []
        if (existing.length === 0) return
        set({
            pageAnnotations: {
                ...pageAnnotations,
                [key]: existing.slice(0, -1),
            },
        })
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => get().save(), 800)
    },

    clearPage: (pageNumber) => {
        const { pageAnnotations } = get()
        const key = String(pageNumber)
        const updated = { ...pageAnnotations }
        delete updated[key]
        set({ pageAnnotations: updated })
        get().save()
    },

    save: async () => {
        const { uid, fileId, pageAnnotations } = get()
        if (!uid || !fileId) return

        // 1. Buffer locally in IndexedDB first
        try {
            await saveOfflineAnnotation(uid, fileId, pageAnnotations)
        } catch (e) {
            logger.warn("[Annotations] Failed to buffer offline:", e)
        }

        // 2. Dispatch to Firestore
        try {
            const ref = doc(db, "users", uid, "annotations", fileId)
            await setDoc(ref, {
                fileId,
                pageAnnotations,
                updatedAt: serverTimestamp(),
            })
        } catch (e) {
            logger.warn("[Annotations] Network save failed, buffered for later:", e)
        }
    },

    setAnnotating: (v) => {
        set({ isAnnotating: v })
        // Save immediately when closing annotation mode
        if (!v && get().uid && get().fileId) {
            if (saveTimer) clearTimeout(saveTimer)
            get().save()
        }
    },
    setTool: (tool) => set({ activeTool: tool }),
    setColor: (color) => set({ activeColor: color }),
}))
