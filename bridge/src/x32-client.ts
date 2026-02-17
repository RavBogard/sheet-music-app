/**
 * X32 OSC Client
 * 
 * Handles bidirectional communication with the Behringer X32 mixer via OSC over UDP.
 * 
 * Key X32 OSC behaviors:
 * - Send an address with NO args → X32 replies with current value
 * - Send an address WITH args → X32 sets the value
 * - Send `/xremote` every 10s to subscribe to live parameter changes
 * - X32 echoes parameter changes from any source (console, Mixing Station, etc.)
 */

import * as dgram from "dgram"
import { EventEmitter } from "events"
import { ChannelInfo, BusInfo, BusSend } from "./types"

// OSC message encoding/decoding helpers
function padTo4(len: number): number {
    return len + (4 - (len % 4)) % 4
}

function encodeOSCString(str: string): Buffer {
    const buf = Buffer.alloc(padTo4(str.length + 1))
    buf.write(str, "ascii")
    return buf
}

function encodeOSCFloat(val: number): Buffer {
    const buf = Buffer.alloc(4)
    buf.writeFloatBE(val, 0)
    return buf
}

function encodeOSCInt(val: number): Buffer {
    const buf = Buffer.alloc(4)
    buf.writeInt32BE(val, 0)
    return buf
}

function buildOSCMessage(address: string, args: Array<{ type: "f" | "i" | "s"; value: number | string }>): Buffer {
    const addressBuf = encodeOSCString(address)
    
    if (args.length === 0) {
        // Query: just send address with no type tag
        return addressBuf
    }

    const typeTag = "," + args.map(a => a.type).join("")
    const typeTagBuf = encodeOSCString(typeTag)

    const argBufs = args.map(a => {
        if (a.type === "f") return encodeOSCFloat(a.value as number)
        if (a.type === "i") return encodeOSCInt(a.value as number)
        if (a.type === "s") return encodeOSCString(a.value as string)
        return Buffer.alloc(0)
    })

    return Buffer.concat([addressBuf, typeTagBuf, ...argBufs])
}

interface ParsedOSCMessage {
    address: string
    args: Array<{ type: string; value: number | string }>
}

function parseOSCMessage(buf: Buffer): ParsedOSCMessage | null {
    try {
        let offset = 0

        // Read address
        const addressEnd = buf.indexOf(0, offset)
        if (addressEnd === -1) return null
        const address = buf.toString("ascii", offset, addressEnd)
        offset = padTo4(addressEnd + 1)

        // Read type tag
        if (offset >= buf.length || buf[offset] !== 0x2C) {
            return { address, args: [] }
        }
        const typeTagEnd = buf.indexOf(0, offset)
        if (typeTagEnd === -1) return { address, args: [] }
        const typeTag = buf.toString("ascii", offset + 1, typeTagEnd) // skip comma
        offset = padTo4(typeTagEnd + 1)

        // Read args based on type tag
        const args: Array<{ type: string; value: number | string }> = []
        for (const t of typeTag) {
            if (offset >= buf.length) break
            if (t === "f") {
                args.push({ type: "f", value: buf.readFloatBE(offset) })
                offset += 4
            } else if (t === "i") {
                args.push({ type: "i", value: buf.readInt32BE(offset) })
                offset += 4
            } else if (t === "s") {
                const strEnd = buf.indexOf(0, offset)
                const str = buf.toString("ascii", offset, strEnd === -1 ? buf.length : strEnd)
                args.push({ type: "s", value: str })
                offset = padTo4((strEnd === -1 ? buf.length : strEnd) + 1)
            }
        }

        return { address, args }
    } catch {
        return null
    }
}

// ─── X32 Client ───

export interface X32ClientOptions {
    address: string
    port: number
}

export class X32Client extends EventEmitter {
    private socket: dgram.Socket
    private address: string
    private port: number
    private xremoteInterval: ReturnType<typeof setInterval> | null = null
    private healthCheckInterval: ReturnType<typeof setInterval> | null = null
    private lastMessageAt: number = 0
    private connected = false
    private reconnecting = false
    private pendingCallbacks = new Map<string, (msg: ParsedOSCMessage) => void>()

    // Cached mixer state
    channels: ChannelInfo[] = []
    buses: BusInfo[] = []

    constructor(options: X32ClientOptions) {
        super()
        this.address = options.address
        this.port = options.port
        this.socket = dgram.createSocket("udp4")

        this.socket.on("message", (buf) => {
            const msg = parseOSCMessage(buf)
            if (!msg) return
            this.lastMessageAt = Date.now()
            this.handleMessage(msg)
        })

        this.socket.on("error", (err) => {
            console.error("[X32] Socket error:", err.message)
            this.emit("error", err)
        })
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.bind(0, () => {
                console.log(`[X32] UDP socket bound on port ${this.socket.address().port}`)

                // Test connection by requesting /xinfo
                this.send("/xinfo")
                
                const timeout = setTimeout(() => {
                    reject(new Error(`[X32] Connection timeout — no response from ${this.address}:${this.port}`))
                }, 5000)

                const handler = (msg: ParsedOSCMessage) => {
                    if (msg.address === "/xinfo") {
                        clearTimeout(timeout)
                        this.connected = true
                        const name = msg.args[1]?.value || "X32"
                        console.log(`[X32] Connected to ${name} at ${this.address}:${this.port}`)
                        this.startXRemote()
                        resolve()
                    }
                }
                this.once("raw_message", handler)
            })
        })
    }

    disconnect(): void {
        if (this.xremoteInterval) {
            clearInterval(this.xremoteInterval)
            this.xremoteInterval = null
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval)
            this.healthCheckInterval = null
        }
        this.connected = false
        this.reconnecting = false
        this.socket.close()
        console.log("[X32] Disconnected")
    }

    private startXRemote(): void {
        // Send /xremote every 8s (X32 requires renewal within 10s)
        this.send("/xremote")
        this.xremoteInterval = setInterval(() => {
            this.send("/xremote")
        }, 8000)

        // Health check: if no message received in 15s, X32 is gone
        this.startHealthCheck()
    }

    private startHealthCheck(): void {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)

        this.healthCheckInterval = setInterval(() => {
            if (!this.connected) return
            const silent = Date.now() - this.lastMessageAt

            // X32 sends /xremote responses every 8s. If we haven't heard
            // anything in 20s, the mixer is unreachable.
            if (silent > 20000) {
                console.warn("[X32] No response in 20s — marking disconnected")
                this.connected = false
                this.emit("disconnected")
                this.attemptReconnect()
            }
        }, 5000)
    }

    private async attemptReconnect(): Promise<void> {
        if (this.reconnecting) return
        this.reconnecting = true

        const MAX_ATTEMPTS = 60  // Try for ~10 minutes
        const INTERVAL = 10000   // Every 10 seconds

        for (let i = 1; i <= MAX_ATTEMPTS; i++) {
            console.log(`[X32] Reconnect attempt ${i}/${MAX_ATTEMPTS}...`)

            try {
                // Send /xinfo and wait for response
                const responded = await new Promise<boolean>((resolve) => {
                    const timeout = setTimeout(() => resolve(false), 5000)
                    const handler = (msg: ParsedOSCMessage) => {
                        if (msg.address === "/xinfo") {
                            clearTimeout(timeout)
                            resolve(true)
                        }
                    }
                    this.once("raw_message", handler)
                    this.send("/xinfo")
                })

                if (responded) {
                    this.connected = true
                    this.lastMessageAt = Date.now()
                    this.reconnecting = false
                    console.log("[X32] ✓ Reconnected!")
                    this.emit("reconnected")
                    return
                }
            } catch {
                // Ignore, will retry
            }

            // Wait before next attempt
            await new Promise(r => setTimeout(r, INTERVAL))
        }

        this.reconnecting = false
        console.error("[X32] ✗ Failed to reconnect after 10 minutes. Will keep trying via /xremote.")
    }

    private send(address: string, args: Array<{ type: "f" | "i" | "s"; value: number | string }> = []): void {
        const buf = buildOSCMessage(address, args)
        this.socket.send(buf, 0, buf.length, this.port, this.address)
    }

    private handleMessage(msg: ParsedOSCMessage): void {
        this.emit("raw_message", msg)

        // Check for pending callback (query response)
        const cb = this.pendingCallbacks.get(msg.address)
        if (cb) {
            this.pendingCallbacks.delete(msg.address)
            cb(msg)
        }

        // Route parameter changes to state and emit events
        this.routeParameterChange(msg)
    }

    private routeParameterChange(msg: ParsedOSCMessage): void {
        // Channel name: /ch/01/config/name
        const chNameMatch = msg.address.match(/^\/ch\/(\d+)\/config\/name$/)
        if (chNameMatch && msg.args[0]?.type === "s") {
            const idx = parseInt(chNameMatch[1])
            const ch = this.channels.find(c => c.index === idx)
            if (ch) ch.name = msg.args[0].value as string
            return
        }

        // Bus name: /bus/01/config/name
        const busNameMatch = msg.address.match(/^\/bus\/(\d+)\/config\/name$/)
        if (busNameMatch && msg.args[0]?.type === "s") {
            const idx = parseInt(busNameMatch[1])
            const bus = this.buses.find(b => b.index === idx)
            if (bus) bus.name = msg.args[0].value as string
            return
        }

        // Bus master fader: /bus/01/mix/fader
        const busFaderMatch = msg.address.match(/^\/bus\/(\d+)\/mix\/fader$/)
        if (busFaderMatch && msg.args[0]?.type === "f") {
            const idx = parseInt(busFaderMatch[1])
            const bus = this.buses.find(b => b.index === idx)
            if (bus) {
                bus.fader = msg.args[0].value as number
                this.emit("bus_fader", idx, bus.fader)
            }
            return
        }

        // Channel→Bus send level: /ch/01/mix/01/level
        const sendLevelMatch = msg.address.match(/^\/ch\/(\d+)\/mix\/(\d+)\/level$/)
        if (sendLevelMatch && msg.args[0]?.type === "f") {
            const chIdx = parseInt(sendLevelMatch[1])
            const busIdx = parseInt(sendLevelMatch[2])
            const bus = this.buses.find(b => b.index === busIdx)
            if (bus) {
                const send = bus.sends.find(s => s.channelIndex === chIdx)
                if (send) {
                    send.level = msg.args[0].value as number
                    this.emit("send_level", busIdx, chIdx, send.level)
                }
            }
            return
        }

        // Channel→Bus send on/off: /ch/01/mix/01/on
        const sendOnMatch = msg.address.match(/^\/ch\/(\d+)\/mix\/(\d+)\/on$/)
        if (sendOnMatch && msg.args[0]) {
            const chIdx = parseInt(sendOnMatch[1])
            const busIdx = parseInt(sendOnMatch[2])
            const bus = this.buses.find(b => b.index === busIdx)
            if (bus) {
                const send = bus.sends.find(s => s.channelIndex === chIdx)
                if (send) {
                    send.on = (msg.args[0].value as number) === 1
                    this.emit("send_on", busIdx, chIdx, send.on)
                }
            }
            return
        }
    }

    // ─── Queries (request current values) ───

    private query(address: string): Promise<ParsedOSCMessage> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingCallbacks.delete(address)
                reject(new Error(`Query timeout: ${address}`))
            }, 2000)

            this.pendingCallbacks.set(address, (msg) => {
                clearTimeout(timeout)
                resolve(msg)
            })

            this.send(address)
        })
    }

    async queryChannelName(ch: number): Promise<string> {
        const addr = `/ch/${String(ch).padStart(2, "0")}/config/name`
        const msg = await this.query(addr)
        return (msg.args[0]?.value as string) || `Ch ${ch}`
    }

    async queryBusName(bus: number): Promise<string> {
        const addr = `/bus/${String(bus).padStart(2, "0")}/config/name`
        const msg = await this.query(addr)
        return (msg.args[0]?.value as string) || `Bus ${bus}`
    }

    async queryBusFader(bus: number): Promise<number> {
        const addr = `/bus/${String(bus).padStart(2, "0")}/mix/fader`
        const msg = await this.query(addr)
        return (msg.args[0]?.value as number) || 0
    }

    async querySendLevel(ch: number, bus: number): Promise<number> {
        const addr = `/ch/${String(ch).padStart(2, "0")}/mix/${String(bus).padStart(2, "0")}/level`
        const msg = await this.query(addr)
        return (msg.args[0]?.value as number) || 0
    }

    async querySendOn(ch: number, bus: number): Promise<boolean> {
        const addr = `/ch/${String(ch).padStart(2, "0")}/mix/${String(bus).padStart(2, "0")}/on`
        const msg = await this.query(addr)
        return (msg.args[0]?.value as number) === 1
    }

    // ─── Commands (set values on X32) ───

    setBusFader(bus: number, value: number): void {
        const addr = `/bus/${String(bus).padStart(2, "0")}/mix/fader`
        this.send(addr, [{ type: "f", value: Math.max(0, Math.min(1, value)) }])
    }

    setSendLevel(ch: number, bus: number, value: number): void {
        const addr = `/ch/${String(ch).padStart(2, "0")}/mix/${String(bus).padStart(2, "0")}/level`
        this.send(addr, [{ type: "f", value: Math.max(0, Math.min(1, value)) }])
    }

    setSendOn(ch: number, bus: number, on: boolean): void {
        const addr = `/ch/${String(ch).padStart(2, "0")}/mix/${String(bus).padStart(2, "0")}/on`
        this.send(addr, [{ type: "i", value: on ? 1 : 0 }])
    }

    // ─── Full State Sync ───

    async syncFullState(monitorBuses: number[]): Promise<void> {
        console.log("[X32] Syncing full mixer state...")

        // Read all 32 channel names
        this.channels = []
        for (let ch = 1; ch <= 32; ch++) {
            try {
                const name = await this.queryChannelName(ch)
                this.channels.push({ index: ch, name, color: 0 })
            } catch {
                this.channels.push({ index: ch, name: `Ch ${ch}`, color: 0 })
            }
        }
        console.log(`[X32] Read ${this.channels.length} channel names`)

        // Read bus state for monitor buses
        this.buses = []
        for (const busIdx of monitorBuses) {
            try {
                const name = await this.queryBusName(busIdx)
                const fader = await this.queryBusFader(busIdx)

                // Read all 32 channel sends for this bus
                const sends: BusSend[] = []
                for (let ch = 1; ch <= 32; ch++) {
                    try {
                        const level = await this.querySendLevel(ch, busIdx)
                        const on = await this.querySendOn(ch, busIdx)
                        sends.push({ channelIndex: ch, level, on })
                    } catch {
                        sends.push({ channelIndex: ch, level: 0, on: false })
                    }
                }

                this.buses.push({ index: busIdx, name, fader, sends })
            } catch {
                this.buses.push({ index: busIdx, name: `Bus ${busIdx}`, fader: 0, sends: [] })
            }
        }
        console.log(`[X32] Read ${this.buses.length} bus states with send levels`)
        this.emit("state_synced")
    }

    isConnected(): boolean {
        return this.connected
    }

    /**
     * Discover an X32 on the local network by broadcasting /xinfo to the
     * subnet broadcast address on port 10023. Returns the IP + model name
     * of the first X32 that responds, or null on timeout.
     */
    static async discover(timeoutMs = 5000, port = 10023): Promise<{ address: string; name: string; model: string; firmware: string } | null> {
        return new Promise((resolve) => {
            const sock = dgram.createSocket({ type: "udp4", reuseAddr: true })
            let found = false

            const timer = setTimeout(() => {
                if (!found) {
                    sock.close()
                    resolve(null)
                }
            }, timeoutMs)

            sock.on("message", (buf, rinfo) => {
                const msg = parseOSCMessage(buf)
                if (msg && msg.address === "/xinfo" && !found) {
                    found = true
                    clearTimeout(timer)
                    const result = {
                        address: rinfo.address,
                        name: (msg.args[1]?.value as string) || "X32",
                        model: (msg.args[2]?.value as string) || "unknown",
                        firmware: (msg.args[3]?.value as string) || "unknown",
                    }
                    sock.close()
                    resolve(result)
                }
            })

            sock.bind(0, () => {
                sock.setBroadcast(true)
                const xinfoMsg = buildOSCMessage("/xinfo", [])
                // Broadcast to 255.255.255.255 — works on most LAN configs
                sock.send(xinfoMsg, 0, xinfoMsg.length, port, "255.255.255.255")
                // Also try common subnet broadcasts
                try {
                    const os = require("os")
                    const ifaces = os.networkInterfaces()
                    for (const name of Object.keys(ifaces)) {
                        for (const iface of ifaces[name]) {
                            if (iface.family === "IPv4" && !iface.internal) {
                                // Calculate broadcast: IP | ~netmask
                                const ipParts = iface.address.split(".").map(Number)
                                const maskParts = iface.netmask.split(".").map(Number)
                                const broadcast = ipParts.map((p: number, i: number) => p | (~maskParts[i] & 255)).join(".")
                                if (broadcast !== "255.255.255.255") {
                                    sock.send(xinfoMsg, 0, xinfoMsg.length, port, broadcast)
                                }
                            }
                        }
                    }
                } catch {
                    // Fallback: global broadcast already sent
                }
            })
        })
    }
}
