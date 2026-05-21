import { describe, it, expect, afterEach } from "vitest"
import * as dgram from "dgram"
import {
    X32MockServer,
    X32MockServerOptions,
    buildOSCMessage,
    parseOSCMessage,
    ParsedOSCMessage,
} from "./x32-mock-server"

/**
 * Mock-fidelity tests (Monitor Overhaul P0-B1).
 *
 * These exercise the X32 mock over REAL loopback UDP (not the dgram-mocked
 * path the x32-client unit tests use) because the whole point is the mock's
 * on-the-wire echo behavior. They pin the four real-hardware behaviors the
 * mock now models — see AUDIT-bridge.md B7 + Part A R1:
 *   1. own-writes are NOT echoed back to the sender,
 *   2. a query/GET returns the current stored value,
 *   3. /xremote subscribe + expiry + renewal gates echoes,
 *   4. external changes echo to OTHER subscribers (and not the originator).
 */

const HOST = "127.0.0.1"

function pad2(n: number): string {
    return String(n).padStart(2, "0")
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A raw OSC-over-UDP client used to observe exactly what the mock sends back to
 * a given socket. Unlike the real X32Client it does NOT auto-subscribe or renew
 * — the test drives /xremote explicitly so subscription/expiry can be asserted.
 */
class RawX32TestClient {
    private readonly socket: dgram.Socket
    readonly received: ParsedOSCMessage[] = []

    constructor(private readonly targetPort: number) {
        this.socket = dgram.createSocket("udp4")
        this.socket.on("message", (buf) => {
            const m = parseOSCMessage(buf)
            if (m) this.received.push(m)
        })
    }

    async start(): Promise<void> {
        await new Promise<void>((resolve) => this.socket.bind(0, () => resolve()))
    }

    private send(
        address: string,
        args: Array<{ type: "f" | "i" | "s"; value: number | string }> = []
    ): void {
        const buf = buildOSCMessage(address, args)
        this.socket.send(buf, 0, buf.length, this.targetPort, HOST)
    }

    subscribe(): void {
        this.send("/xremote")
    }

    setBusFader(bus: number, value: number): void {
        this.send(`/bus/${pad2(bus)}/mix/fader`, [{ type: "f", value }])
    }

    getBusFader(bus: number): void {
        this.send(`/bus/${pad2(bus)}/mix/fader`)
    }

    messagesFor(address: string): ParsedOSCMessage[] {
        return this.received.filter((m) => m.address === address)
    }

    clear(): void {
        this.received.length = 0
    }

    async stop(): Promise<void> {
        await new Promise<void>((resolve) => this.socket.close(() => resolve()))
    }
}

describe("X32 mock fidelity (P0-B1)", () => {
    let mock: X32MockServer
    let port: number
    const clients: RawX32TestClient[] = []

    async function startMock(opts: X32MockServerOptions = {}): Promise<void> {
        // port:0 → ephemeral, so parallel test files never collide on 10023.
        mock = new X32MockServer({ port: 0, ...opts })
        port = await mock.start()
    }

    async function makeClient(): Promise<RawX32TestClient> {
        const c = new RawX32TestClient(port)
        await c.start()
        clients.push(c)
        return c
    }

    afterEach(async () => {
        for (const c of clients.splice(0)) await c.stop()
        if (mock) await mock.stop()
    })

    it("does NOT echo a client's own write back to the sender (R1 root)", async () => {
        await startMock()
        const a = await makeClient()
        a.subscribe()
        await delay(40)
        a.clear()

        a.setBusFader(2, 0.42)
        await delay(60)

        // The sender received NO echo of its own SET …
        expect(a.messagesFor("/bus/02/mix/fader")).toHaveLength(0)
        // … but the desk DID apply the value.
        expect(mock.buses.find((b) => b.index === 2)!.fader).toBeCloseTo(0.42, 5)
    })

    it("answers a query/GET with the current stored value", async () => {
        await startMock()
        const a = await makeClient()

        // A SET applies even from a non-subscriber (and still isn't echoed back),
        // and a subsequent parameterless query returns that current value.
        a.setBusFader(1, 0.31)
        await delay(40)
        a.clear()
        a.getBusFader(1)
        await delay(40)

        const replies = a.messagesFor("/bus/01/mix/fader")
        expect(replies.length).toBeGreaterThan(0)
        expect(replies.at(-1)!.args[0].value as number).toBeCloseTo(0.31, 5)
    })

    it("delivers external changes only to LIVE /xremote subscribers, expiring without renewal", async () => {
        await startMock({ subscriptionTtlMs: 200 })
        const a = await makeClient()
        a.subscribe()
        await delay(30)
        a.clear()

        // While subscribed: a manual desk move reaches the subscriber.
        mock.broadcastBusFader(1, 0.33)
        await delay(50)
        expect(a.messagesFor("/bus/01/mix/fader").length).toBeGreaterThan(0)

        // Let the subscription lapse (> ttl since the last /xremote).
        await delay(300)
        a.clear()
        mock.broadcastBusFader(1, 0.66)
        await delay(50)
        expect(a.messagesFor("/bus/01/mix/fader")).toHaveLength(0)

        // Renew → echoes resume.
        a.subscribe()
        await delay(30)
        a.clear()
        mock.broadcastBusFader(1, 0.77)
        await delay(50)
        expect(a.messagesFor("/bus/01/mix/fader").length).toBeGreaterThan(0)
    })

    it("echoes one client's write to OTHER subscribers but never the writer", async () => {
        await startMock()
        const a = await makeClient()
        const b = await makeClient()
        a.subscribe()
        b.subscribe()
        await delay(40)
        a.clear()
        b.clear()

        b.setBusFader(4, 0.51)
        await delay(60)

        // A (the other subscriber) receives the echo with the new value …
        const aEchoes = a.messagesFor("/bus/04/mix/fader")
        expect(aEchoes.length).toBeGreaterThan(0)
        expect(aEchoes.at(-1)!.args[0].value as number).toBeCloseTo(0.51, 5)
        // … but B (the writer) does not (own-write suppression).
        expect(b.messagesFor("/bus/04/mix/fader")).toHaveLength(0)
    })

    it("does not echo external changes to a non-subscribed client", async () => {
        await startMock()
        const sub = await makeClient()
        const nonSub = await makeClient()
        sub.subscribe()
        await delay(40)
        sub.clear()
        nonSub.clear()

        mock.broadcastBusFader(1, 0.5)
        await delay(50)

        expect(sub.messagesFor("/bus/01/mix/fader").length).toBeGreaterThan(0)
        expect(nonSub.messagesFor("/bus/01/mix/fader")).toHaveLength(0)
    })
})
