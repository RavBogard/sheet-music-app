// BroadcastChannel-based single-leader lock for the sync engine.
// Bound by ARCHITECTURE.md §3.4 (cross-tab coordination).
//
// Why not Web Locks API: Safari support is uneven enough that the iPad floor
// in §1.1 rules it out. Why not localStorage: event timing differs per browser.

type LockMessage =
    | { type: 'lock-acquired'; tabId: string; ts: number }
    | { type: 'lock-heartbeat'; tabId: string; ts: number }
    | { type: 'lock-released'; tabId: string }
    | { type: 'lock-probe'; tabId: string }

interface BroadcastChannelLike {
    postMessage(message: unknown): void
    close(): void
    onmessage: ((ev: { data: unknown }) => void) | null
}

interface ClockLike {
    now(): number
    setTimeout(fn: () => void, ms: number): unknown
    clearTimeout(handle: unknown): void
}

const defaultClock: ClockLike = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

function makeTabId(): string {
    if (
        typeof globalThis.crypto !== 'undefined' &&
        typeof globalThis.crypto.randomUUID === 'function'
    ) {
        return globalThis.crypto.randomUUID()
    }
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export interface CrossTabLockOptions {
    leaseMs?: number
    clock?: ClockLike
    channelFactory?: (name: string) => BroadcastChannelLike
}

export class CrossTabLock {
    readonly tabId = makeTabId()
    private readonly channel: BroadcastChannelLike
    private readonly leaseMs: number
    private readonly clock: ClockLike
    private holder = false
    private peerHolder: { tabId: string; ts: number } | null = null
    private heartbeatHandle: unknown = null
    private staleCheckHandle: unknown = null
    private lostCb: (() => void) | null = null
    private availableCb: (() => void) | null = null

    constructor(channelName: string, opts: CrossTabLockOptions = {}) {
        this.leaseMs = opts.leaseMs ?? 5000
        this.clock = opts.clock ?? defaultClock
        const factory =
            opts.channelFactory ??
            ((name: string) =>
                new BroadcastChannel(name) as unknown as BroadcastChannelLike)
        this.channel = factory(channelName)
        this.channel.onmessage = (ev) => this.onMessage(ev.data as LockMessage)
    }

    isHolder(): boolean {
        return this.holder
    }

    tryAcquire(): boolean {
        const now = this.clock.now()
        if (this.holder) return true

        // If a peer's heartbeat is fresh, defer to them. Tie-break of
        // simultaneous-broadcast races happens in onMessage when a holder
        // receives a competing lock-acquired with a lower tabId.
        if (this.peerHolder && now - this.peerHolder.ts < this.leaseMs) {
            return false
        }

        this.holder = true
        this.send({ type: 'lock-acquired', tabId: this.tabId, ts: now })
        this.startHeartbeat()
        return true
    }

    release(): void {
        if (!this.holder) return
        this.holder = false
        this.stopHeartbeat()
        this.send({ type: 'lock-released', tabId: this.tabId })
    }

    shutdown(): void {
        this.release()
        this.stopStaleCheck()
        try {
            this.channel.close()
        } catch {
            // ignore
        }
    }

    onLost(cb: () => void): void {
        this.lostCb = cb
    }

    onAvailable(cb: () => void): void {
        this.availableCb = cb
        this.startStaleCheck()
    }

    private send(msg: LockMessage): void {
        try {
            this.channel.postMessage(msg)
        } catch {
            // ignore — channel may be closed
        }
    }

    private onMessage(msg: LockMessage): void {
        if (!msg || typeof msg !== 'object') return
        switch (msg.type) {
            case 'lock-acquired':
                if (msg.tabId === this.tabId) return
                if (this.holder) {
                    // Tie-break: lower tabId wins. If the peer's id is lower,
                    // we yield.
                    if (msg.tabId < this.tabId) {
                        this.holder = false
                        this.stopHeartbeat()
                        this.lostCb?.()
                    }
                }
                this.peerHolder = { tabId: msg.tabId, ts: msg.ts }
                break
            case 'lock-heartbeat':
                if (msg.tabId === this.tabId) return
                this.peerHolder = { tabId: msg.tabId, ts: msg.ts }
                break
            case 'lock-released':
                if (
                    this.peerHolder &&
                    this.peerHolder.tabId === msg.tabId
                ) {
                    this.peerHolder = null
                    this.availableCb?.()
                }
                break
            case 'lock-probe':
                if (this.holder) {
                    this.send({
                        type: 'lock-heartbeat',
                        tabId: this.tabId,
                        ts: this.clock.now(),
                    })
                }
                break
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat()
        const tick = () => {
            if (!this.holder) return
            this.send({
                type: 'lock-heartbeat',
                tabId: this.tabId,
                ts: this.clock.now(),
            })
            this.heartbeatHandle = this.clock.setTimeout(tick, this.leaseMs / 2)
        }
        this.heartbeatHandle = this.clock.setTimeout(tick, this.leaseMs / 2)
    }

    private stopHeartbeat(): void {
        if (this.heartbeatHandle != null) {
            this.clock.clearTimeout(this.heartbeatHandle)
            this.heartbeatHandle = null
        }
    }

    private startStaleCheck(): void {
        this.stopStaleCheck()
        const tick = () => {
            const now = this.clock.now()
            if (
                this.peerHolder &&
                now - this.peerHolder.ts >= this.leaseMs
            ) {
                this.peerHolder = null
                this.availableCb?.()
            }
            this.staleCheckHandle = this.clock.setTimeout(
                tick,
                this.leaseMs / 4,
            )
        }
        this.staleCheckHandle = this.clock.setTimeout(tick, this.leaseMs / 4)
    }

    private stopStaleCheck(): void {
        if (this.staleCheckHandle != null) {
            this.clock.clearTimeout(this.staleCheckHandle)
            this.staleCheckHandle = null
        }
    }
}
