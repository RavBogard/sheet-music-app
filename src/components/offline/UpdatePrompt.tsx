"use client"

import { useEffect, useState, useCallback } from "react"
import { RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const DISMISS_KEY = 'crc-update-dismissed'
const DISMISS_DURATION_MS = 4 * 60 * 60 * 1000 // Don't re-show for 4 hours after dismissal

/**
 * Detects when a new service worker is waiting and shows a gentle
 * "Update available" prompt. Without this, removing skipWaiting
 * means users would never get new versions until they close all tabs.
 *
 * Key behavior:
 * - If the user hasn't interacted with the page yet (no click/scroll/keypress),
 *   updates are auto-activated silently. They just navigated here — they
 *   should get the latest version without a disruptive banner.
 * - If a new SW arrives mid-session (user has interacted with the app),
 *   the banner appears so they can choose when to refresh.
 *   This is critical during live performances.
 * - Users can dismiss and the prompt won't reappear for 4 hours.
 */
export function UpdatePrompt() {
    const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

        // Check if recently dismissed
        const dismissedAt = localStorage.getItem(DISMISS_KEY)
        if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS) {
            setDismissed(true)
        }

        // Track whether the user has interacted with the page.
        // Before any interaction, updates are auto-activated silently.
        // After interaction, the banner is shown so the user can choose when to refresh.
        // This prevents the confusing "update available" banner on fresh page loads
        // regardless of how long the SW update check takes.
        let userHasInteracted = false
        const markInteracted = () => { userHasInteracted = true }
        const interactionEvents = ["click", "scroll", "keydown", "touchstart"] as const
        interactionEvents.forEach(evt =>
            window.addEventListener(evt, markInteracted, { once: true, passive: true, capture: true })
        )

        // Track if we auto-activated a SW (suppress the controllerchange reload)
        let autoActivated = false

        const activateOrPrompt = (sw: ServiceWorker) => {
            if (!userHasInteracted) {
                // User hasn't interacted yet — silently activate the waiting SW.
                // The current page is already rendered with cached resources.
                // The new SW will serve fresh content on the next navigation.
                autoActivated = true
                sw.postMessage({ type: "SKIP_WAITING" })
            } else {
                // Mid-session update — show the banner and let user decide
                setWaitingSW(sw)
            }
        }

        const handleUpdate = (reg: ServiceWorkerRegistration) => {
            // Only act if there's a waiting SW AND an existing controller.
            // No controller = first install, not an update.
            if (reg.waiting && navigator.serviceWorker.controller) {
                activateOrPrompt(reg.waiting)
            }

            reg.addEventListener("updatefound", () => {
                const newSW = reg.installing
                if (!newSW) return

                newSW.addEventListener("statechange", () => {
                    if (newSW.state === "installed" && navigator.serviceWorker.controller) {
                        activateOrPrompt(newSW)
                    }
                })
            })
        }

        // Use getRegistration('/') to target only the main PWA service worker.
        // navigator.serviceWorker.ready can resolve to ANY active SW (including
        // the Firebase Messaging SW at /firebase-messaging-sw.js), which causes
        // false "update available" prompts when the messaging SW installs.
        navigator.serviceWorker.getRegistration('/').then(reg => {
            if (reg) handleUpdate(reg)
        })

        // Listen for controller change (another tab or auto-activation triggered it)
        let refreshing = false
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return
            if (autoActivated) {
                // We triggered this via auto-activation on page load.
                // Don't reload — the page is already loaded with current resources.
                // The new SW will serve content on the next navigation.
                autoActivated = false
                return
            }
            // User-triggered update (via banner or another tab) — reload
            refreshing = true
            window.location.reload()
        })

        return () => {
            interactionEvents.forEach(evt =>
                window.removeEventListener(evt, markInteracted, { capture: true } as EventListenerOptions)
            )
        }
    }, [])

    const handleUpdate = useCallback(() => {
        if (waitingSW) {
            waitingSW.postMessage({ type: "SKIP_WAITING" })
            setWaitingSW(null)
        }
    }, [waitingSW])

    const handleDismiss = useCallback(() => {
        setDismissed(true)
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }, [])

    if (!waitingSW || dismissed) return null

    return (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4">
            <div className="flex items-center gap-1 bg-brand text-brand-foreground rounded-full shadow-lg text-sm font-medium">
                <Button
                    variant="ghost"
                    onClick={handleUpdate}
                    className="flex items-center gap-2 hover:bg-brand/90 px-4 py-2.5 rounded-l-full rounded-r-none text-brand-foreground"
                >
                    <RefreshCw className="w-4 h-4" />
                    Update available — tap to refresh
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDismiss}
                    className="hover:bg-brand/80 rounded-r-full rounded-l-none text-brand-foreground size-auto p-2.5"
                    aria-label="Dismiss update prompt"
                >
                    <X className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    )
}
