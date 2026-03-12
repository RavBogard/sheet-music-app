"use client"

import { useEffect } from "react"
import { logger } from "@/lib/logger"

/**
 * One-time cleanup: unregister the old PWA service worker.
 *
 * The PWA SW was disabled because it caused repeated production issues
 * (stale deploys, PDF worker module loading failures on mobile, broken
 * app state after cache clears). This component ensures existing users'
 * old SWs get removed so they stop serving cached content.
 *
 * The Firebase Messaging SW (firebase-messaging-sw.js) is left alone —
 * it's a separate registration used only for push notifications.
 */
export function SwCleanup() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return

        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (const reg of registrations) {
                // Keep the Firebase Messaging SW — only remove the PWA SW
                if (reg.active?.scriptURL.includes("firebase-messaging")) continue
                reg.unregister().then(success => {
                    if (success) {
                        logger.info("[SwCleanup] Unregistered old PWA service worker")
                    }
                })
            }
        })
    }, [])

    return null
}
