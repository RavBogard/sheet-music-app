import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

// PERF-14: per-device transposition (signed-out) and capo per chart, plus the
// PERF-05 tap-zone switch, all persisted in `music-storage`.

const authState: { user: { uid: string } | null; loading: boolean } = { user: null, loading: false }
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }))
vi.mock("@/lib/musician-profile", () => ({ subscribeToMusicianProfile: vi.fn(() => () => {}) }))
vi.mock("@/lib/song-preferences", () => ({ loadSongPreference: vi.fn(), saveSongPreference: vi.fn() }))

import { useMusicStore, type QueueItem } from "@/lib/store"
import { useDeviceTranspositionPrefs } from "@/hooks/use-musician-transposition"

const item = (fileId: string, transposition?: number): QueueItem => ({ name: fileId, fileId, type: "pdf", transposition })

function persisted(): Record<string, unknown> {
    const raw = localStorage.getItem("music-storage")
    return raw ? JSON.parse(raw).state : {}
}

beforeEach(() => {
    authState.user = null
    authState.loading = false
    localStorage.clear()
    useMusicStore.setState({
        chartTransposition: {},
        chartCapo: {},
        capoSemitones: 0,
        transposition: 0,
        tapZonesEnabled: true,
        playbackQueue: [],
        queueIndex: -1,
    })
})

describe("signed-out device transposition", () => {
    it("records an adjustment per chart and restores it on return", () => {
        const s = useMusicStore.getState()
        s.setQueue([item("a"), item("b")], 0)
        renderHook(() => useDeviceTranspositionPrefs())

        act(() => useMusicStore.getState().setTransposition(-2))
        expect(useMusicStore.getState().chartTransposition).toEqual({ a: -2 })
        expect(persisted().chartTransposition).toEqual({ a: -2 })

        act(() => { useMusicStore.getState().nextSong() })
        expect(useMusicStore.getState().transposition).toBe(0)
        expect(useMusicStore.getState().chartTransposition).toEqual({ a: -2 })

        act(() => { useMusicStore.getState().prevSong() })
        expect(useMusicStore.getState().transposition).toBe(-2)
    })

    it("a leader's per-track transposition wins and is not recorded", () => {
        useMusicStore.setState({ chartTransposition: { a: 3 } })
        useMusicStore.getState().setQueue([item("a", 5)], 0)
        renderHook(() => useDeviceTranspositionPrefs())
        expect(useMusicStore.getState().transposition).toBe(5)
        act(() => useMusicStore.getState().setTransposition(7))
        expect(useMusicStore.getState().chartTransposition).toEqual({ a: 3 })
    })

    it("an explicit leader 0 ('as written') is a set value that wins; only unset leaves it to the device", () => {
        useMusicStore.setState({ chartTransposition: { a: 3, b: 3 } })
        useMusicStore.getState().setQueue([item("a", 0), item("b")], 0)
        renderHook(() => useDeviceTranspositionPrefs())
        expect(useMusicStore.getState().transposition).toBe(0)
        act(() => useMusicStore.getState().setTransposition(2))
        expect(useMusicStore.getState().chartTransposition.a).toBe(3)

        act(() => { useMusicStore.getState().nextSong() })
        expect(useMusicStore.getState().transposition).toBe(3)
    })

    it("a queue rebuild on the same chart is not recorded as the musician's choice", () => {
        useMusicStore.getState().setQueue([item("a")], 0)
        renderHook(() => useDeviceTranspositionPrefs())
        act(() => useMusicStore.getState().setTransposition(4))
        act(() => useMusicStore.getState().setQueue([item("a"), item("b")], 0))
        expect(useMusicStore.getState().chartTransposition).toEqual({ a: 4 })
        expect(useMusicStore.getState().transposition).toBe(4)
    })

    it("signed-in users are left to the Firestore preference", () => {
        authState.user = { uid: "u1" }
        useMusicStore.setState({ chartTransposition: { a: 3 } })
        useMusicStore.getState().setQueue([item("a")], 0)
        renderHook(() => useDeviceTranspositionPrefs())
        expect(useMusicStore.getState().transposition).toBe(0)
        act(() => useMusicStore.getState().setTransposition(1))
        expect(useMusicStore.getState().chartTransposition).toEqual({ a: 3 })
    })

    it("does nothing while auth is still resolving", () => {
        authState.loading = true
        useMusicStore.setState({ chartTransposition: { a: 3 } })
        useMusicStore.getState().setQueue([item("a")], 0)
        renderHook(() => useDeviceTranspositionPrefs())
        expect(useMusicStore.getState().transposition).toBe(0)
    })
})

describe("per-device capo per chart", () => {
    it("writes through for the open chart and restores on navigation", () => {
        const s = useMusicStore.getState()
        s.setQueue([item("a"), item("b"), item("c")], 0)
        useMusicStore.getState().setCapoSemitones(3)
        expect(useMusicStore.getState().chartCapo).toEqual({ a: 3 })
        expect(persisted().chartCapo).toEqual({ a: 3 })

        useMusicStore.getState().nextSong()
        // no entry for b: keeps the capo already set
        expect(useMusicStore.getState().capoSemitones).toBe(3)
        useMusicStore.getState().setCapoSemitones(0)
        useMusicStore.getState().prevSong()
        expect(useMusicStore.getState().capoSemitones).toBe(3)
        useMusicStore.getState().jumpToSong(1)
        expect(useMusicStore.getState().capoSemitones).toBe(0)
    })

    it("does not record capo for chart-less flow rows", () => {
        useMusicStore.getState().setQueue([item("flow-0")], 0)
        useMusicStore.getState().setCapoSemitones(2)
        expect(useMusicStore.getState().chartCapo).toEqual({})
    })
})

describe("tap-zone switch", () => {
    it("defaults on and persists when switched off", () => {
        expect(useMusicStore.getState().tapZonesEnabled).toBe(true)
        useMusicStore.getState().setTapZonesEnabled(false)
        expect(persisted().tapZonesEnabled).toBe(false)
    })
})
