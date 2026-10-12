/**
 * Multi-tenant phase 1 (lane 2) test seams, shared by the golden tests in this
 * folder. Used from inside `vi.mock` factories via `await import(...)`.
 *
 *  - `tenantState.org` is the `x-org-id` header the mocked `next/headers`
 *    returns, so a test picks the tenant the request resolves to.
 *  - The registry mock lets the fictional "testshul" tenant through
 *    `coerceOrgId`; crc / brotherslazaroff / anything else behave as the real one.
 *  - The getOrgConfig mock returns (and primes) the testshul fixture; crc and
 *    brotherslazaroff go through the real function (code tables).
 */
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"
import { primeOrgConfig } from "@/lib/org/config-cache"

import type { OrgConfig } from "@/lib/org/config-schema"

export const tenantState: {
    org: string
    nonce?: string
    /** Optional rewrite of the resolved config (to prove a field is read from config). */
    configOverride?: (cfg: OrgConfig) => OrgConfig
} = { org: "crc" }

export function headersMock() {
    return {
        headers: async () => {
            const h = new Headers({ "x-org-id": tenantState.org })
            if (tenantState.nonce) h.set("x-nonce", tenantState.nonce)
            return h
        },
    }
}

export async function registryMock(importOriginal: () => Promise<unknown>) {
    const actual = (await importOriginal()) as typeof import("@/lib/org/registry")
    return {
        ...actual,
        coerceOrgId: (v: string | null | undefined) => (v === "testshul" ? "testshul" : actual.coerceOrgId(v)),
    }
}

export async function getOrgConfigMock(importOriginal: () => Promise<unknown>) {
    const actual = (await importOriginal()) as typeof import("@/lib/org/get-org-config")
    return {
        ...actual,
        getOrgConfig: async (id: string) => {
            const cfg = id === "testshul" ? makeTestOrgConfig() : await actual.getOrgConfig(id)
            if (cfg && tenantState.configOverride) {
                const next = tenantState.configOverride(cfg)
                primeOrgConfig(next)
                return next
            }
            if (cfg) primeOrgConfig(cfg)
            return cfg
        },
    }
}

export function firebaseAdminMock() {
    return {
        initAdmin: () => false,
        getFirestore: () => {
            throw new Error("firestore not available in this test")
        },
        verifyIdToken: async () => null,
    }
}
