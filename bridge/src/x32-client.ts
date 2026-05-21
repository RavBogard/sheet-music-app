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
import { ChannelInfo, BusInfo, BusSend, MatrixInfo } from "./types"

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
    private keepaliveInterval: ReturnType<typeof setInterval> | null = null
    private lastMessageAt: number = 0
    private connected = false
    private reconnecting = false
    private shouldStopReconnecting = false
    currentBackoff: number = 2000 // Exposed for testing; starts at 2s
    private static readonly INITIAL_BACKOFF = 2000
    private static readonly MAX_BACKOFF = 60000
    private pendingCallbacks = new Map<string, (msg: ParsedOSCMessage) => void>()

    // Cached mixer state
    channels: ChannelInfo[] = []
    buses: BusInfo[] = []
    matrices: MatrixInfo[] = []

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
        this.stopReconnecting()
        if (this.xremoteInterval) {
            clearInterval(this.xremoteInterval)
            this.xremoteInterval = null
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval)
            this.healthCheckInterval = null
        }
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval)
            this.keepaliveInterval = null
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

        // Keepalive + response-based liveness check (BR-02)
        this.startKeepalive()
        this.startHealthCheck()
    }

    /**
     * Periodic /xinfo keepalive (BR-02).
     *
     * The X32 does NOT echo /xremote (it's a one-way subscription renewal),
     * so on a quiet console — no fader/param activity — there is zero inbound
     * traffic. The old health check inferred liveness purely from incidental
     * traffic, so an idle-but-healthy mixer looked "disconnected" after 20s,
     * triggering a needless reconnect + full `syncFullState` resync roughly
     * every 20s.
     *
     * /xinfo IS answered by the X32 (it's how connect()/discover() probe it),
     * so querying it on a short interval actively solicits a response whenever
     * the mixer is alive. The response bumps `lastMessageAt` (handleMessage,
     * via the socket "message" handler), turning the silence-based health
     * check below into a true response-based liveness probe.
     */
    private startKeepalive(): void {
        if (this.keepaliveInterval) clearInterval(this.keepaliveInterval)
        // Probe once now so liveness is fresh immediately, then every 8s.
        // With the 20s health window this tolerates a single dropped response.
        this.send("/xinfo")
        this.keepaliveInterval = setInterval(() => {
            this.send("/xinfo")
        }, 8000)
    }

    private startHealthCheck(): void {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)

        this.healthCheckInterval = setInterval(() => {
            if (!this.connected) return
            const silent = Date.now() - this.lastMessageAt

            // The /xinfo keepalive (startKeepalive) actively solicits a
            // response every 8s, and any inbound OSC — keepalive echo OR real
            // param traffic — refreshes lastMessageAt. So 20s of total silence
            // means ~2+ missed keepalives: the mixer is genuinely unreachable,
            // not merely idle.
            if (silent > 20000) {
                console.warn("[X32] No response to keepalive in 20s — marking disconnected")
                this.connected = false
                this.emit("disconnected")
                this.attemptReconnect()
            }
        }, 5000)
    }

    /**
     * Stop the reconnection loop. Called on bridge shutdown/destroy.
     */
    stopReconnecting(): void {
        this.shouldStopReconnecting = true
    }

    private async attemptReconnect(): Promise<void> {
        if (this.reconnecting) return
        this.reconnecting = true
        this.shouldStopReconnecting = false
        this.currentBackoff = X32Client.INITIAL_BACKOFF

        let attempt = 0
        while (!this.shouldStopReconnecting) {
            attempt++
            console.log(`[X32] Reconnect attempt ${attempt} (backoff: ${this.currentBackoff}ms)...`)

            try {
                // Send /xinfo and wait for response with 5s timeout
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
                    this.currentBackoff = X32Client.INITIAL_BACKOFF
                    console.log("[X32] Reconnected!")
                    this.emit("reconnected")
                    return
                }
            } catch {
                // Ignore, will retry
            }

            if (this.shouldStopReconnecting) break

            // Wait with exponential backoff before next attempt
            await new Promise(r => setTimeout(r, this.currentBackoff))

            // Double the backoff, capped at MAX_BACKOFF
            this.currentBackoff = Math.min(
                this.currentBackoff * 2,
                X32Client.MAX_BACKOFF,
            )
        }

        this.reconnecting = false
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

        // Matrix name: /mtx/01/config/name
        const mtxNameMatch = msg.address.match(/^\/mtx\/(\d+)\/config\/name$/)
        if (mtxNameMatch && msg.args[0]?.type === "s") {
            const idx = parseInt(mtxNameMatch[1])
            const mtx = this.matrices.find(m => m.index === idx)
            if (mtx) mtx.name = msg.args[0].value as string
            return
        }

        // Matrix fader: /mtx/01/mix/fader
        const mtxFaderMatch = msg.address.match(/^\/mtx\/(\d+)\/mix\/fader$/)
        if (mtxFaderMatch && msg.args[0]?.type === "f") {
            const idx = parseInt(mtxFaderMatch[1])
            const mtx = this.matrices.find(m => m.index === idx)
            if (mtx) {
                mtx.fader = msg.args[0].value as number
                this.emit("matrix_fader", idx, mtx.fader)
            }
            return
        }

        // Matrix on/off: /mtx/01/mix/on
        const mtxOnMatch = msg.address.match(/^\/mtx\/(\d+)\/mix\/on$/)
        if (mtxOnMatch && msg.args[0]) {
            const idx = parseInt(mtxOnMatch[1])
            const mtx = this.matrices.find(m => m.index === idx)
            if (mtx) {
                mtx.on = (msg.args[0].value as number) === 1
                this.emit("matrix_on", idx, mtx.on)
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

    async queryMatrixName(mtx: number): Promise<string> {
        const addr = `/mtx/${String(mtx).padStart(2, "0")}/config/name`
        const msg = await this.query(addr)
        return (msg.args[0]?.value as string) || `Matrix ${mtx}`
    }

    async queryMatrixFader(mtx: number): Promise<number> {
        const addr = `/mtx/${String(mtx).padStart(2, "0")}/mix/fader`
        const msg = await this.query(addr)
        return (msg.args[0]?.value as number) || 0
    }

    async queryMatrixOn(mtx: number): Promise<boolean> {
        const addr = `/mtx/${String(mtx).padStart(2, "0")}/mix/on`
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

    setMatrixFader(mtx: number, value: number): void {
        const addr = `/mtx/${String(mtx).padStart(2, "0")}/mix/fader`
        this.send(addr, [{ type: "f", value: Math.max(0, Math.min(1, value)) }])
    }

    setMatrixOn(mtx: number, on: boolean): void {
        const addr = `/mtx/${String(mtx).padStart(2, "0")}/mix/on`
        this.send(addr, [{ type: "i", value: on ? 1 : 0 }])
    }

    // ─── Full State Sync ───

    async syncFullState(monitorBuses: number[]): Promise<void> {
        const start = Date.now()
        console.log("[X32] Syncing full mixer state (parallel)...")

        // ── Channel names: all 32 in parallel ──
        const channelPromises = Array.from({ length: 32 }, (_, i) => {
            const ch = i + 1
            return this.queryChannelName(ch)
                .then(name => ({ index: ch, name, color: 0 }))
                .catch(() => ({ index: ch, name: `Ch ${ch}`, color: 0 }))
        })
        this.channels = await Promise.all(channelPromises)
        console.log(`[X32] Read ${this.channels.length} channel names`)

        // ── Bus state: all buses + their sends in parallel ──
        const busPromises = monitorBuses.map(async (busIdx) => {
            try {
                // Bus name + fader in parallel
                const [name, fader] = await Promise.all([
                    this.queryBusName(busIdx).catch(() => `Bus ${busIdx}`),
                    this.queryBusFader(busIdx).catch(() => 0),
                ])

                // All 32 channel sends: level + on for each channel in parallel
                const sendPromises = Array.from({ length: 32 }, (_, i) => {
                    const ch = i + 1
                    return Promise.all([
                        this.querySendLevel(ch, busIdx).catch(() => 0),
                        this.querySendOn(ch, busIdx).catch(() => false),
                    ]).then(([level, on]) => ({ channelIndex: ch, level, on }))
                })
                const sends: BusSend[] = await Promise.all(sendPromises)

                return { index: busIdx, name, fader, sends }
            } catch {
                return { index: busIdx, name: `Bus ${busIdx}`, fader: 0, sends: [] as BusSend[] }
            }
        })
        this.buses = await Promise.all(busPromises)

        const elapsed = Date.now() - start
        console.log(`[X32] Read ${this.buses.length} bus states with send levels (${elapsed}ms)`)

        // ── Matrix outputs: all 6 in parallel ──
        const matrixPromises = Array.from({ length: 6 }, (_, i) => {
            const mtx = i + 1
            return Promise.all([
                this.queryMatrixName(mtx).catch(() => `Matrix ${mtx}`),
                this.queryMatrixFader(mtx).catch(() => 0),
                this.queryMatrixOn(mtx).catch(() => true),
            ]).then(([name, fader, on]) => ({ index: mtx, name, fader, on }))
        })
        this.matrices = await Promise.all(matrixPromises)

        const totalElapsed = Date.now() - start
        console.log(`[X32] Read ${this.matrices.length} matrix outputs (${totalElapsed}ms total)`)
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
