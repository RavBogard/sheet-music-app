/**
 * Monitor Connection Manager
 *
 * Persistent singleton Firestore connection for live mixer data.
 * The connection is established once and persists across component
 * mount/unmount cycles via ref counting with a 3s debounce.
 *
 * The debounce prevents the "reload loop" where song navigation in
 * performance mode would unmount PerformanceToolbar, drop refCount
 * to 0, tear down the connection, then remount and reconnect.
 *
 * Lifecycle:
 * - connect(): Called by useMonitorConnection() on first mount with a user
 * - disconnect(): Called on auth sign-out, page unload, or when all consumers unmount (debounced)
 * - Re-mount after teardown reconnects automatically
 *
 * Uses Firestore as the transport — zero configuration on iPads.
 * The bridge writes mixer state to Firestore; iPads read it via onSnapshot.
 * iPad fader commands are written to Firestore; the bridge reads and executes them.
 */

"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorStore } from "@/lib/monitor-store"
import { FirestoreMonitorClient } from "@/lib/firestore-monitor-client"
import { doc, onSnapshot } from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import { MonitorConfig } from "@/types/monitor"
import { logger } from "@/lib/logger"
import { onAuthStateChanged } from "firebase/auth"

// ─── Persistent singleton with ref counting ───

let activeClient: FirestoreMonitorClient | null = null
let configUnsub: (() => void) | null = null
let connectedUserId: string | null = null
let authUnsub: (() => void) | null = null
let authTeardownTimer: ReturnType<typeof setTimeout> | null = null
let unloadListenerAdded = false
let refCount = 0
let refCountTeardownTimer: ReturnType<typeof setTimeout> | null = null

function getClient(): FirestoreMonitorClient | null {
    return activeClient
}

/**
 * Establish the monitor connection for a given user.
 * Idempotent — does nothing if already connected for this user.
 */
function ensureConnected(userId: string): void {
    // Already connected for this user — nothing to do
    if (activeClient && connectedUserId === userId) {
        return
    }

    // Different user — tear down old connection first
    if (activeClient && connectedUserId !== userId) {
        logger.info("[MonitorConn] User changed — reconnecting")
        teardown()
    }

    connectedUserId = userId
    logger.info("[MonitorConn] Establishing persistent connection for user %s", userId)

    // Watch config/monitor for bus assignments and bridge status
    configUnsub = onSnapshot(doc(db, "config", "monitor"), (snap) => {
        if (!snap.exists()) return
        const config = snap.data() as MonitorConfig
        useMonitorStore.getState().setConfig(config)
    }, (err) => {
        logger.error("[MonitorConn] Config listener error:", err)
    })

    // Create and start the Firestore monitor client
    const client = new FirestoreMonitorClient({
        onStateUpdate: (snapshot) => {
            const uid = useMonitorStore.getState().userId || userId
            useMonitorStore.getState().setSnapshot(snapshot, uid)
        },
        onConfigUpdate: (cfg) => {
            useMonitorStore.getState().setConfig(cfg)
        },
        onStatusChange: (status, err) => {
            useMonitorStore.getState().setStatus(status, err)
        },
    })

    activeClient = client
    client.connect()
    logger.info("[MonitorConn] Connected for user %s", userId)

    // Register one-time teardown listeners (sign-out + page unload)
    registerTeardownListeners()
}

/**
 * Full teardown — called on sign-out, page unload, or when all consumers unmount.
 * Skips if consumers are still mounted (unless force=true for auth/unload).
 */
function teardown(force = false): void {
    if (!force && refCount > 0) {
        logger.debug("[MonitorConn] Teardown skipped — %d consumers still mounted", refCount)
        return
    }
    logger.info("[MonitorConn] Tearing down connection (user was: %s)", connectedUserId)
    connectedUserId = null

    if (refCountTeardownTimer) {
        clearTimeout(refCountTeardownTimer)
        refCountTeardownTimer = null
    }
    if (configUnsub) {
        configUnsub()
        configUnsub = null
    }
    if (activeClient) {
        activeClient.disconnect()
        activeClient = null
    }
    useMonitorStore.getState().reset()
    logger.info("[MonitorConn] Teardown complete")
}

/**
 * Register listeners that trigger teardown:
 * - Firebase auth sign-out (user becomes null)
 * - Page unload (tab close / navigation away)
 */
function registerTeardownListeners(): void {
    // Auth state listener — tear down on sign-out (debounced)
    // Firebase auth can briefly report null during token refresh.
    // Wait 3s before tearing down to avoid transient disconnects.
    if (!authUnsub) {
        authUnsub = onAuthStateChanged(auth, (user) => {
            logger.debug("[MonitorConn] Auth state changed — user: %s", user?.uid || "null")
            if (user) {
                // User is present — cancel any pending teardown
                if (authTeardownTimer) {
                    logger.debug("[MonitorConn] Auth restored — cancelling teardown")
                    clearTimeout(authTeardownTimer)
                    authTeardownTimer = null
                }
            } else if (activeClient) {
                // User became null — debounce before tearing down
                logger.info("[MonitorConn] User null — scheduling teardown in 3s")
                if (!authTeardownTimer) {
                    authTeardownTimer = setTimeout(() => {
                        authTeardownTimer = null
                        if (!auth.currentUser && activeClient) {
                            logger.info("[MonitorConn] User still null after 3s — tearing down")
                            teardown(true)
                        }
                    }, 3000)
                }
            }
        })
    }

    // Page unload listener
    if (!unloadListenerAdded && typeof window !== "undefined") {
        window.addEventListener("beforeunload", () => teardown(true))

        // iOS Safari doesn't reliably fire beforeunload. Use visibilitychange
        // to reconnect when the user returns from a suspended tab.
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && refCount > 0 && !activeClient && auth.currentUser) {
                logger.info("[MonitorConn] Tab became visible — reconnecting")
                ensureConnected(auth.currentUser.uid)
            }
        })

        unloadListenerAdded = true
    }
}

// ─── React Hook ───

/**
 * Hook that ensures the persistent monitor connection is active.
 * Mount this in any component that needs live mixer data.
 *
 * The connection persists across component mount/unmount cycles.
 * Components can freely mount and unmount without affecting the connection.
 *
 * Returns the client for sending commands.
 */
export function useMonitorConnection(): { client: FirestoreMonitorClient | null } {
    const { user } = useAuth()
    const userUid = user?.uid ?? null

    // Track previous uid to avoid effect churn during transient auth nulls.
    // Firebase Auth can briefly report null during token refresh on iPad —
    // the auth listener's 3s debounce handles that case, so the effect
    // should only fire on genuine uid changes.
    const prevUidRef = useRef<string | null>(null)

    useEffect(() => {
        if (userUid === prevUidRef.current) return // No genuine change
        prevUidRef.current = userUid

        if (!userUid) return // User signed out — auth listener handles teardown

        refCount++
        logger.debug("[MonitorConn] Hook mounted — refCount=%d, active=%s", refCount, !!activeClient)

        // Cancel any pending teardown from a previous unmount cycle
        if (refCountTeardownTimer) {
            clearTimeout(refCountTeardownTimer)
            refCountTeardownTimer = null
        }

        ensureConnected(userUid)

        return () => {
            refCount = Math.max(0, refCount - 1)
            logger.debug("[MonitorConn] Hook unmounted — refCount=%d", refCount)

            if (refCount === 0 && activeClient) {
                // Debounce teardown to avoid flicker during page transitions.
                // 5s accommodates iPad tab suspension/restoration which is
                // slower than desktop navigation transitions.
                refCountTeardownTimer = setTimeout(() => {
                    refCountTeardownTimer = null
                    if (refCount === 0) {
                        logger.info("[MonitorConn] All consumers unmounted — tearing down")
                        teardown(true)
                    }
                }, 5000)
            }
        }
    }, [userUid])

    return { client: activeClient }
}

/** Expose the client for imperative access (e.g., from callbacks) */
export { getClient as getMonitorClient }
