import { db } from "@/lib/firebase"
import { doc, onSnapshot, setDoc } from "firebase/firestore"
import { create } from "zustand"
import { logger } from "@/lib/logger"

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
        // B02: if already subscribed, no-op (prevents listener stacking on
        // duplicate init calls). If db wasn't available on first call, we
        // don't latch `initialized` — so a later call can retry.
        if (initialized) return
        if (!db) return
        initialized = true
        const ref = doc(db, "system", "globalAlert")
        unsubscribe = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                set({ alert: snap.data() as GlobalAlert, loading: false })
            } else {
                set({ alert: { visible: false, message: "", type: "info" }, loading: false })
            }
        }, (err) => {
            // B02: surface the real error to telemetry — previously silently
            // set loading: false with no diagnostic, making permission /
            // rule failures invisible in prod.
            logger.warn("[alert-store] globalAlert subscription failed:", err)
            set({ loading: false })
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
