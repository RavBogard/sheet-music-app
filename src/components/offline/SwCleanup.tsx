"use client"

import { useEffect } from "react"
import { logger } from "@/lib/logger"
import { clearFirestoreIndexedDB } from "@/lib/firebase"

/**
 * One-time cleanup: unregister the old PWA service worker.
 *
 * The PWA SW was disabled because it caused repeated production issues
 * (stale deploys, PDF worker module loading failures on mobile, broken
 * app state after cache clears). This component ensures existing users'
 * old SWs get removed so they stop serving cached content.
 *
 * After unregistering, also clears Firestore IndexedDB databases to
 * prevent corrupted persistence state from crashing Firestore on reload.
 *
 * The Firebase Messaging SW (firebase-messaging-sw.js) is left alone —
 * it's a separate registration used only for push notifications.
 *
 * Reload-after-clear (2026-05-15, fix for cowork §7.2): clearing Firestore's
 * IndexedDB while live `onSnapshot` listeners are still attached fires
 * IDB's `onversionchange` on every open listener, surfacing as a flood of
 * `FirebaseError: Firestore shutting down` console errors. The downstream
 * `recoverFromFirestoreShutdown` handler does eventually reload — but on a
 * 1.5s delay, so 5-7 listeners all log first. Reloading immediately after
 * the IDB clear prevents the cascade from ever becoming user-visible.
 *
 * The sessionStorage flag stops a reload loop in the edge case where a
 * second old SW reappears after the reload (shouldn't happen post-fix,
 * but cheap insurance).
 */
const POST_CLEAR_RELOAD_FLAG = "sw-cleanup-post-clear-reload"

export function SwCleanup() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return
        if (typeof window !== "undefined" && sessionStorage.getItem(POST_CLEAR_RELOAD_FLAG)) {
            // We already cleared + reloaded once this session; skip to avoid loops.
            return
        }

        navigator.serviceWorker.getRegistrations().then(async (registrations) => {
            let unregisteredAny = false
            for (const reg of registrations) {
                // Keep the Firebase Messaging SW — only remove the PWA SW
                if (reg.active?.scriptURL.includes("firebase-messaging")) continue
                const success = await reg.unregister()
                if (success) {
                    logger.info("[SwCleanup] Unregistered old PWA service worker")
                    unregisteredAny = true
                }
            }
            if (unregisteredAny) {
                await clearFirestoreIndexedDB()
                logger.info(
                    "[SwCleanup] Cleared Firestore IndexedDB after SW removal — reloading to avoid 'Firestore shutting down' cascade",
                )
                sessionStorage.setItem(POST_CLEAR_RELOAD_FLAG, "1")
                // Immediate reload: any in-flight writes from the just-killed
                // Firestore client are lost anyway (IDB is gone), and waiting
                // lets the error cascade hit the console first.
                window.location.reload()
            }
        })
    }, [])

    return null
}
