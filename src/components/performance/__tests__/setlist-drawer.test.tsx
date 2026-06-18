import "@testing-library/jest-dom"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// WS-08 (v11.6-02-07): opening a song from the in-chart Setlist drawer must jump
// WITHIN the live playbackQueue (store.jumpToSong) so Next/Prev keep traversing
// the whole setlist — it must NOT router.push to the standalone single-chart
// /perform/<fileId> route, which drops the queue and dead-ends at "Song 1 of 1".
// This integration test mounts the full SetlistDrawer with the virtualizer mocked
// so every QueueRow renders in jsdom, and proves the open handler wiring.

// jsdom lacks ResizeObserver / scrollIntoView / pointer-capture that radix
// Dialog (Sheet) touches on open. Stub before the component renders.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub
if (typeof Element !== "undefined") {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    if (!Element.prototype.hasPointerCapture)
        Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture)
        Element.prototype.releasePointerCapture = () => {}
}

const h = vi.hoisted(() => ({
    jumpToSong: vi.fn(),
    setQueue: vi.fn(),
    routerPush: vi.fn(),
    queue: [
        { name: "Adon Olam", fileId: "file-0", type: "pdf" },
        { name: "Hashkivenu", fileId: "file-1", type: "pdf" },
        // unbonded flow item — no fileId → must stay a no-op on tap
        { name: "Silent Meditation", fileId: "", type: "pdf", trackType: "prayer" },
    ] as unknown[],
}))

// Render every flattened item as a virtual row so the QueueRows mount in jsdom.
vi.mock("@tanstack/react-virtual", () => ({
    useVirtualizer: (opts: { count: number }) => ({
        getTotalSize: () => opts.count * 80,
        getVirtualItems: () =>
            Array.from({ length: opts.count }, (_, index) => ({
                index,
                key: index,
                size: 80,
                start: index * 80,
            })),
        measure: vi.fn(),
        scrollToIndex: vi.fn(),
    }),
}))

vi.mock("@/lib/store", () => ({
    useMusicStore: () => ({
        playbackQueue: h.queue,
        queueIndex: 0,
        setQueue: h.setQueue,
        jumpToSong: h.jumpToSong,
    }),
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: h.routerPush }),
}))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }))
vi.mock("@/lib/org/org-context", () => ({ useOrg: () => "crc" }))
vi.mock("@/lib/setlist-firebase", () => ({
    createSetlistService: () => ({ subscribeToAllSetlists: () => () => {} }),
}))
vi.mock("@/lib/firestore-helpers", () => ({ toDate: (v: unknown) => v }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/local/schema", () => ({ getDb: () => ({ tracks: {} }) }))
vi.mock("@/lib/client-tracks", () => ({ getTracksForSetlistClient: () => [] }))

import { SetlistDrawer } from "../SetlistDrawer"

function openDrawer() {
    render(<SetlistDrawer />)
    // The trigger reads "Setlist" when the queue is populated.
    fireEvent.click(screen.getByTitle("Setlist"))
}

describe("SetlistDrawer — WS-08 drawer open preserves the queue", () => {
    beforeEach(() => vi.clearAllMocks())

    it("AC-1: tapping a song row jumps WITHIN the queue (jumpToSong) and never router.pushes", () => {
        openDrawer()
        // Hashkivenu is playbackQueue index 1.
        fireEvent.click(screen.getByRole("button", { name: /Hashkivenu/ }))
        expect(h.jumpToSong).toHaveBeenCalledTimes(1)
        expect(h.jumpToSong).toHaveBeenCalledWith(1)
        expect(h.routerPush).not.toHaveBeenCalled()
    })

    it("AC-1: the first song row jumps to its own index", () => {
        openDrawer()
        fireEvent.click(screen.getByRole("button", { name: /Adon Olam/ }))
        expect(h.jumpToSong).toHaveBeenCalledWith(0)
        expect(h.routerPush).not.toHaveBeenCalled()
    })

    it("AC-2: tapping a no-fileId flow row is a no-op (no jump, no navigation)", () => {
        openDrawer()
        fireEvent.click(screen.getByRole("button", { name: /Silent Meditation/ }))
        expect(h.jumpToSong).not.toHaveBeenCalled()
        expect(h.routerPush).not.toHaveBeenCalled()
    })
})
