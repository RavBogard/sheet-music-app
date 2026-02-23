"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

/**
 * Detects when a new service worker is waiting and shows a gentle
 * "Update available" prompt. Without this, removing skipWaiting
 * means users would never get new versions until they close all tabs.
 *
 * The prompt appears as a fixed bottom toast that doesn't interrupt
 * the current workflow — critical during live performances.
 */
export function UpdatePrompt() {
    const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null)

    useEffect(() => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

        const handleUpdate = (reg: ServiceWorkerRegistration) => {
            // Only show the banner if there's a waiting SW AND an existing controller.
            // If there's no controller, this is a first install — not an update.
            if (reg.waiting && navigator.serviceWorker.controller) {
                setWaitingSW(reg.waiting)
            }

            reg.addEventListener("updatefound", () => {
                const newSW = reg.installing
                if (!newSW) return

                newSW.addEventListener("statechange", () => {
                    if (newSW.state === "installed" && navigator.serviceWorker.controller) {
                        setWaitingSW(newSW)
                    }
                })
            })
        }

        navigator.serviceWorker.ready.then(handleUpdate)

        // Also listen for controller change (another tab triggered update)
        let refreshing = false
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return
            refreshing = true
            window.location.reload()
        })
    }, [])

    const handleUpdate = () => {
        if (waitingSW) {
            waitingSW.postMessage({ type: "SKIP_WAITING" })
            setWaitingSW(null)
        }
    }

    if (!waitingSW) return null

    return (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4">
            <button
                onClick={handleUpdate}
                className="flex items-center gap-2 bg-brand hover:bg-brand/90 text-brand-foreground px-4 py-2.5 rounded-full shadow-lg transition-colors text-sm font-medium"
            >
                <RefreshCw className="w-4 h-4" />
                Update available — tap to refresh
            </button>
        </div>
    )
}
