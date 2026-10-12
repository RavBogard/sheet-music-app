import { describe, it, expect } from "vitest"
import { fakeFirestore } from "./fake-firestore"
import { AuthDomainsError, changeAuthorizedDomains, withAuthDomainsLock } from "@/lib/platform/auth-domains"

const URL_BASE = "https://identitytoolkit.googleapis.com/admin/v2/projects/proj/config"
const tick = () => new Promise((r) => setTimeout(r, 2))

/** Fake Identity Toolkit config endpoint. PATCH replaces the whole list, like the real one. */
function toolkit(initial: string[], opts: { dropOnPatch?: string; readAfterPatch?: string[] } = {}) {
    const state = { list: [...initial], patches: [] as string[][], gets: 0 }
    let patched = false
    const fetchFn = (async (url: string, init?: RequestInit) => {
        await tick()
        if ((init?.method ?? "GET") === "GET") {
            expect(url).toBe(URL_BASE)
            state.gets++
            const list = patched && opts.readAfterPatch ? opts.readAfterPatch : state.list
            return new Response(JSON.stringify({ authorizedDomains: list }), { status: 200 })
        }
        expect(url).toBe(`${URL_BASE}?updateMask=authorizedDomains`)
        expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer at")
        const body = JSON.parse(String(init!.body)) as { authorizedDomains: string[] }
        state.patches.push(body.authorizedDomains)
        await tick()
        state.list = body.authorizedDomains.filter((h) => h !== opts.dropOnPatch)
        patched = true
        return new Response(JSON.stringify({ authorizedDomains: state.list }), { status: 200 })
    }) as unknown as typeof fetch
    return { state, fetchFn }
}

const BASE = ["localhost", "crcmusiccharts.firebaseapp.com", "centralreform.live", "www.centralreform.live"]

function deps(db: ReturnType<typeof fakeFirestore>["db"], fetchFn: typeof fetch, extra: Record<string, unknown> = {}) {
    return {
        db,
        fetch: fetchFn,
        getAccessToken: async () => "at",
        projectId: "proj",
        sleep: () => new Promise<void>((r) => setTimeout(r, 1)),
        ...extra,
    }
}

describe("changeAuthorizedDomains", () => {
    it("adds a host: read, PATCH the whole list plus the host, read back; returns the size", async () => {
        const { db, store } = fakeFirestore()
        const t = toolkit(BASE)
        const r = await changeAuthorizedDomains({ add: ["Probe.Vercel.App"] }, deps(db, t.fetchFn))
        expect(t.state.patches).toEqual([[...BASE, "probe.vercel.app"]])
        expect(r).toMatchObject({ size: 5, added: ["probe.vercel.app"], removed: [], changed: true })
        expect(t.state.gets).toBe(2)
        expect(store.has("platform/authDomainsLock")).toBe(false) // released
    })

    it("no PATCH when the host is already there", async () => {
        const { db } = fakeFirestore()
        const t = toolkit(BASE)
        const r = await changeAuthorizedDomains({ add: ["centralreform.live"] }, deps(db, t.fetchFn))
        expect(r.changed).toBe(false)
        expect(t.state.patches).toHaveLength(0)
    })

    it("removes only the hosts asked for", async () => {
        const { db } = fakeFirestore()
        const t = toolkit([...BASE, "a.vercel.app", "b.vercel.app"])
        const r = await changeAuthorizedDomains({ remove: ["a.vercel.app", "not-there.org"] }, deps(db, t.fetchFn))
        expect(t.state.list).toEqual([...BASE, "b.vercel.app"])
        expect(r.removed).toEqual(["a.vercel.app"])
    })

    it("refuses to PATCH when the read comes back empty", async () => {
        const { db, store } = fakeFirestore()
        const t = toolkit([])
        await expect(changeAuthorizedDomains({ add: ["x.vercel.app"] }, deps(db, t.fetchFn))).rejects.toMatchObject({ kind: "empty_read" })
        expect(t.state.patches).toHaveLength(0)
        expect(store.has("platform/authDomainsLock")).toBe(false)
    })

    it("refuses to PATCH when the read fails", async () => {
        const { db } = fakeFirestore()
        const fetchFn = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch
        const err = await changeAuthorizedDomains({ add: ["x.vercel.app"] }, deps(db, fetchFn)).catch((e) => e)
        expect(err).toBeInstanceOf(AuthDomainsError)
        expect(err.kind).toBe("read_failed")
    })

    it("fails readback_mismatch when the added host is missing after PATCH", async () => {
        const { db } = fakeFirestore()
        const t = toolkit(BASE, { dropOnPatch: "x.vercel.app" })
        await expect(changeAuthorizedDomains({ add: ["x.vercel.app"] }, deps(db, t.fetchFn))).rejects.toMatchObject({
            kind: "readback_mismatch",
        })
    })

    it("fails readback_mismatch when an unrelated host vanished", async () => {
        const { db } = fakeFirestore()
        const t = toolkit(BASE, { readAfterPatch: ["localhost", "x.vercel.app"] })
        await expect(changeAuthorizedDomains({ add: ["x.vercel.app"] }, deps(db, t.fetchFn))).rejects.toMatchObject({
            kind: "readback_mismatch",
        })
    })

    it("fails readback_mismatch when a removed host is still present", async () => {
        const { db } = fakeFirestore()
        const t = toolkit([...BASE, "gone.vercel.app"], { readAfterPatch: [...BASE, "gone.vercel.app"] })
        await expect(changeAuthorizedDomains({ remove: ["gone.vercel.app"] }, deps(db, t.fetchFn))).rejects.toMatchObject({
            kind: "readback_mismatch",
        })
    })

    it("concurrent adds serialize under the lock: no change is lost", async () => {
        const { db } = fakeFirestore()
        const t = toolkit(BASE)
        const hosts = ["a.vercel.app", "b.vercel.app", "c.vercel.app", "d.vercel.app"]
        await Promise.all(hosts.map((h) => changeAuthorizedDomains({ add: [h] }, deps(db, t.fetchFn))))
        expect([...t.state.list].sort()).toEqual([...BASE, ...hosts].sort())
        expect(t.state.patches).toHaveLength(4)
        // each PATCH builds on the previous one
        expect(t.state.patches.map((p) => p.length)).toEqual([5, 6, 7, 8])
    })
})

describe("withAuthDomainsLock", () => {
    it("takes over a stale (expired) lock", async () => {
        const now = 1_000_000
        const { db, store } = fakeFirestore({ "platform/authDomainsLock": { owner: "crashed", expiresAt: now - 1 } })
        const out = await withAuthDomainsLock(
            "op",
            async () => {
                expect(store.get("platform/authDomainsLock")).toMatchObject({ owner: "me", expiresAt: now + 30_000 })
                return 42
            },
            { db, now: () => now, owner: "me" },
        )
        expect(out).toBe(42)
        expect(store.has("platform/authDomainsLock")).toBe(false)
    })

    it("waits for a held lock that expires, then proceeds", async () => {
        let clock = 0
        const { db } = fakeFirestore({ "platform/authDomainsLock": { owner: "other", expiresAt: 5_000 } })
        const out = await withAuthDomainsLock("op", async () => "ok", {
            db,
            now: () => clock,
            sleep: async (ms) => void (clock += ms),
            owner: "me",
        })
        expect(out).toBe("ok")
        expect(clock).toBeGreaterThanOrEqual(5_000)
    })

    it("gives up with lock_timeout after about 20 s when the lock stays held", async () => {
        let clock = 0
        const { db, store } = fakeFirestore({ "platform/authDomainsLock": { owner: "other", expiresAt: 60_000 } })
        let ran = false
        await expect(
            withAuthDomainsLock("op", async () => void (ran = true), {
                db,
                now: () => clock,
                sleep: async (ms) => void (clock += ms),
                owner: "me",
            }),
        ).rejects.toMatchObject({ kind: "lock_timeout" })
        expect(ran).toBe(false)
        expect(clock).toBeGreaterThanOrEqual(20_000)
        expect(clock).toBeLessThan(23_000)
        expect(store.get("platform/authDomainsLock")).toMatchObject({ owner: "other" }) // not stolen
    })

    it("releases the lock when the work throws, and never deletes another owner's lock", async () => {
        const { db, store } = fakeFirestore()
        await expect(
            withAuthDomainsLock("op", async () => {
                throw new Error("x")
            }, { db, owner: "me" }),
        ).rejects.toThrow("x")
        expect(store.has("platform/authDomainsLock")).toBe(false)

        await withAuthDomainsLock(
            "op",
            async () => {
                // our lock expired and another owner took it mid-run
                store.set("platform/authDomainsLock", { owner: "next", expiresAt: Date.now() + 30_000 })
            },
            { db, owner: "me" },
        )
        expect(store.get("platform/authDomainsLock")).toMatchObject({ owner: "next" })
    })
})
