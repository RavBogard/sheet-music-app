"use client"

import { create } from "zustand"
import { db } from "@/lib/firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { logger } from "@/lib/logger"
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
    /** Clear the debounce timer — call when the consuming component unmounts */
    clearSaveTimer: () => void

    // UI actions
    setAnnotating: (v: boolean) => void
    setTool: (tool: AnnotationTool) => void
    setColor: (color: AnnotationColor) => void
}

// Timer scoped to this module — exposed via clearSaveTimer for lifecycle cleanup
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

    clearSaveTimer: () => {
        if (saveTimer) {
            clearTimeout(saveTimer)
            saveTimer = null
        }
    },

    loadAnnotations: async (uid, fileId) => {
        // Clear any pending save for the previous file
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
        set({ loading: true, fileId, uid, pageAnnotations: {} })
        try {
            // Attempt network fetch
            // Firestore handles offline caching automatically via IndexedDB
            const ref = doc(db, "users", uid, "annotations", fileId)
            const snap = await getDoc(ref)
            if (snap.exists()) {
                const data = snap.data()
                set({ pageAnnotations: data.pageAnnotations || {} })
            }
        } catch (e) {
            logger.warn("[Annotations] Failed to load from network:", e)
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

        // Dispatch to Firestore. Native persistence will handle offline queuing.
        try {
            const ref = doc(db, "users", uid, "annotations", fileId)
            await setDoc(ref, {
                fileId,
                pageAnnotations,
                updatedAt: serverTimestamp(),
            })
        } catch (e) {
            logger.warn("[Annotations] Network save failed:", e)
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
