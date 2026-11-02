import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"
import { isCrcOnlyPath } from "@/lib/org/crc-only-routes"

/**
 * LAYOUT-404: CRC-only pages are 404'd at the proxy for every other tenant,
 * because a (main)-group layout's notFound() runs after streaming starts and
 * answers 200 with the page's payload.
 */

describe("isCrcOnlyPath", () => {
    it.each(["/help", "/help/michael", "/monitor", "/monitor/admin", "/monitor/engineer"])("%s is CRC-only", (p) => {
        expect(isCrcOnlyPath(p)).toBe(true)
    })
    it.each(["/", "/helpdesk", "/monitoring", "/setlists", "/perform/setlist/x", "/api/monitor"])("%s is not", (p) => {
        expect(isCrcOnlyPath(p)).toBe(false)
    })
})

describe("proxy: CRC-only pages on another tenant", () => {
    beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"))
    afterEach(() => vi.unstubAllEnvs())

    const onHost = (host: string, path: string, cookie?: string) =>
        proxy(
            new NextRequest(new URL(`https://${host}${path}`), {
                headers: cookie ? { host, cookie } : { host },
            }),
        )

    it.each(["/monitor", "/monitor/admin", "/monitor/engineer"])(
        "Brothers Lazaroff gets a real 404 for %s, signed out or not",
        async (path) => {
            const signedOut = await onHost("www.brotherslazaroff.live", path)
            expect(signedOut.status).toBe(404)
            expect(signedOut.headers.get("location")).toBeNull()
            const withSession = await onHost("www.brotherslazaroff.live", path, "__session=x")
            expect(withSession.status).toBe(404)
        },
    )

    it("CRC is not 404'd for /monitor (the usual sign-in gate still applies)", async () => {
        const res = await onHost("www.centralreform.live", "/monitor")
        expect(res.status).not.toBe(404)
    })

    it("a non-CRC-only page on Brothers Lazaroff is not 404'd", async () => {
        const res = await onHost("www.brotherslazaroff.live", "/setlists")
        expect(res.status).not.toBe(404)
    })
})
