/**
 * X32 WebSocket Client
 * 
 * Connects the browser to the bridge server running on the production PC.
 * Handles authentication, auto-reconnect, and message routing.
 */

import { auth } from "./firebase"
import { logger } from "@/lib/logger"
import {
    ServerMessage,
    ClientMessage,
    MixerSnapshot,
    MonitorConfig,
} from "@/types/monitor"

export type ConnectionStatus = "disconnected" | "connecting" | "authenticating" | "connected" | "error"

export interface X32WSClientOptions {
    onStateUpdate: (snapshot: MixerSnapshot) => void
    onFaderUpdate: (busIndex: number, field: "master", value: number) => void
    onSendUpdate: (busIndex: number, channelIndex: number, field: "level" | "on", value: number | boolean) => void
    onMatrixUpdate?: (matrixIndex: number, field: "fader" | "on", value: number | boolean) => void
    onConfigUpdate: (config: MonitorConfig) => void
    onStatusChange: (status: ConnectionStatus, error?: string) => void
}

export class X32WSClient {
    private ws: WebSocket | null = null
    private url: string = ""
    private options: X32WSClientOptions
    private reconnectAttempts = 0
    private maxReconnectAttempts = 20
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    private intentionalClose = false
    private wakeHandler: (() => void) | null = null

    constructor(options: X32WSClientOptions) {
        this.options = options
    }

    async connect(bridgeUrl: string): Promise<void> {
        this.url = bridgeUrl
        this.intentionalClose = false
        this.options.onStatusChange("connecting")

        // Listen for iPad wake events — reconnect immediately when screen comes back
        this.startWakeDetection()

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(bridgeUrl)
            } catch {
                this.options.onStatusChange("error", "Invalid bridge URL")
                reject(new Error("Invalid bridge URL"))
                return
            }

            this.ws.onopen = async () => {
                this.reconnectAttempts = 0
                this.options.onStatusChange("authenticating")

                // Send Firebase auth token
                const user = auth.currentUser
                if (!user) {
                    this.options.onStatusChange("error", "Not signed in")
                    this.ws?.close()
                    reject(new Error("Not signed in"))
                    return
                }

                try {
                    const token = await user.getIdToken()
                    this.send({ type: "auth", token })
                } catch {
                    this.options.onStatusChange("error", "Failed to get auth token")
                    this.ws?.close()
                    reject(new Error("Auth token failure"))
                }
            }

            this.ws.onmessage = (event) => {
                try {
                    const msg: ServerMessage = JSON.parse(event.data)
                    this.handleMessage(msg)

                    if (msg.type === "auth_ok") {
                        resolve()
                    } else if (msg.type === "error") {
                        reject(new Error(msg.message))
                    }
                } catch {
                    // Ignore parse errors
                }
            }

            this.ws.onclose = () => {
                if (!this.intentionalClose) {
                    this.options.onStatusChange("disconnected")
                    this.scheduleReconnect()
                }
            }

            this.ws.onerror = () => {
                this.options.onStatusChange("error", "Connection failed")
            }
        })
    }

    disconnect(): void {
        this.intentionalClose = true
        this.stopWakeDetection()
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = null
        }
        this.ws?.close()
        this.ws = null
        this.options.onStatusChange("disconnected")
    }

    private handleMessage(msg: ServerMessage): void {
        switch (msg.type) {
            case "auth_ok":
                this.options.onStatusChange("connected")
                break

            case "state":
                this.options.onStateUpdate(msg.data)
                break

            case "fader_update":
                this.options.onFaderUpdate(msg.busIndex, msg.field, msg.value)
                break

            case "send_update":
                this.options.onSendUpdate(
                    msg.busIndex,
                    msg.channelIndex,
                    msg.field,
                    msg.value
                )
                break

            case "matrix_update":
                this.options.onMatrixUpdate?.(msg.matrixIndex, msg.field, msg.value)
                break

            case "config_update":
                this.options.onConfigUpdate(msg.config)
                break

            case "error":
                logger.error("[Monitor WS] Error:", msg.message)
                this.options.onStatusChange("error", msg.message)
                break
        }
    }

    private send(msg: ClientMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg))
        }
    }

    private scheduleReconnect(): void {
        if (this.intentionalClose) return
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.options.onStatusChange("error", "Max reconnect attempts reached")
            return
        }

        // First attempt is instant (0ms), then exponential backoff: 1s, 2s, 4s, max 30s
        const delay = this.reconnectAttempts === 0
            ? 0
            : Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)
        this.reconnectAttempts++

        logger.info(`[Monitor WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

        this.reconnectTimeout = setTimeout(() => {
            this.connect(this.url).catch(() => {
                // Will auto-retry via onclose
            })
        }, delay)
    }

    // ─── Wake Detection ───────────────────────────────────────
    // iPads silently kill WebSockets when the screen turns off.
    // The visibilitychange event fires immediately on wake, so we
    // can proactively reconnect instead of waiting for a failed write.

    private startWakeDetection(): void {
        if (typeof document === "undefined") return
        this.stopWakeDetection()

        this.wakeHandler = () => {
            if (document.visibilityState !== "visible") return
            if (this.intentionalClose) return

            // Check if the WebSocket is dead (CLOSED or CLOSING)
            if (!this.ws || this.ws.readyState >= WebSocket.CLOSING) {
                logger.info("[Monitor WS] Wake detected — reconnecting immediately")
                this.reconnectAttempts = 0 // Reset backoff for fresh start
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout)
                    this.reconnectTimeout = null
                }
                this.connect(this.url).catch(() => {})
            }
        }

        document.addEventListener("visibilitychange", this.wakeHandler)
    }

    private stopWakeDetection(): void {
        if (this.wakeHandler && typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this.wakeHandler)
            this.wakeHandler = null
        }
    }

    // ─── Control Methods (called by UI fader interactions) ───

    setBusMaster(busIndex: number, value: number): void {
        this.send({ type: "set_bus_master", busIndex, value })
    }

    setSendLevel(busIndex: number, channelIndex: number, value: number): void {
        this.send({ type: "set_send_level", busIndex, channelIndex, value })
    }

    setSendOn(busIndex: number, channelIndex: number, on: boolean): void {
        this.send({ type: "set_send_on", busIndex, channelIndex, value: on })
    }

    setMatrixFader(matrixIndex: number, value: number): void {
        this.send({ type: "set_matrix_fader", matrixIndex, value })
    }

    setMatrixOn(matrixIndex: number, on: boolean): void {
        this.send({ type: "set_matrix_on", matrixIndex, value: on })
    }

    requestState(): void {
        this.send({ type: "request_state" })
    }
}
