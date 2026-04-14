/**
 * Tests for SwapChangeToast — diff logic in the performance view.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { useRef } from "react"

import { SwapChangeToast } from "../SwapChangeToast"
import type { SetlistTrack } from "@/types/models"

const toastInfo = vi.fn()
vi.mock("sonner", () => ({
    toast: { info: (...args: unknown[]) => toastInfo(...args) },
}))

function song(title: string, extra: Partial<SetlistTrack> = {}): SetlistTrack {
    return { title, type: "song", ...extra } as SetlistTrack
}

function header(title: string): SetlistTrack {
    return { title, type: "header" } as SetlistTrack
}

function Harness({ tracks, ownSwap }: { tracks: SetlistTrack[]; ownSwap?: number | null }) {
    const ref = useRef<number | null>(ownSwap ?? null)
    return <SwapChangeToast tracks={tracks} lastOwnSwapRef={ref} />
}

describe("SwapChangeToast", () => {
    beforeEach(() => {
        toastInfo.mockClear()
        cleanup()
    })

    it("does not toast on initial render", () => {
        render(<Harness tracks={[song("A"), song("B")]} />)
        expect(toastInfo).not.toHaveBeenCalled()
    })

    it("toasts with canonical copy when a song is swapped", () => {
        const { rerender } = render(<Harness tracks={[song("A"), song("B")]} />)
        rerender(<Harness tracks={[song("A"), song("C")]} />)
        expect(toastInfo).toHaveBeenCalledTimes(1)
        const [message, opts] = toastInfo.mock.calls[0]
        expect(message).toBe("Setlist updated \u2014 \u201CB\u201D \u2192 \u201CC\u201D")
        expect(opts).toMatchObject({ id: "setlist-swap-update", duration: 4000 })
    })

    it("does not toast on pure reorder (same multiset)", () => {
        const { rerender } = render(<Harness tracks={[song("A"), song("B"), song("C")]} />)
        rerender(<Harness tracks={[song("C"), song("A"), song("B")]} />)
        expect(toastInfo).not.toHaveBeenCalled()
    })

    it("does not toast when only a header title changes", () => {
        const { rerender } = render(<Harness tracks={[header("Opening"), song("A")]} />)
        rerender(<Harness tracks={[header("Welcome"), song("A")]} />)
        expect(toastInfo).not.toHaveBeenCalled()
    })

    it("does not toast for viewer's own swap (index matches lastOwnSwapRef)", () => {
        function OwnSwapHarness({ tracks }: { tracks: SetlistTrack[] }) {
            const ref = useRef<number | null>(1)
            return <SwapChangeToast tracks={tracks} lastOwnSwapRef={ref} />
        }
        const { rerender } = render(<OwnSwapHarness tracks={[song("A"), song("B")]} />)
        rerender(<OwnSwapHarness tracks={[song("A"), song("C")]} />)
        expect(toastInfo).not.toHaveBeenCalled()
    })

    it("collapses rapid successive swaps into one toast id", () => {
        const { rerender } = render(<Harness tracks={[song("A"), song("B")]} />)
        rerender(<Harness tracks={[song("A"), song("C")]} />)
        rerender(<Harness tracks={[song("A"), song("D")]} />)
        expect(toastInfo).toHaveBeenCalledTimes(2)
        const ids = toastInfo.mock.calls.map(c => (c[1] as { id: string }).id)
        expect(new Set(ids).size).toBe(1)
        expect(ids[0]).toBe("setlist-swap-update")
    })

    it("does not toast when fileId changes but title is identical (re-link)", () => {
        const { rerender } = render(
            <Harness tracks={[song("A", { fileId: "f1" } as Partial<SetlistTrack>)]} />
        )
        rerender(
            <Harness tracks={[song("A", { fileId: "f2" } as Partial<SetlistTrack>)]} />
        )
        expect(toastInfo).not.toHaveBeenCalled()
    })
})
