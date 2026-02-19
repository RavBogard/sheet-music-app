/**
 * Monitor Connection Manager
 * 
 * Singleton WebSocket connection to the bridge server.
 * Ref-counted: first consumer opens the connection, last consumer closes it.
 * Both MonitorPage and QuickMonitorPanel share this — no duplicate WebSockets.
 */

"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorStore } from "@/lib/monitor-store"
import { X32WSClient } from "@/lib/x32-ws-client"
import { doc, getDoc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { MonitorConfig } from "@/types/monitor"
import { logger } from "@/lib/logger"

// Module-level singleton state
let activeClient: X32WSClient | null = null
let refCount = 0
let currentBridgeUrl: string | null = null
let configUnsub: (() => void) | null = null

function getClient(): X32WSClient | null {
    return activeClient
}

/**
 * Hook that manages the shared WebSocket connection to the bridge.
 * Mount this in any component that needs live mixer data.
 * The connection opens on first mount and closes when the last consumer unmounts.
 * 
 * Returns the WS client ref for sending commands.
 */
export function useMonitorConnection(): { client: X32WSClient | null } {
    const { user } = useAuth()
    const { hasAccess } = useMonitorAccess()
    const clientRef = useRef<X32WSClient | null>(null)

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

        // First consumer — set up config watcher + connection
        const storeActions = useMonitorStore.getState()

        // Watch config for bridgeUrl changes
        configUnsub = onSnapshot(doc(db, "config", "monitor"), async (snap) => {
            if (!snap.exists()) return
            const config = snap.data() as MonitorConfig
            storeActions.setConfig(config)

            if (!config.bridgeUrl) return

            // Connect or reconnect if URL changed
            if (config.bridgeUrl !== currentBridgeUrl) {
                if (activeClient) {
                    activeClient.disconnect()
                    activeClient = null
                }
                currentBridgeUrl = config.bridgeUrl

                // Check bridge heartbeat before connecting
                const bridge = config.bridge
                if (bridge?.status === "offline") return
                if (bridge?.lastSeen) {
                    try {
                        const ts = bridge.lastSeen as { toDate?: () => Date; seconds?: number }
                        let lastSeen: Date
                        if (ts.toDate) lastSeen = ts.toDate()
                        else if (ts.seconds) lastSeen = new Date(ts.seconds * 1000)
                        else lastSeen = new Date(bridge.lastSeen as string)
                        if (Date.now() - lastSeen.getTime() > 120_000) return
                    } catch { /* can't parse, try anyway */ }
                }

                const client = new X32WSClient({
                    onStateUpdate: (snapshot) => {
                        const uid = useMonitorStore.getState().userId || user.uid
                        useMonitorStore.getState().setSnapshot(snapshot, uid)
                    },
                    onFaderUpdate: (busIndex, _field, value) => {
                        useMonitorStore.getState().updateBusFader(busIndex, value)
                    },
                    onSendUpdate: (busIndex, channelIndex, field, value) => {
                        const s = useMonitorStore.getState()
                        if (field === "level") s.updateSendLevel(busIndex, channelIndex, value as number)
                        if (field === "on") s.updateSendOn(busIndex, channelIndex, value as boolean)
                    },
                    onMatrixUpdate: (matrixIndex, field, value) => {
                        const s = useMonitorStore.getState()
                        if (field === "fader") s.updateMatrixFader(matrixIndex, value as number)
                        if (field === "on") s.updateMatrixOn(matrixIndex, value as boolean)
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
                client.connect(config.bridgeUrl).catch(() => {})
            }
        })

        // Also do an initial getDoc for immediate connection (onSnapshot may delay)
        getDoc(doc(db, "config", "monitor")).then(snap => {
            if (!snap.exists()) return
            const config = snap.data() as MonitorConfig
            storeActions.setConfig(config)
        }).catch(() => {})

        clientRef.current = activeClient

        return () => {
            refCount--
            logger.info(`[MonitorConn] Consumer unmounted (refCount: ${refCount})`)
            if (refCount <= 0) {
                teardown()
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid, hasAccess])

    // Keep ref current
    clientRef.current = activeClient

    return { client: activeClient }
}

function teardown() {
    logger.info("[MonitorConn] Last consumer gone — closing connection")
    refCount = 0
    currentBridgeUrl = null

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
