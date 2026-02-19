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
 * 
 * Authorization:
 * - Musicians: control their own assigned bus only
 * - Sound Engineers: control any bus + all 6 matrix outputs
 * - Musicians get bus-specific updates; engineers get everything
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
    busIndex: number | null      // Which bus this user is assigned to
    isSoundEngineer: boolean     // Can control matrix outputs + any bus
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
                    console.log(`[WS] Client disconnected: ${client.uid} (bus ${client.busIndex}${client.isSoundEngineer ? ", engineer" : ""})`)
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
                const newBus = this.config.getUserBus(client.uid)

                if (newBus !== client.busIndex) {
                    client.busIndex = newBus
                    // Send updated state with new bus assignment
                    this.sendSnapshot(ws)
                }
            }

            // Broadcast config update to all clients
            this.broadcast({ type: "config_update", config: newConfig })
        })
    }

    private setupX32Listeners(): void {
        // Bus master fader changes → send to users on that bus + all engineers
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

        // Matrix fader changes → broadcast to all sound engineers
        this.x32.on("matrix_fader", (matrixIndex: number, value: number) => {
            this.broadcastToEngineers({
                type: "matrix_update",
                matrixIndex,
                field: "fader",
                value,
            })
        })

        // Matrix on/off changes → broadcast to all sound engineers
        this.x32.on("matrix_on", (matrixIndex: number, on: boolean) => {
            this.broadcastToEngineers({
                type: "matrix_update",
                matrixIndex,
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

            if (!this.config.isAuthorized(user.uid, user.role, user.soundEngineer)) {
                this.sendTo(ws, { type: "error", message: "Not authorized for monitor access" })
                ws.close()
                return
            }

            clearTimeout(authTimeout)

            const busIndex = this.config.getUserBus(user.uid)
            // Admins and sound engineers both get full engineer controls
            const isSoundEngineer = user.soundEngineer === true || user.role === "admin"
            this.clients.set(ws, { ws, uid: user.uid, busIndex, isSoundEngineer })

            console.log(`[WS] Authenticated: ${user.uid} → bus ${busIndex}${isSoundEngineer ? " (sound engineer)" : ""}`)

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
            // Sound engineers can control any bus; musicians only their own
            if (!client.isSoundEngineer && client.busIndex !== msg.busIndex) {
                this.sendTo(ws, { type: "error", message: "Not your bus" })
                return
            }
            this.x32.setBusFader(msg.busIndex, msg.value)
            return
        }

        // ── Set channel send level ──
        if (msg.type === "set_send_level") {
            if (!client.isSoundEngineer && client.busIndex !== msg.busIndex) {
                this.sendTo(ws, { type: "error", message: "Not your bus" })
                return
            }
            this.x32.setSendLevel(msg.channelIndex, msg.busIndex, msg.value)
            return
        }

        // ── Set channel send on/off ──
        if (msg.type === "set_send_on") {
            if (!client.isSoundEngineer && client.busIndex !== msg.busIndex) {
                this.sendTo(ws, { type: "error", message: "Not your bus" })
                return
            }
            this.x32.setSendOn(msg.channelIndex, msg.busIndex, msg.value)
            return
        }

        // ── Set matrix fader (sound engineers only) ──
        if (msg.type === "set_matrix_fader") {
            if (!client.isSoundEngineer) {
                this.sendTo(ws, { type: "error", message: "Matrix control requires sound engineer access" })
                return
            }
            this.x32.setMatrixFader(msg.matrixIndex, msg.value)
            return
        }

        // ── Set matrix on/off (sound engineers only) ──
        if (msg.type === "set_matrix_on") {
            if (!client.isSoundEngineer) {
                this.sendTo(ws, { type: "error", message: "Matrix control requires sound engineer access" })
                return
            }
            this.x32.setMatrixOn(msg.matrixIndex, msg.value)
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
            matrices: this.x32.matrices,
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

    /**
     * Send to clients assigned to this bus AND all sound engineers.
     * Engineers need to see all bus activity for monitoring.
     */
    private broadcastToBusClients(busIndex: number, msg: ServerMessage): void {
        for (const [ws, client] of this.clients) {
            if (client.busIndex === busIndex || client.isSoundEngineer) {
                this.sendTo(ws, msg)
            }
        }
    }

    /**
     * Send only to sound engineer clients (matrix updates, etc.)
     */
    private broadcastToEngineers(msg: ServerMessage): void {
        for (const [ws, client] of this.clients) {
            if (client.isSoundEngineer) {
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
