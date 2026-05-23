/**
 * X32 Mock Server
 *
 * A minimal Node.js UDP server that emulates the Behringer X32 mixer's OSC interface.
 * Used for development and testing when the real X32 hardware is not available.
 *
 * Implements only the OSC addresses that the bridge actually uses:
 *   /xinfo              — Identify the mixer
 *   /xremote            — Subscription renewal (no response; the bridge sends every 8s)
 *   /ch/XX/config/name  — Channel name query
 *   /ch/XX/mix/YY/level — Channel→Bus send level get/set
 *   /ch/XX/mix/YY/on    — Channel→Bus send on/off get/set
 *   /bus/XX/config/name — Bus name query
 *   /bus/XX/mix/fader   — Bus master fader get/set
 *   /mtx/XX/config/name — Matrix name query
 *   /mtx/XX/mix/fader   — Matrix fader get/set
 *   /mtx/XX/mix/on      — Matrix on/off get/set
 *
 * ─── Fidelity to the real X32 (Monitor Overhaul P0-B1) ───
 * Two real-hardware behaviors are modeled here because they are load-bearing
 * for the bridge's correctness (see `.paul/research/monitor-overhaul/AUDIT-bridge.md`):
 *
 *   1. The X32 does NOT echo a client's OWN write back to that same client. A SET
 *      updates the mixer's value but the sender receives nothing; only OTHER
 *      subscribed clients get the parameter echo. This is the entire R1
 *      "read-of-own-write" bug class (AUDIT-bridge Part A R1 + B7): the bridge
 *      sends a SET, gets no echo, and — having no query-after-command yet —
 *      never refreshes its cache or `monitor-live/state`.
 *   2. The X32 only sends parameter echoes to clients holding an ACTIVE `/xremote`
 *      subscription, which expires (~10s) unless renewed. We track each
 *      subscriber's expiry; manual/external changes and other clients' writes
 *      reach a client only while its subscription is live.
 *
 * (The previous incarnation echoed every SET back to ALL clients unconditionally,
 * including the sender — which masked R1 from CI. That was AUDIT-bridge B7.)
 *
 * Usage (development):
 *   ts-node bridge/src/__tests__/x32-mock-server.ts
 *
 * Usage (from tests):
 *   const mock = new X32MockServer()
 *   await mock.start()
 *   // ... run tests ...
 *   await mock.stop()
 */

import * as dgram from "dgram"
import { EventEmitter } from "events"

// ─── OSC Encoding / Decoding ───────────────────────────────────────────────

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

/** Exported for mock-fidelity tests that drive raw OSC over loopback UDP. */
export function buildOSCMessage(
    address: string,
    args: Array<{ type: "f" | "i" | "s"; value: number | string }>
): Buffer {
    const addressBuf = encodeOSCString(address)

    if (args.length === 0) {
        return addressBuf
    }

    const typeTag = "," + args.map((a) => a.type).join("")
    const typeTagBuf = encodeOSCString(typeTag)
    const argBufs = args.map((a) => {
        if (a.type === "f") return encodeOSCFloat(a.value as number)
        if (a.type === "i") return encodeOSCInt(a.value as number)
        if (a.type === "s") return encodeOSCString(a.value as string)
        return Buffer.alloc(0)
    })

    return Buffer.concat([addressBuf, typeTagBuf, ...argBufs])
}

export interface ParsedOSCMessage {
    address: string
    args: Array<{ type: string; value: number | string }>
}

/** Exported for mock-fidelity tests that decode what the mock sent back. */
export function parseOSCMessage(buf: Buffer): ParsedOSCMessage | null {
    try {
        let offset = 0

        const addressEnd = buf.indexOf(0, offset)
        if (addressEnd === -1) return null
        const address = buf.toString("ascii", offset, addressEnd)
        offset = padTo4(addressEnd + 1)

        if (offset >= buf.length || buf[offset] !== 0x2c) {
            return { address, args: [] }
        }
        const typeTagEnd = buf.indexOf(0, offset)
        if (typeTagEnd === -1) return { address, args: [] }
        const typeTag = buf.toString("ascii", offset + 1, typeTagEnd)
        offset = padTo4(typeTagEnd + 1)

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
                const str = buf.toString(
                    "ascii",
                    offset,
                    strEnd === -1 ? buf.length : strEnd
                )
                args.push({ type: "s", value: str })
                offset = padTo4((strEnd === -1 ? buf.length : strEnd) + 1)
            }
        }

        return { address, args }
    } catch {
        return null
    }
}

// ─── Mock State ───────────────────────────────────────────────────────────

interface MockBusSend {
    channelIndex: number
    level: number
    on: boolean
}

interface MockBus {
    index: number
    name: string
    fader: number
    sends: MockBusSend[]
}

interface MockChannel {
    index: number
    name: string
}

interface MockMatrix {
    index: number
    name: string
    fader: number
    on: boolean
}

function buildDefaultState(): {
    channels: MockChannel[]
    buses: MockBus[]
    matrices: MockMatrix[]
} {
    // 32 channels
    const channels: MockChannel[] = Array.from({ length: 32 }, (_, i) => ({
        index: i + 1,
        name: `Ch ${i + 1}`,
    }))

    // 4 monitor buses with realistic names and sends for all 32 channels
    const buses: MockBus[] = [1, 2, 3, 4].map((busIdx) => ({
        index: busIdx,
        name:
            busIdx === 1
                ? "Worship"
                : busIdx === 2
                ? "Band"
                : busIdx === 3
                ? "Keys"
                : "Drums",
        fader: 0.75,
        sends: Array.from({ length: 32 }, (_, i) => ({
            channelIndex: i + 1,
            level: 0.5 + Math.random() * 0.3, // realistic starting levels
            on: true,
        })),
    }))

    // 6 matrix outputs
    const matrices: MockMatrix[] = Array.from({ length: 6 }, (_, i) => ({
        index: i + 1,
        name: `Matrix ${i + 1}`,
        fader: 0.7,
        on: true,
    }))

    return { channels, buses, matrices }
}

// ─── X32 Mock Server ──────────────────────────────────────────────────────

export interface X32MockServerOptions {
    port?: number              // defaults to 10023
    verbose?: boolean          // log all messages
    latencyMs?: number         // artificial response latency (simulate network)
    subscriptionTtlMs?: number // /xremote subscription lifetime; defaults to 10000 (real X32 ~10s)
}

export class X32MockServer extends EventEmitter {
    private socket: dgram.Socket | null = null
    private readonly port: number
    private readonly verbose: boolean
    private readonly latencyMs: number
    private readonly subscriptionTtlMs: number

    // Mocked mixer state
    channels: MockChannel[]
    buses: MockBus[]
    matrices: MockMatrix[]

    // ── Test instrumentation (opt-in; inert in normal use) ──
    // Peak number of value-read GET responses in flight at once. With
    // latencyMs > 0 each GET reply is held briefly, so a test can assert the
    // bridge throttles syncFullState (bounded concurrency) instead of flooding
    // the desk with ~320 simultaneous send queries.
    private inFlightQueries = 0
    maxConcurrentQueries = 0
    // address → remaining number of GET responses to silently drop, simulating
    // the X32 dropping a query under load. Exercises the bridge's read retry:
    // a dropped query times out, the bridge re-issues it, and (drops exhausted)
    // the desk answers — so the value confirms instead of being fabricated.
    readonly dropQueryResponses = new Map<string, number>()

    // ── /xremote subscription model (faithful to the real X32) ──
    // Maps a client key (`address:port`) → the epoch-ms timestamp at which its
    // /xremote subscription expires. A subscriber is "live" only while
    // Date.now() < expiry. Parameter echoes (other clients' writes + manual
    // desk moves) go ONLY to live subscribers, and NEVER back to the client
    // that originated a write (R1). Renewing (/xremote again) pushes the expiry
    // forward. The old mock kept a flat client list and echoed to everyone
    // unconditionally — including the sender — which masked R1 (AUDIT-bridge B7).
    private subscriptions: Map<string, number> = new Map()

    constructor(options: X32MockServerOptions = {}) {
        super()
        this.port = options.port ?? 10023
        this.verbose = options.verbose ?? false
        this.latencyMs = options.latencyMs ?? 0
        this.subscriptionTtlMs = options.subscriptionTtlMs ?? 10_000

        const state = buildDefaultState()
        this.channels = state.channels
        this.buses = state.buses
        this.matrices = state.matrices
    }

    /**
     * Start the mock server. Returns the actual port it bound to.
     */
    async start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true })

            this.socket.on("message", (buf, rinfo) => {
                const msg = parseOSCMessage(buf)
                if (!msg) return

                if (this.verbose) {
                    const argStr = msg.args
                        .map((a) => `${a.type}:${a.value}`)
                        .join(" ")
                    console.log(
                        `[X32Mock] <- ${msg.address}${argStr ? " " + argStr : ""} from ${rinfo.address}:${rinfo.port}`
                    )
                }

                // Test hook: a value-read GET (no args, /ch|/bus|/mtx) can be
                // silently dropped to simulate the X32 losing it under load.
                const isValueGet = msg.args.length === 0 && /^\/(ch|bus|mtx)\//.test(msg.address)
                if (isValueGet) {
                    const drops = this.dropQueryResponses.get(msg.address) ?? 0
                    if (drops > 0) {
                        this.dropQueryResponses.set(msg.address, drops - 1)
                        return // no response — the bridge's query() will time out
                    }
                }

                const respond = (out: Buffer) => {
                    const deliver = () => {
                        if (isValueGet) this.inFlightQueries--
                        this.sendTo(out, rinfo.address, rinfo.port)
                    }
                    if (isValueGet) {
                        this.inFlightQueries++
                        if (this.inFlightQueries > this.maxConcurrentQueries) {
                            this.maxConcurrentQueries = this.inFlightQueries
                        }
                    }
                    if (this.latencyMs > 0) {
                        setTimeout(deliver, this.latencyMs)
                    } else {
                        deliver()
                    }
                }

                this.handleMessage(msg, respond, rinfo)
            })

            this.socket.on("error", (err) => {
                console.error("[X32Mock] Socket error:", err)
                this.emit("error", err)
            })

            // Bind to the specified port, or any available port if 10023 is taken
            this.socket.bind(this.port === 10023 ? this.port : 0, () => {
                const actualPort = this.socket!.address().port
                if (this.verbose || true) {
                    console.log(`[X32Mock] X32 mock server listening on UDP port ${actualPort}`)
                }
                resolve(actualPort)
            })
        })
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.socket) {
                resolve()
                return
            }
            this.socket.close(() => {
                this.socket = null
                resolve()
            })
        })
    }

    private sendTo(buf: Buffer, address: string, port: number): void {
        if (!this.socket) return
        this.socket.send(buf, 0, buf.length, port, address, (err) => {
            if (err && this.verbose) {
                console.error(`[X32Mock] Send error to ${address}:${port}:`, err)
            }
        })
    }

    // ─── /xremote subscription helpers ────────────────────────────────────

    private clientKey(rinfo: dgram.RemoteInfo): string {
        return `${rinfo.address}:${rinfo.port}`
    }

    /**
     * The currently-live (non-expired) /xremote subscribers, optionally
     * excluding one client key (used to suppress own-write echoes). Expired
     * entries are pruned lazily here.
     */
    private liveSubscribers(excludeKey?: string): Array<{ address: string; port: number }> {
        const now = Date.now()
        const out: Array<{ address: string; port: number }> = []
        for (const [key, expiry] of this.subscriptions) {
            if (expiry <= now) {
                this.subscriptions.delete(key)
                continue
            }
            if (key === excludeKey) continue
            const colon = key.lastIndexOf(":")
            out.push({ address: key.slice(0, colon), port: Number(key.slice(colon + 1)) })
        }
        return out
    }

    /**
     * Echo a parameter message to every live /xremote subscriber, except the
     * optional originator (`excludeKey`). This is the ONLY echo path: own-writes
     * are silent to the sender; non-subscribers receive nothing.
     */
    private echoToSubscribers(buf: Buffer, excludeKey?: string): void {
        for (const client of this.liveSubscribers(excludeKey)) {
            this.sendTo(buf, client.address, client.port)
        }
    }

    /**
     * Simulate the X32 broadcasting a parameter change (as if someone touched
     * the console). On real hardware this reaches /xremote subscribers only.
     */
    broadcastBusFader(busIndex: number, value: number): void {
        const bus = this.buses.find((b) => b.index === busIndex)
        if (bus) bus.fader = value

        const addr = `/bus/${String(busIndex).padStart(2, "0")}/mix/fader`
        const msg = buildOSCMessage(addr, [{ type: "f", value }])
        this.echoToSubscribers(msg)
    }

    broadcastSendLevel(channelIndex: number, busIndex: number, value: number): void {
        const bus = this.buses.find((b) => b.index === busIndex)
        if (bus) {
            const send = bus.sends.find((s) => s.channelIndex === channelIndex)
            if (send) send.level = value
        }

        const addr = `/ch/${String(channelIndex).padStart(2, "0")}/mix/${String(busIndex).padStart(2, "0")}/level`
        const msg = buildOSCMessage(addr, [{ type: "f", value }])
        this.echoToSubscribers(msg)
    }

    // ─── Message Handling ─────────────────────────────────────────────────

    private handleMessage(
        msg: ParsedOSCMessage,
        respond: (buf: Buffer) => void,
        rinfo: dgram.RemoteInfo
    ): void {
        // /xinfo — identify mixer
        if (msg.address === "/xinfo") {
            const response = buildOSCMessage("/xinfo", [
                { type: "s", value: "192.168.1.1" },    // IP
                { type: "s", value: "X32-Mock" },         // Name
                { type: "s", value: "X32" },              // Model
                { type: "s", value: "3.18" },             // Firmware
            ])
            respond(response)
            return
        }

        // /xremote — subscription register/renew (X32 sends no response).
        // Registers the sender as a live subscriber for subscriptionTtlMs.
        if (msg.address === "/xremote") {
            this.subscriptions.set(this.clientKey(rinfo), Date.now() + this.subscriptionTtlMs)
            this.emit("xremote")
            return
        }

        // /ch/XX/config/name — channel name query
        const chNameMatch = msg.address.match(/^\/ch\/(\d+)\/config\/name$/)
        if (chNameMatch) {
            const idx = parseInt(chNameMatch[1])
            const ch = this.channels.find((c) => c.index === idx)
            const name = ch?.name ?? `Ch ${idx}`
            respond(buildOSCMessage(msg.address, [{ type: "s", value: name }]))
            return
        }

        // /bus/XX/config/name — bus name query
        const busNameMatch = msg.address.match(/^\/bus\/(\d+)\/config\/name$/)
        if (busNameMatch) {
            const idx = parseInt(busNameMatch[1])
            const bus = this.buses.find((b) => b.index === idx)
            const name = bus?.name ?? `Bus ${idx}`
            respond(buildOSCMessage(msg.address, [{ type: "s", value: name }]))
            return
        }

        // /bus/XX/mix/fader — bus master fader get/set
        const busFaderMatch = msg.address.match(/^\/bus\/(\d+)\/mix\/fader$/)
        if (busFaderMatch) {
            const idx = parseInt(busFaderMatch[1])
            const bus = this.buses.find((b) => b.index === idx)
            if (bus) {
                if (msg.args.length > 0 && msg.args[0].type === "f") {
                    // SET — update state; echo to OTHER subscribers, never the sender (R1)
                    const newVal = Math.max(0, Math.min(1, msg.args[0].value as number))
                    bus.fader = newVal
                    this.emit("bus_fader_set", idx, newVal)
                    const echo = buildOSCMessage(msg.address, [{ type: "f", value: newVal }])
                    this.echoToSubscribers(echo, this.clientKey(rinfo))
                } else {
                    // GET — reply with current value
                    respond(buildOSCMessage(msg.address, [{ type: "f", value: bus.fader }]))
                }
            }
            return
        }

        // /ch/XX/mix/YY/level — channel→bus send level get/set
        const sendLevelMatch = msg.address.match(/^\/ch\/(\d+)\/mix\/(\d+)\/level$/)
        if (sendLevelMatch) {
            const chIdx = parseInt(sendLevelMatch[1])
            const busIdx = parseInt(sendLevelMatch[2])
            const bus = this.buses.find((b) => b.index === busIdx)
            if (bus) {
                const send = bus.sends.find((s) => s.channelIndex === chIdx)
                if (send) {
                    if (msg.args.length > 0 && msg.args[0].type === "f") {
                        // SET — echo to OTHER subscribers, never the sender (R1)
                        const newVal = Math.max(0, Math.min(1, msg.args[0].value as number))
                        send.level = newVal
                        this.emit("send_level_set", chIdx, busIdx, newVal)
                        const echo = buildOSCMessage(msg.address, [{ type: "f", value: newVal }])
                        this.echoToSubscribers(echo, this.clientKey(rinfo))
                    } else {
                        // GET
                        respond(buildOSCMessage(msg.address, [{ type: "f", value: send.level }]))
                    }
                }
            }
            return
        }

        // /ch/XX/mix/YY/on — channel→bus send on/off get/set
        const sendOnMatch = msg.address.match(/^\/ch\/(\d+)\/mix\/(\d+)\/on$/)
        if (sendOnMatch) {
            const chIdx = parseInt(sendOnMatch[1])
            const busIdx = parseInt(sendOnMatch[2])
            const bus = this.buses.find((b) => b.index === busIdx)
            if (bus) {
                const send = bus.sends.find((s) => s.channelIndex === chIdx)
                if (send) {
                    if (msg.args.length > 0) {
                        // SET — echo to OTHER subscribers, never the sender (R1)
                        const newVal = (msg.args[0].value as number) === 1
                        send.on = newVal
                        this.emit("send_on_set", chIdx, busIdx, newVal)
                        const echo = buildOSCMessage(msg.address, [{ type: "i", value: newVal ? 1 : 0 }])
                        this.echoToSubscribers(echo, this.clientKey(rinfo))
                    } else {
                        // GET
                        respond(
                            buildOSCMessage(msg.address, [
                                { type: "i", value: send.on ? 1 : 0 },
                            ])
                        )
                    }
                }
            }
            return
        }

        // /mtx/XX/config/name — matrix name query
        const mtxNameMatch = msg.address.match(/^\/mtx\/(\d+)\/config\/name$/)
        if (mtxNameMatch) {
            const idx = parseInt(mtxNameMatch[1])
            const mtx = this.matrices.find((m) => m.index === idx)
            const name = mtx?.name ?? `Matrix ${idx}`
            respond(buildOSCMessage(msg.address, [{ type: "s", value: name }]))
            return
        }

        // /mtx/XX/mix/fader — matrix fader get/set
        const mtxFaderMatch = msg.address.match(/^\/mtx\/(\d+)\/mix\/fader$/)
        if (mtxFaderMatch) {
            const idx = parseInt(mtxFaderMatch[1])
            const mtx = this.matrices.find((m) => m.index === idx)
            if (mtx) {
                if (msg.args.length > 0 && msg.args[0].type === "f") {
                    // SET — echo to OTHER subscribers, never the sender (R1)
                    const newVal = Math.max(0, Math.min(1, msg.args[0].value as number))
                    mtx.fader = newVal
                    this.emit("matrix_fader_set", idx, newVal)
                    const echo = buildOSCMessage(msg.address, [{ type: "f", value: newVal }])
                    this.echoToSubscribers(echo, this.clientKey(rinfo))
                } else {
                    respond(buildOSCMessage(msg.address, [{ type: "f", value: mtx.fader }]))
                }
            }
            return
        }

        // /mtx/XX/mix/on — matrix on/off get/set
        const mtxOnMatch = msg.address.match(/^\/mtx\/(\d+)\/mix\/on$/)
        if (mtxOnMatch) {
            const idx = parseInt(mtxOnMatch[1])
            const mtx = this.matrices.find((m) => m.index === idx)
            if (mtx) {
                if (msg.args.length > 0) {
                    // SET — echo to OTHER subscribers, never the sender (R1)
                    const newVal = (msg.args[0].value as number) === 1
                    mtx.on = newVal
                    this.emit("matrix_on_set", idx, newVal)
                    const echo = buildOSCMessage(msg.address, [{ type: "i", value: newVal ? 1 : 0 }])
                    this.echoToSubscribers(echo, this.clientKey(rinfo))
                } else {
                    respond(
                        buildOSCMessage(msg.address, [
                            { type: "i", value: mtx.on ? 1 : 0 },
                        ])
                    )
                }
            }
            return
        }

        // Unknown message — log in verbose mode
        if (this.verbose) {
            console.warn(`[X32Mock] Unhandled OSC address: ${msg.address}`)
        }
    }

    /**
     * Get the current bound port (useful after start() when using auto-assign).
     */
    getPort(): number {
        return this.socket?.address().port ?? 0
    }
}

// ─── Standalone Runner ────────────────────────────────────────────────────

/**
 * Run as a standalone process for manual testing:
 *   ts-node bridge/src/__tests__/x32-mock-server.ts
 *
 * The mock will simulate fader changes every 10 seconds on a rotating bus
 * so you can verify the bridge picks them up. (The bridge subscribes via
 * /xremote on connect + renews every 8s, so it stays a live subscriber.)
 */
async function runStandalone() {
    const mock = new X32MockServer({ port: 10023, verbose: true })

    process.on("SIGINT", async () => {
        console.log("\n[X32Mock] Shutting down...")
        await mock.stop()
        process.exit(0)
    })

    mock.on("xremote", () => {
        console.log("[X32Mock] /xremote received (bridge is subscribing)")
    })

    mock.on("bus_fader_set", (busIdx: number, value: number) => {
        console.log(`[X32Mock] Bus ${busIdx} fader set to ${value.toFixed(3)}`)
    })

    mock.on("send_level_set", (chIdx: number, busIdx: number, value: number) => {
        console.log(`[X32Mock] Ch${chIdx}→Bus${busIdx} send set to ${value.toFixed(3)}`)
    })

    const port = await mock.start()
    console.log()
    console.log(`[X32Mock] Ready! Listening on UDP port ${port}`)
    console.log("[X32Mock] The bridge can now connect to 127.0.0.1:10023")
    console.log()
    console.log("Channels: 32 (Ch 1 - Ch 32)")
    console.log("Buses:    4 (Worship, Band, Keys, Drums)")
    console.log("Matrices: 6 (Matrix 1 - Matrix 6)")
    console.log()
    console.log("Simulating fader changes every 10 seconds...")
    console.log("Press Ctrl+C to stop")
    console.log()

    // Simulate the X32 broadcasting fader changes periodically (as if someone
    // touched the physical console) so we can verify end-to-end flow
    let tick = 0
    setInterval(() => {
        tick++
        const busIdx = (tick % 4) + 1
        const value = 0.5 + Math.sin(tick * 0.5) * 0.25  // oscillate between 0.25 and 0.75
        console.log(`[X32Mock] Simulating Bus ${busIdx} fader change → ${value.toFixed(3)}`)
        mock.broadcastBusFader(busIdx, value)
    }, 10_000)
}

if (require.main === module) {
    runStandalone().catch((err) => {
        console.error("Mock server error:", err)
        process.exit(1)
    })
}
