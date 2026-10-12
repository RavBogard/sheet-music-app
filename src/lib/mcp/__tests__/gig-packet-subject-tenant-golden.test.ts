// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PDFDocument } from "pdf-lib"

/**
 * Multi-tenant phase 1 golden: the gig packet PDF's Subject and Title. crc and
 * brotherslazaroff setlists keep today's exact metadata; a testshul setlist's
 * packet carries its own tenant's subject.
 */

const h = vi.hoisted(() => ({
    setlist: {} as Record<string, unknown>,
    saved: [] as Buffer[],
}))

// Multi-tenant P2: role reads go through @/lib/org/access (spec behaviour fake).
vi.mock("@/lib/org/access", () => import("@/test-stubs/org-access-fake"))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: vi.fn(async () => [{ id: "t1", fileId: "f1", title: "Song One", type: "song" }]),
}))
vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: vi.fn(async () => ({
        buffer: Buffer.from("Verse\nG       C\nla la la"),
        contentType: "text/plain",
        source: "firebase-storage",
    })),
}))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({
        collection: (name: string) => ({
            doc: (id: string) => ({
                get: async () =>
                    name === "users"
                        ? { exists: true, id, data: () => ({ role: "admin" }) }
                        : { exists: true, id, data: () => h.setlist },
            }),
        }),
    }),
}))
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: () => ({
                save: async (buf: Buffer) => {
                    h.saved.push(buf)
                },
                getSignedUrl: async () => ["https://signed.example/packet.pdf"],
            }),
        }),
    }),
}))

import { generateGigPacket } from "@/lib/mcp/tools/library-download"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"

async function packetMeta(orgId?: string) {
    h.saved = []
    h.setlist = { name: "Friday Night Set", ...(orgId ? { orgId } : {}) }
    const r = await generateGigPacket("leader", { setlistId: "sl-1" })
    expect(r).toMatchObject({ ok: true, packetTitle: "Friday Night Set — Gig Packet" })
    expect(h.saved).toHaveLength(1)
    const doc = await PDFDocument.load(h.saved[0], { updateMetadata: false })
    return { subject: doc.getSubject(), title: doc.getTitle() }
}

const GOLDEN = { subject: "CRC Music Books gig packet", title: "Friday Night Set — Gig Packet" }

beforeEach(() => {
    clearPrimedOrgConfigs()
})

describe("golden: gig packet metadata", () => {
    it("golden unstamped setlist (crc)", async () => {
        expect(await packetMeta()).toEqual(GOLDEN)
    })
    it("golden crc setlist", async () => {
        expect(await packetMeta("crc")).toEqual(GOLDEN)
    })
    it("golden brotherslazaroff setlist (frozen CRC subject)", async () => {
        expect(await packetMeta("brotherslazaroff")).toEqual(GOLDEN)
    })
})

describe("testshul: gig packet subject reads tenant config", () => {
    it("a testshul setlist's packet carries the tenant subject", async () => {
        primeTestOrg()
        expect(await packetMeta("testshul")).toEqual({ subject: "Test Shul Music Books gig packet", title: GOLDEN.title })
    })
})
