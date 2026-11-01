import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"

/** The Help guides are public: a musician on a signed-out iPad can open them. */

const get = (path: string) => proxy(new NextRequest(new URL(`http://localhost${path}`)))

describe("proxy: /help is public", () => {
    it.each(["/help", "/help/michael", "/help/drew", "/help/before", "/help/after"])("%s needs no sign-in", async (path) => {
        const res = await get(path)
        expect(res.headers.get("location")).toBeNull()
    })

    it("a sibling path is still gated", async () => {
        const res = await get("/helpdesk")
        expect(res.headers.get("location")).toBe("http://localhost/login")
    })
})

describe("proxy: /help is CRC's only", () => {
    beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"))
    afterEach(() => vi.unstubAllEnvs())

    const onHost = (host: string, path: string) =>
        proxy(new NextRequest(new URL(`https://${host}${path}`), { headers: { host } }))

    it.each(["/help", "/help/michael", "/help/after"])("Brothers Lazaroff gets a real 404 for %s", async (path) => {
        const res = await onHost("www.brotherslazaroff.live", path)
        expect(res.status).toBe(404)
    })

    it("CRC still serves /help", async () => {
        const res = await onHost("www.centralreform.live", "/help")
        expect(res.status).not.toBe(404)
        expect(res.headers.get("location")).toBeNull()
    })
})
