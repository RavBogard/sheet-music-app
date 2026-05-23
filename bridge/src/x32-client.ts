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
import { ChannelInfo, BusInfo, MatrixInfo } from "./types"

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
    /**
     * Max concurrent OSC value queries in flight during `syncFullState`
     * (default 12). The X32 silently drops queries when flooded; the old
     * unbounded `Promise.all` burst fired ~320 send queries at once and lost
     * most of them for the later monitor buses. A small cap keeps every bus's
     * send state readable. Exposed for testing.
     */
    syncQueryCap?: number
    /**
     * Total attempts per value read during `syncFullState` (default 3 = 1 try
     * + 2 retries). A transient UDP drop is retried before the read is given
     * up to the `unconfirmed` set, so a single dropped query no longer
     * fabricates a 0/false fallback. Exposed for testing.
     */
    syncQueryAttempts?: number
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

    // ── syncFullState OSC query throttle (monitor per-channel-send fix) ──
    // The X32 drops OSC queries when flooded. Bound the number of value reads
    // in flight at once + retry transient drops so every monitor bus's send
    // state reads back reliably instead of fabricating 0/false fallbacks.
    private static readonly DEFAULT_SYNC_QUERY_CAP = 12
    private static readonly DEFAULT_SYNC_QUERY_ATTEMPTS = 3
    private readonly syncQueryCap: number
    private readonly syncQueryAttempts: number
    // B9 — per-address FIFO correlation. The X32 protocol has no correlation id
    // (it replies to the same address it was queried on). A single-slot map
    // clobbered an in-flight waiter when a second query to the SAME address
    // started before the first replied — the earlier promise then hung to its
    // 2s timeout. Now that C2 issues a query after every command, concurrent
    // same-address queries are real (e.g. the 30s re-query overlapping a
    // reconnect re-query). A FIFO queue per address hands each inbound reply to
    // the OLDEST outstanding waiter, so concurrent queries/echoes can't cross.
    private pendingCallbacks = new Map<string, Array<(msg: ParsedOSCMessage) => void>>()

    // C2 — query-after-command confirmation (Monitor Overhaul Phase 1). The X32
    // does NOT echo a client's OWN write back to the sender (R1), so after every
    // SET we issue a debounced GET for the same address; its reply travels the
    // normal inbound path (handleMessage → routeParameterChange), refreshing the
    // cache and emitting the change event that the transport turns into a
    // full-state write. Fire-and-forget (no pendingCallback → sidesteps the B9
    // address-collision): latest-authoritative-value-wins, and a dropped reply
    // simply leaves the value for the heartbeat to reconcile (never a fabricated
    // value).
    private confirmTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly CONFIRM_DEBOUNCE_MS = 75

    // B11 — confirmed-vs-unknown sentinel. Target keys whose value could not be
    // read during the most recent syncFullState (query failed/timed out).
    // Published in monitor-live/state so consumers can tell "unknown/unreachable"
    // from a real 0/false/true rather than trusting a silently fabricated value.
    private unconfirmed = new Set<string>()

    // Cached mixer state
    channels: ChannelInfo[] = []
    buses: BusInfo[] = []
    matrices: MatrixInfo[] = []

    constructor(options: X32ClientOptions) {
        super()
        this.address = options.address
        this.port = options.port
        this.syncQueryCap = Math.max(1, options.syncQueryCap ?? X32Client.DEFAULT_SYNC_QUERY_CAP)
        this.syncQueryAttempts = Math.max(1, options.syncQueryAttempts ?? X32Client.DEFAULT_SYNC_QUERY_ATTEMPTS)
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
        // C2 — drop any pending confirm read-backs.
        for (const t of this.confirmTimers.values()) clearTimeout(t)
        this.confirmTimers.clear()
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

        // B9 — hand this reply to the OLDEST outstanding waiter for the address
        // (FIFO), not a single clobberable slot. Concurrent same-address queries
        // are resolved in send order.
        const waiters = this.pendingCallbacks.get(msg.address)
        if (waiters && waiters.length > 0) {
            const cb = waiters.shift()!
            if (waiters.length === 0) this.pendingCallbacks.delete(msg.address)
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
            const cb = (msg: ParsedOSCMessage) => {
                clearTimeout(timeout)
                resolve(msg)
            }
            const timeout = setTimeout(() => {
                // B9 — remove THIS waiter only; the address slot may hold other
                // concurrent waiters that must keep their place in line.
                const waiters = this.pendingCallbacks.get(address)
                if (waiters) {
                    const i = waiters.indexOf(cb)
                    if (i !== -1) waiters.splice(i, 1)
                    if (waiters.length === 0) this.pendingCallbacks.delete(address)
                }
                reject(new Error(`Query timeout: ${address}`))
            }, 2000)

            const waiters = this.pendingCallbacks.get(address)
            if (waiters) waiters.push(cb)
            else this.pendingCallbacks.set(address, [cb])

            this.send(address)
        })
    }

    /**
     * Schedule a debounced query-after-command (C2). Coalesces a fast gesture
     * (many SETs to one target) into ONE read-back ~CONFIRM_DEBOUNCE_MS after the
     * last SET. The GET reply refreshes the cache via the inbound path; we
     * deliberately do NOT await it — latest-value-wins, and a dropped reply is
     * left to the heartbeat (no fabricated value).
     */
    private scheduleConfirm(key: string, address: string): void {
        const prev = this.confirmTimers.get(key)
        if (prev) clearTimeout(prev)
        this.confirmTimers.set(
            key,
            setTimeout(() => {
                this.confirmTimers.delete(key)
                this.send(address) // GET (no args) — reply routes to routeParameterChange
            }, this.CONFIRM_DEBOUNCE_MS),
        )
    }

    /** Target keys whose value is currently unconfirmed (B11). */
    getUnconfirmed(): string[] {
        return [...this.unconfirmed]
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
        this.scheduleConfirm(`bus_fader:${bus}`, addr) // C2
    }

    setSendLevel(ch: number, bus: number, value: number): void {
        const addr = `/ch/${String(ch).padStart(2, "0")}/mix/${String(bus).padStart(2, "0")}/level`
        this.send(addr, [{ type: "f", value: Math.max(0, Math.min(1, value)) }])
        this.scheduleConfirm(`send_level:${ch}:${bus}`, addr) // C2
    }

    setSendOn(ch: number, bus: number, on: boolean): void {
        const addr = `/ch/${String(ch).padStart(2, "0")}/mix/${String(bus).padStart(2, "0")}/on`
        this.send(addr, [{ type: "i", value: on ? 1 : 0 }])
        this.scheduleConfirm(`send_on:${ch}:${bus}`, addr) // C2
    }

    setMatrixFader(mtx: number, value: number): void {
        const addr = `/mtx/${String(mtx).padStart(2, "0")}/mix/fader`
        this.send(addr, [{ type: "f", value: Math.max(0, Math.min(1, value)) }])
        this.scheduleConfirm(`matrix_fader:${mtx}`, addr) // C2
    }

    setMatrixOn(mtx: number, on: boolean): void {
        const addr = `/mtx/${String(mtx).padStart(2, "0")}/mix/on`
        this.send(addr, [{ type: "i", value: on ? 1 : 0 }])
        this.scheduleConfirm(`matrix_on:${mtx}`, addr) // C2
    }

    // ─── Full State Sync ───

    /**
     * Bounded-concurrency runner: drains `tasks` with at most `cap` thunks in
     * flight at once. Replaces the unbounded `Promise.all` bursts that fired
     * ~320 send queries (32 ch × N buses × {level,on}) at the X32 at the same
     * instant — the desk dropped most of them for the later monitor buses, so
     * those reads timed out and the bridge published fabricated 0/false
     * fallbacks for Daniel's real mix (the monitor per-channel-send defect).
     * Keeping the in-flight count small lets every bus's send state read back
     * reliably. Order-agnostic: each task mutates its own slot of the result
     * skeletons, so results need not be collected.
     */
    private async runPooled(tasks: Array<() => Promise<void>>, cap: number): Promise<void> {
        let next = 0
        const worker = async (): Promise<void> => {
            for (let i = next++; i < tasks.length; i = next++) {
                await tasks[i]()
            }
        }
        const workers = Math.max(1, Math.min(cap, tasks.length))
        await Promise.all(Array.from({ length: workers }, () => worker()))
    }

    /**
     * Run a single OSC read with bounded retries (`syncQueryAttempts`). A
     * transient UDP drop should NOT immediately fabricate an `unconfirmed`
     * value, so we re-issue the GET a few times before giving up. Each attempt
     * is a fresh `query()` (its own 2s timeout + B9 per-address FIFO waiter),
     * so the correlation invariant is preserved.
     */
    private async queryWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastErr: unknown
        for (let attempt = 0; attempt < this.syncQueryAttempts; attempt++) {
            try {
                return await fn()
            } catch (err) {
                lastErr = err
            }
        }
        throw lastErr instanceof Error ? lastErr : new Error("query failed after retries")
    }

    async syncFullState(monitorBuses: number[]): Promise<void> {
        const start = Date.now()
        console.log(
            `[X32] Syncing full mixer state (throttled: cap=${this.syncQueryCap}, attempts=${this.syncQueryAttempts})...`,
        )

        // B11 — record which VALUE reads fail this sync so writeFullState can
        // publish them as unconfirmed rather than shipping the fabricated
        // fallback (0 / false / true) as if it were the desk's real value.
        const unconfirmed = new Set<string>()

        // Pre-build the skeletons; each pooled task fills in exactly one value
        // (or marks it unconfirmed on failure). Building ONE flat task list and
        // draining it through a single bounded pool caps total in-flight
        // queries across the WHOLE sync — not per-phase — so adding monitor
        // buses can never re-create the ~320-concurrent-query flood.
        const channels: ChannelInfo[] = Array.from({ length: 32 }, (_, i) => ({
            index: i + 1,
            name: `Ch ${i + 1}`,
            color: 0,
        }))
        const buses: BusInfo[] = monitorBuses.map((busIdx) => ({
            index: busIdx,
            name: `Bus ${busIdx}`,
            fader: 0,
            sends: Array.from({ length: 32 }, (_, i) => ({ channelIndex: i + 1, level: 0, on: false })),
        }))
        const matrices: MatrixInfo[] = Array.from({ length: 6 }, (_, i) => ({
            index: i + 1,
            name: `Matrix ${i + 1}`,
            fader: 0,
            on: true,
        }))

        const tasks: Array<() => Promise<void>> = []

        // Channel names — cosmetic; on failure keep the default `Ch N` (the
        // value carries no audio meaning, so no `unconfirmed` marker).
        for (const ch of channels) {
            tasks.push(async () => {
                try { ch.name = await this.queryWithRetry(() => this.queryChannelName(ch.index)) }
                catch { /* keep default name */ }
            })
        }

        // Bus name + master fader + every per-channel send (level + on).
        for (const bus of buses) {
            tasks.push(async () => {
                try { bus.name = await this.queryWithRetry(() => this.queryBusName(bus.index)) }
                catch { /* keep default name */ }
            })
            tasks.push(async () => {
                try { bus.fader = await this.queryWithRetry(() => this.queryBusFader(bus.index)) }
                catch { unconfirmed.add(`bus_fader:${bus.index}`); bus.fader = 0 }
            })
            for (const send of bus.sends) {
                const ch = send.channelIndex
                tasks.push(async () => {
                    try { send.level = await this.queryWithRetry(() => this.querySendLevel(ch, bus.index)) }
                    catch { unconfirmed.add(`send_level:${ch}:${bus.index}`); send.level = 0 }
                })
                tasks.push(async () => {
                    try { send.on = await this.queryWithRetry(() => this.querySendOn(ch, bus.index)) }
                    catch { unconfirmed.add(`send_on:${ch}:${bus.index}`); send.on = false }
                })
            }
        }

        // Matrix outputs (name + fader + on). Matrix `on` keeps the historical
        // true-on-failure default (B11).
        for (const mtx of matrices) {
            tasks.push(async () => {
                try { mtx.name = await this.queryWithRetry(() => this.queryMatrixName(mtx.index)) }
                catch { /* keep default name */ }
            })
            tasks.push(async () => {
                try { mtx.fader = await this.queryWithRetry(() => this.queryMatrixFader(mtx.index)) }
                catch { unconfirmed.add(`matrix_fader:${mtx.index}`); mtx.fader = 0 }
            })
            tasks.push(async () => {
                try { mtx.on = await this.queryWithRetry(() => this.queryMatrixOn(mtx.index)) }
                catch { unconfirmed.add(`matrix_on:${mtx.index}`); mtx.on = true }
            })
        }

        await this.runPooled(tasks, this.syncQueryCap)

        this.channels = channels
        this.buses = buses
        this.matrices = matrices
        // B11 — publish the result of THIS sync (replaces any prior set).
        this.unconfirmed = unconfirmed

        const totalElapsed = Date.now() - start
        console.log(
            `[X32] State sync complete: ${channels.length} channels, ${buses.length} buses, ` +
            `${matrices.length} matrices, ${unconfirmed.size} unconfirmed (${totalElapsed}ms)`,
        )
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
