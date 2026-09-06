import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
    decoded: { uid: "user-1", role: "member", orgIds: ["crc"] } as Record<string, unknown>,
    profile: { role: "member", orgIds: ["crc"], readerMusicEnabled: true } as Record<string, unknown>,
    verifyIdToken: vi.fn(),
    updated: vi.fn(),
}))

vi.mock("firebase-admin/auth", () => ({
    getAuth: () => ({ verifyIdToken: state.verifyIdToken }),
}))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true }))
vi.mock("firebase-admin/firestore", () => ({
    getFirestore: () => ({
        collection: (name: string) => ({
            doc: (id: string) => ({
                get: vi.fn(async () => ({
                    exists: name === "users" && id === state.decoded.uid,
                    data: () => state.profile,
                })),
                update: state.updated,
            }),
        }),
    }),
}))
vi.mock("@/lib/file-fetcher", () => ({ fetchFileById: vi.fn() }))
vi.mock("@/lib/server-tracks", () => ({ getTracksForSetlist: vi.fn() }))

import {
    authorizeReaderMusic,
    setReaderMusicPreference,
} from "@/lib/reader-music-server"

describe("reader music account access", () => {
    beforeEach(() => {
        state.decoded = { uid: "user-1", role: "member", orgIds: ["crc"] }
        state.profile = { role: "member", orgIds: ["crc"], readerMusicEnabled: true }
        state.verifyIdToken.mockReset()
        state.verifyIdToken.mockImplementation(async () => state.decoded)
        state.updated.mockReset()
    })

    it("rejects unauthenticated requests", async () => {
        const request = new Request("https://centralreform.live/api/reader/music/select")
        await expect(authorizeReaderMusic(request, true)).resolves.toEqual({
            ok: false,
            kind: "unauthenticated",
        })
    })

    it("rejects cross-org identities before any music lookup", async () => {
        state.decoded.orgIds = ["brotherslazaroff"]
        state.profile.orgIds = ["brotherslazaroff"]
        const request = new Request("https://centralreform.live/api/reader/music/select", {
            headers: { Authorization: "Bearer firebase-id-token" },
        })
        await expect(authorizeReaderMusic(request, true)).resolves.toEqual({
            ok: false,
            kind: "forbidden",
        })
    })

    it("checks Firebase token revocation rather than accepting a cached ID token", async () => {
        const request = new Request("https://centralreform.live/api/reader/music/select", {
            headers: { Authorization: "Bearer firebase-id-token" },
        })
        await expect(authorizeReaderMusic(request, true)).resolves.toMatchObject({
            ok: true,
            uid: "user-1",
        })
        expect(state.verifyIdToken).toHaveBeenCalledWith("firebase-id-token", true)
    })

    it("treats a missing opt-in as false", async () => {
        delete state.profile.readerMusicEnabled
        const request = new Request("https://centralreform.live/api/reader/music/select", {
            headers: { Authorization: "Bearer firebase-id-token" },
        })
        await expect(authorizeReaderMusic(request, true)).resolves.toEqual({
            ok: false,
            kind: "forbidden",
        })
    })

    it("surfaces a missing opt-in as false on the preference read", async () => {
        delete state.profile.readerMusicEnabled
        const request = new Request("https://centralreform.live/api/reader/music/preference", {
            headers: { Authorization: "Bearer firebase-id-token" },
        })
        await expect(authorizeReaderMusic(request, false)).resolves.toMatchObject({
            ok: true,
            uid: "user-1",
            readerMusicEnabled: false,
        })
    })

    it("updates only the authenticated user's preference", async () => {
        await setReaderMusicPreference("user-1", false)
        expect(state.updated).toHaveBeenCalledWith({ readerMusicEnabled: false })
    })
})
