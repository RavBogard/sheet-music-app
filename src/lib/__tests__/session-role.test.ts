/**
 * v4.3 P9-02 — HMAC-signed companion role cookie.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe("session-role sign/verify", () => {
    const originalSecret = process.env.SESSION_ROLE_SECRET

    beforeAll(() => {
        process.env.SESSION_ROLE_SECRET = "test-secret-abcdefghijklmnop"
    })

    afterAll(() => {
        if (originalSecret === undefined) delete process.env.SESSION_ROLE_SECRET
        else process.env.SESSION_ROLE_SECRET = originalSecret
    })

    it("round-trips uid + role", async () => {
        const { signRoleCookie, verifyRoleCookie } = await import("@/lib/session-role")
        const signed = await signRoleCookie("u-1", "musician")
        expect(signed).toBeTruthy()
        const verified = await verifyRoleCookie(signed)
        expect(verified).toEqual({ uid: "u-1", role: "musician" })
    })

    it("round-trips null role (no Firestore profile)", async () => {
        const { signRoleCookie, verifyRoleCookie } = await import("@/lib/session-role")
        const signed = await signRoleCookie("u-2", null)
        const verified = await verifyRoleCookie(signed)
        expect(verified).toEqual({ uid: "u-2", role: null })
    })

    it("rejects tampered signature", async () => {
        const { signRoleCookie, verifyRoleCookie } = await import("@/lib/session-role")
        const signed = (await signRoleCookie("u-1", "musician"))!
        // flip a char in the signature segment
        const [payload, sig] = signed.split(".")
        const tamperedSig = sig.slice(0, -2) + (sig.slice(-2) === "aa" ? "bb" : "aa")
        const verified = await verifyRoleCookie(`${payload}.${tamperedSig}`)
        expect(verified).toBeNull()
    })

    it("rejects tampered payload (role escalation)", async () => {
        const { signRoleCookie, verifyRoleCookie } = await import("@/lib/session-role")
        const signed = (await signRoleCookie("u-1", "musician"))!
        const [, sig] = signed.split(".")
        // forge a payload claiming admin, reuse original sig
        const forged = Buffer.from(
            JSON.stringify({ uid: "u-1", role: "admin", iat: 0, exp: 9999999999 }),
        )
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "")
        const verified = await verifyRoleCookie(`${forged}.${sig}`)
        expect(verified).toBeNull()
    })

    it("rejects malformed cookie", async () => {
        const { verifyRoleCookie } = await import("@/lib/session-role")
        expect(await verifyRoleCookie("not-a-cookie")).toBeNull()
        expect(await verifyRoleCookie("")).toBeNull()
        expect(await verifyRoleCookie(undefined)).toBeNull()
    })

    it("returns null when secret is missing outside Vercel prod (graceful degrade)", async () => {
        vi.resetModules()
        const savedSecret = process.env.SESSION_ROLE_SECRET
        const savedVercelEnv = process.env.VERCEL_ENV
        delete process.env.SESSION_ROLE_SECRET
        delete process.env.VERCEL_ENV
        try {
            const mod = await import("@/lib/session-role")
            const signed = await mod.signRoleCookie("u-1", "musician")
            expect(signed).toBeNull()
        } finally {
            process.env.SESSION_ROLE_SECRET = savedSecret
            if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
            vi.resetModules()
        }
    })

    it("throws when secret is missing on Vercel production (fail fast)", async () => {
        vi.resetModules()
        const savedSecret = process.env.SESSION_ROLE_SECRET
        const savedVercelEnv = process.env.VERCEL_ENV
        delete process.env.SESSION_ROLE_SECRET
        process.env.VERCEL_ENV = "production"
        try {
            const mod = await import("@/lib/session-role")
            await expect(mod.signRoleCookie("u-1", "musician")).rejects.toThrow(
                /SESSION_ROLE_SECRET is required on Vercel Production/,
            )
        } finally {
            process.env.SESSION_ROLE_SECRET = savedSecret
            if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
            else delete process.env.VERCEL_ENV
            vi.resetModules()
        }
    })
})
