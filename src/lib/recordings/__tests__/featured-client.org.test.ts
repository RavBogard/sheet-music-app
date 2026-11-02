import { beforeEach, describe, expect, it, vi } from "vitest"

const wheres: unknown[][] = []
vi.mock("firebase/firestore", () => ({
    collection: (_db: unknown, name: string) => ({ name }),
    where: (...args: unknown[]) => {
        wheres.push(args)
        return { args }
    },
    query: (...parts: unknown[]) => ({ parts }),
    onSnapshot: vi.fn(() => () => {}),
}))
vi.mock("@/lib/firebase", () => ({
    recoverFromFirestoreShutdown: vi.fn(),
    subscribeWithDb: (fn: (db: unknown) => () => void) => fn({}),
}))

import { subscribeFeaturedBySong } from "../featured-client"

describe("featured lookup is org-scoped", () => {
    beforeEach(() => {
        wheres.length = 0
    })
    it("filters recordings by the caller's orgId so another tenant's takes never load", () => {
        subscribeFeaturedBySong("crc" as never, () => {})
        subscribeFeaturedBySong("bros" as never, () => {})
        expect(wheres).toEqual([
            ["orgId", "==", "crc"],
            ["orgId", "==", "bros"],
        ])
    })
})
