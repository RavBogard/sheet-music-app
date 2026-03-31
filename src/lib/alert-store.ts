import { db } from "@/lib/firebase"
import { doc, onSnapshot, setDoc } from "firebase/firestore"
import { create } from "zustand"

interface GlobalAlert {
    visible: boolean
    message: string
    type: "info" | "warning" | "error"
}

interface AlertStore {
    alert: GlobalAlert | null
    loading: boolean
    init: () => void
    destroy: () => void
    setAlert: (alert: GlobalAlert) => Promise<void>
}

let initialized = false
let unsubscribe: (() => void) | null = null

export const useAlertStore = create<AlertStore>((set) => ({
    alert: null,
    loading: true,
    init: () => {
        if (initialized) return
        initialized = true
        if (!db) return
        const ref = doc(db, "system", "globalAlert")
        unsubscribe = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                set({ alert: snap.data() as GlobalAlert, loading: false })
            } else {
                set({ alert: { visible: false, message: "", type: "info" }, loading: false })
            }
        }, () => {
            set({ loading: false }) // Silently fail if no access
        })
    },
    destroy: () => {
        if (unsubscribe) {
            unsubscribe()
            unsubscribe = null
        }
        initialized = false
    },
    setAlert: async (alert: GlobalAlert) => {
        if (!db) return
        const ref = doc(db, "system", "globalAlert")
        await setDoc(ref, alert, { merge: true })
        // Optimistic UI
        set({ alert })
    }
}))
