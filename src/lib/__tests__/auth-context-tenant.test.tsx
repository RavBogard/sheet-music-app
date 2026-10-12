import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import React from "react"

/**
 * Multi-tenant phase 2 — AuthProvider's tenant role (P2 design §3.6) with the
 * Firebase and users-firebase seams mocked:
 *   - token without `m` → profile role (legacy, unchanged);
 *   - token with `m`    → memberships/{org}__{uid} role; none → null (pending);
 *   - `po`              → admin;
 *   - POST /api/auth/join once per (host, uid) per session; created → token refresh.
 */

const h = vi.hoisted(() => ({
    claims: {} as Record<string, unknown>,
    profile: null as Record<string, unknown> | null,
    membership: null as Record<string, unknown> | null,
    membershipOrgs: [] as string[],
    join: vi.fn(),
    getIdToken: vi.fn(async () => "tok"),
    syncSessionCookie: vi.fn(async () => true),
    repairDrift: vi.fn(async () => ({ syncClaims: "ok", idTokenRefresh: "ok", sessionCookie: "ok", refreshSession: "ok" })),
    authCb: null as null | ((u: unknown) => void),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => { h.authCb = cb; return () => {} },
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
}))
vi.mock("@/lib/firebase", () => ({ auth: { __real: true }, googleProvider: {} }))
vi.mock("../firebase", () => ({ auth: { __real: true }, googleProvider: {} }))
vi.mock("@/lib/session-cookie", () => ({ syncSessionCookie: h.syncSessionCookie }))
vi.mock("@/lib/drift-repair", () => ({ repairDrift: h.repairDrift }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("../users-firebase", () => ({
    ensureUserProfile: vi.fn(async () => ({})),
    subscribeToUserProfile: (_uid: string, cb: (p: unknown) => void) => { cb(h.profile); return () => {} },
    subscribeToMembership: (org: string, _uid: string, cb: (m: unknown) => void) => {
        h.membershipOrgs.push(org)
        cb(h.membership)
        return () => {}
    },
    requestTenantJoin: h.join,
}))

import { AuthProvider, useAuth } from "@/lib/auth-context"
import { OrgContext } from "@/lib/org/org-context"

let seen: ReturnType<typeof useAuth> | null = null
function Probe() {
    seen = useAuth()
    return null
}

function mount(org = "crc") {
    render(
        React.createElement(
            OrgContext.Provider,
            { value: org },
            React.createElement(AuthProvider, null, React.createElement(Probe)),
        ),
    )
}

async function signIn(uid = "u1") {
    const user = {
        uid,
        getIdToken: h.getIdToken,
        getIdTokenResult: async () => ({ claims: h.claims }),
    }
    await act(async () => { h.authCb!(user) })
    await waitFor(() => expect(seen?.loading).toBe(false))
}

beforeEach(() => {
    seen = null
    h.claims = {}
    h.profile = { uid: "u1", role: "musician", soundEngineer: false }
    h.membership = null
    h.membershipOrgs = []
    h.join.mockReset()
    h.join.mockResolvedValue({ tenant: "crc", role: "musician", created: false, claimsChanged: false })
    h.getIdToken.mockClear()
    h.repairDrift.mockClear()
    sessionStorage.clear()
    localStorage.clear()
})
afterEach(() => cleanup())

describe("AuthProvider tenant role (multi-tenant P2)", () => {
    it("token without m: the legacy profile role", async () => {
        h.claims = { role: "musician" }
        mount()
        await signIn()
        expect(seen!.role).toBe("musician")
        expect(seen!.isMusician).toBe(true)
        expect(seen!.isBandLeader).toBe(false)
        expect(seen!.orgId).toBe("crc")
    })

    it("token with m: the membership role in the host tenant", async () => {
        h.claims = { role: "admin", m: { crc: "ad", brotherslazaroff: "me" } }
        h.profile = { uid: "u1", role: "admin" }
        h.membership = { role: "member", soundEngineer: false }
        mount("brotherslazaroff")
        await signIn()
        expect(h.membershipOrgs).toEqual(["brotherslazaroff"])
        expect(seen!.role).toBe("member")
        expect(seen!.isMember).toBe(true)
        expect(seen!.isAdmin).toBe(false)
        expect(seen!.membership).toEqual({ role: "member", soundEngineer: false })
    })

    it("token with m and no membership here: no role (pending)", async () => {
        h.claims = { m: { crc: "bl" } }
        h.profile = { uid: "u1", role: "band_leader" }
        h.membership = null
        mount("brotherslazaroff")
        await signIn()
        expect(seen!.role).toBeNull()
        expect(seen!.isMember).toBe(false)
    })

    it("po: admin, platform owner", async () => {
        h.claims = { po: true, m: {} }
        h.membership = null
        mount("brotherslazaroff")
        await signIn()
        expect(seen!.role).toBe("admin")
        expect(seen!.isAdmin).toBe(true)
        expect(seen!.isPlatformOwner).toBe(true)
    })

    it("asks to join once per (host, uid) per session", async () => {
        h.claims = { role: "musician" }
        mount()
        await signIn()
        await waitFor(() => expect(h.join).toHaveBeenCalledTimes(1))
        cleanup()
        mount()
        await signIn()
        expect(h.join).toHaveBeenCalledTimes(1)
    })

    it("a created request refreshes the token and the session cookie", async () => {
        h.claims = { role: "pending" }
        h.profile = { uid: "u1", role: "pending" }
        h.join.mockResolvedValue({ tenant: "crc", role: "pending", created: true, claimsChanged: true })
        mount()
        await signIn()
        await waitFor(() => expect(h.getIdToken).toHaveBeenCalledWith(true))
        expect(h.syncSessionCookie).toHaveBeenCalled()
    })

    it("drift repair runs when m[org] disagrees with the membership", async () => {
        h.claims = { m: { crc: "mu" } }
        h.membership = { role: "band_leader", soundEngineer: false }
        mount()
        await signIn()
        await waitFor(() => expect(h.repairDrift).toHaveBeenCalledTimes(1))
    })

    it("no drift repair when they agree", async () => {
        h.claims = { m: { crc: "bl" } }
        h.membership = { role: "band_leader", soundEngineer: false }
        mount()
        await signIn()
        expect(h.repairDrift).not.toHaveBeenCalled()
    })
})
