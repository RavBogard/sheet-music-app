/**
 * Monitor Connection Manager
 *
 * Singleton Firestore connection for live mixer data.
 * Ref-counted: first consumer opens the connection, last consumer closes it.
 * Both MonitorPage and QuickMonitorPanel share this.
 *
 * Uses Firestore as the transport — zero configuration on iPads.
 * The bridge writes mixer state to Firestore; iPads read it via onSnapshot.
 * iPad fader commands are written to Firestore; the bridge reads and executes them.
 */

"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorStore } from "@/lib/monitor-store"
import { FirestoreMonitorClient } from "@/lib/firestore-monitor-client"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { MonitorConfig } from "@/types/monitor"
import { logger } from "@/lib/logger"

// Module-level singleton state
let activeClient: FirestoreMonitorClient | null = null
let refCount = 0
let configUnsub: (() => void) | null = null

function getClient(): FirestoreMonitorClient | null {
    return activeClient
}

/**
 * Hook that manages the shared Firestore connection to the bridge.
 * Mount this in any component that needs live mixer data.
 * The connection opens on first mount and closes when the last consumer unmounts.
 *
 * Returns the client for sending commands.
 */
export function useMonitorConnection(): { client: FirestoreMonitorClient | null } {
    const { user } = useAuth()
    const { hasAccess } = useMonitorAccess()
    const clientRef = useRef<FirestoreMonitorClient | null>(null)

    useEffect(() => {
        if (!user || !hasAccess) return

        refCount++
        logger.info(`[MonitorConn] Consumer mounted (refCount: ${refCount})`)

        // If connection already exists, just grab it
        if (activeClient) {
            clientRef.current = activeClient
            return () => {
                refCount--
                logger.info(`[MonitorConn] Consumer unmounted (refCount: ${refCount})`)
                if (refCount <= 0) {
                    teardown()
                }
            }
        }

        // First consumer — watch config + connect

        // Watch config/monitor for bus assignments and bridge status
        configUnsub = onSnapshot(doc(db, "config", "monitor"), (snap) => {
            if (!snap.exists()) return
            const config = snap.data() as MonitorConfig
            useMonitorStore.getState().setConfig(config)
        })

        // Create and start the Firestore monitor client
        const client = new FirestoreMonitorClient({
            onStateUpdate: (snapshot) => {
                const uid = useMonitorStore.getState().userId || user.uid
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
        clientRef.current = client
        client.connect()

        return () => {
            refCount--
            logger.info(`[MonitorConn] Consumer unmounted (refCount: ${refCount})`)
            if (refCount <= 0) {
                teardown()
            }
        }

    }, [user?.uid, hasAccess])

    // Keep ref current
    clientRef.current = activeClient

    return { client: activeClient }
}

function teardown() {
    logger.info("[MonitorConn] Last consumer gone — closing connection")
    refCount = 0

    if (configUnsub) {
        configUnsub()
        configUnsub = null
    }
    if (activeClient) {
        activeClient.disconnect()
        activeClient = null
    }
    useMonitorStore.getState().reset()
}

/** Expose the client for imperative access (e.g., from callbacks) */
export { getClient as getMonitorClient }
