import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Outside a Next request there is no incremental cache; pass straight through.
vi.mock("next/cache", () => ({
    unstable_cache: (fn: () => unknown) => fn,
}))

import { initializeApp, getApps, deleteApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { codeOrgConfig } from "@/lib/org/config-code"
import { clearPrimedOrgConfigs, peekOrgConfig } from "@/lib/org/config-cache"
import { clearOrgConfigMemory, getOrgConfig } from "@/lib/org/get-org-config"
import { getOrgBranding } from "@/lib/org/branding"
import { label } from "@/lib/org/vocab"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"

vi.mock("@/lib/firebase-admin", async () => {
    const { getFirestore: gf } = await import("firebase-admin/firestore")
    return { initAdmin: () => true, getFirestore: () => gf() }
})

/**
 * Multi-tenant phase 1: getOrgConfig with ORG_CONFIG_SOURCE=firestore reads
 * orgs/{id}, validates it, falls back to the code tables for crc/BL when the
 * document is missing or invalid, and primes the synchronous getters.
 */
describe("getOrgConfig (firestore source, emulator)", () => {
    const prevSource = process.env.ORG_CONFIG_SOURCE

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        if (!getApps().length) initializeApp({ projectId: "demo-mt-p1-org-config" })
        process.env.ORG_CONFIG_SOURCE = "firestore"
    })
    afterAll(async () => {
        if (prevSource === undefined) delete process.env.ORG_CONFIG_SOURCE
        else process.env.ORG_CONFIG_SOURCE = prevSource
        await Promise.all(getApps().map((a) => deleteApp(a)))
    })
    beforeEach(async () => {
        clearOrgConfigMemory()
        clearPrimedOrgConfigs()
        const db = getFirestore()
        for (const d of (await db.collection("orgs").get()).docs) await d.ref.delete()
    })

    it("a seeded orgs/crc reads back equal to the code config", async () => {
        await getFirestore().doc("orgs/crc").set({ ...codeOrgConfig("crc"), createdAt: new Date(), domain: "centralreform.live" })
        expect(await getOrgConfig("crc")).toEqual(codeOrgConfig("crc"))
    })

    it("a missing document falls back to the code tables for crc and BL", async () => {
        expect(await getOrgConfig("crc")).toEqual(codeOrgConfig("crc"))
        expect(await getOrgConfig("brotherslazaroff")).toEqual(codeOrgConfig("brotherslazaroff"))
    })

    it("an invalid document falls back to the code tables (legacy v11 shape)", async () => {
        await getFirestore().doc("orgs/brotherslazaroff").set({ id: "brotherslazaroff", name: "Brothers Lazaroff", domain: "brotherslazaroff.live" })
        expect(await getOrgConfig("brotherslazaroff")).toEqual(codeOrgConfig("brotherslazaroff"))
    })

    it("an unknown org with no document is null", async () => {
        expect(await getOrgConfig("nava-tehila")).toBeNull()
    })

    it("a new tenant's document drives the synchronous getters once read", async () => {
        const cfg = makeTestOrgConfig()
        await getFirestore().doc(`orgs/${cfg.id}`).set(cfg)
        expect(await getOrgConfig(cfg.id)).toEqual(cfg)
        expect(peekOrgConfig(cfg.id)).toEqual(cfg)
        expect(getOrgBranding(cfg.id).shortName).toBe("Test Shul Music")
        expect(label(cfg.id, "newSetlist")).toBe("New Setlist")
    })

    it("an edited value shows up after the memory TTL is cleared", async () => {
        const cfg = makeTestOrgConfig()
        await getFirestore().doc(`orgs/${cfg.id}`).set(cfg)
        await getOrgConfig(cfg.id)
        await getFirestore().doc(`orgs/${cfg.id}`).set({ ...cfg, branding: { ...cfg.branding, shortName: "Renamed" } })
        expect((await getOrgConfig(cfg.id))?.branding.shortName).toBe("Test Shul Music") // still cached
        clearOrgConfigMemory()
        expect((await getOrgConfig(cfg.id))?.branding.shortName).toBe("Renamed")
    })
})
