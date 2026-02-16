/**
 * WebSocket Server
 * 
 * Handles iPad connections from the CentralReform web app.
 * 
 * Connection flow:
 * 1. iPad connects via WebSocket
 * 2. iPad sends { type: "auth", token: "<firebase_id_token>" }
 * 3. Bridge verifies token, checks authorization
 * 4. Bridge sends full mixer state snapshot
 * 5. Bidirectional fader updates flow in real-time
 */

import { WebSocketServer, WebSocket } from "ws"
import { IncomingMessage } from "http"
import { X32Client } from "./x32-client"
import { ConfigManager } from "./config"
import {
    ServerMessage,
    ClientMessage,
    MixerSnapshot,
} from "./types"

interface AuthenticatedClient {
    ws: WebSocket
    uid: string
    busIndex: number | null  // Which bus this user is assigned to
}

export class BridgeWSServer {
    private wss: WebSocketServer
    private clients = new Map<WebSocket, AuthenticatedClient>()
    private x32: X32Client
    private config: ConfigManager

    constructor(port: number, x32: X32Client, config: ConfigManager) {
        this.x32 = x32
        this.config = config

        this.wss = new WebSocketServer({
            port,
            perMessageDeflate: false,  // Reduce latency
        })

        console.log(`[WS] Server listening on port ${port}`)

        this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
            const ip = req.socket.remoteAddress || "unknown"
            console.log(`[WS] New connection from ${ip}`)

            // Set a 10s auth timeout
            const authTimeout = setTimeout(() => {
                if (!this.clients.has(ws)) {
                    this.sendTo(ws, { type: "error", message: "Auth timeout" })
                    ws.close()
                }
            }, 10000)

            ws.on("message", async (data) => {
                try {
                    const msg: ClientMessage = JSON.parse(data.toString())
                    await this.handleMessage(ws, msg, authTimeout)
                } catch (err) {
                    console.error("[WS] Invalid message:", err)
                }
            })

            ws.on("close", () => {
                const client = this.clients.get(ws)
                if (client) {
                    console.log(`[WS] Client disconnected: ${client.uid} (bus ${client.busIndex})`)
                }
                clearTimeout(authTimeout)
                this.clients.delete(ws)
            })

            ws.on("error", (err) => {
                console.error("[WS] Client error:", err.message)
                this.clients.delete(ws)
            })
        })

        // Listen for X32 parameter changes and broadcast to clients
        this.setupX32Listeners()

        // Listen for config changes and update client assignments
        this.config.onChange((newConfig) => {
            // Re-evaluate bus assignments
            for (const [ws, client] of this.clients) {
                const newBus = newConfig.busAssignments
                    ? this.config.getUserBus(client.uid)
                    : null

                // Check if still authorized
                if (!newConfig.authorizedUsers.includes(client.uid)) {
                    this.sendTo(ws, { type: "error", message: "Access revoked" })
                    ws.close()
                    this.clients.delete(ws)
                    continue
                }

                if (newBus !== client.busIndex) {
                    client.busIndex = newBus
                    // Send updated state
                    this.sendSnapshot(ws)
                }
            }

            // Broadcast config update
            this.broadcast({ type: "config_update", config: newConfig })
        })
    }

    private setupX32Listeners(): void {
        // Bus master fader changes
        this.x32.on("bus_fader", (busIndex: number, value: number) => {
            this.broadcastToBusClients(busIndex, {
                type: "fader_update",
                busIndex,
                field: "master",
                value,
            })
        })

        // Channel→bus send level changes
        this.x32.on("send_level", (busIndex: number, channelIndex: number, value: number) => {
            this.broadcastToBusClients(busIndex, {
                type: "send_update",
                busIndex,
                channelIndex,
                field: "level",
                value,
            })
        })

        // Channel→bus send on/off changes
        this.x32.on("send_on", (busIndex: number, channelIndex: number, on: boolean) => {
            this.broadcastToBusClients(busIndex, {
                type: "send_update",
                busIndex,
                channelIndex,
                field: "on",
                value: on,
            })
        })
    }

    private async handleMessage(ws: WebSocket, msg: ClientMessage, authTimeout: ReturnType<typeof setTimeout>): Promise<void> {
        // ── Auth ──
        if (msg.type === "auth") {
            const user = await this.config.verifyToken(msg.token)
            if (!user) {
                this.sendTo(ws, { type: "error", message: "Invalid auth token" })
                ws.close()
                return
            }

            if (!this.config.isAuthorized(user.uid)) {
                this.sendTo(ws, { type: "error", message: "Not authorized for monitor access" })
                ws.close()
                return
            }

            clearTimeout(authTimeout)

            const busIndex = this.config.getUserBus(user.uid)
            this.clients.set(ws, { ws, uid: user.uid, busIndex })

            console.log(`[WS] Authenticated: ${user.uid} → bus ${busIndex}`)

            this.sendTo(ws, { type: "auth_ok", userId: user.uid })
            this.sendSnapshot(ws)
            return
        }

        // All other messages require auth
        const client = this.clients.get(ws)
        if (!client) {
            this.sendTo(ws, { type: "error", message: "Not authenticated" })
            return
        }

        // ── Set bus master level ──
        if (msg.type === "set_bus_master") {
            // Verify the user is assigned to this bus
            if (client.busIndex !== msg.busIndex) {
                this.sendTo(ws, { type: "error", message: "Not your bus" })
                return
            }
            this.x32.setBusFader(msg.busIndex, msg.value)
            return
        }

        // ── Set channel send level ──
        if (msg.type === "set_send_level") {
            if (client.busIndex !== msg.busIndex) {
                this.sendTo(ws, { type: "error", message: "Not your bus" })
                return
            }
            this.x32.setSendLevel(msg.channelIndex, msg.busIndex, msg.value)
            return
        }

        // ── Set channel send on/off ──
        if (msg.type === "set_send_on") {
            if (client.busIndex !== msg.busIndex) {
                this.sendTo(ws, { type: "error", message: "Not your bus" })
                return
            }
            this.x32.setSendOn(msg.channelIndex, msg.busIndex, msg.value)
            return
        }

        // ── Request full state ──
        if (msg.type === "request_state") {
            this.sendSnapshot(ws)
            return
        }
    }

    private sendSnapshot(ws: WebSocket): void {
        const snapshot: MixerSnapshot = {
            channels: this.x32.channels,
            buses: this.x32.buses,
            config: this.config.getConfig(),
        }
        this.sendTo(ws, { type: "state", data: snapshot })
    }

    private sendTo(ws: WebSocket, msg: ServerMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg))
        }
    }

    private broadcast(msg: ServerMessage): void {
        for (const [ws] of this.clients) {
            this.sendTo(ws, msg)
        }
    }

    private broadcastToBusClients(busIndex: number, msg: ServerMessage): void {
        for (const [ws, client] of this.clients) {
            if (client.busIndex === busIndex) {
                this.sendTo(ws, msg)
            }
        }
    }

    getConnectedCount(): number {
        return this.clients.size
    }

    close(): void {
        this.wss.close()
    }
}
