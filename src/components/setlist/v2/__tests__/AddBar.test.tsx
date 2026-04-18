/**
 * U02 regression — AddBar must hide when the mobile soft keyboard opens
 * so it stops overlapping service-notes / title inputs on iPhone/iPad.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { AddBar } from "../AddBar"

type VV = {
    height: number
    listeners: Map<string, Set<() => void>>
    addEventListener: (ev: string, cb: () => void) => void
    removeEventListener: (ev: string, cb: () => void) => void
    dispatch: (ev: string) => void
}

function installVisualViewport(initialHeight: number): VV {
    const listeners = new Map<string, Set<() => void>>()
    const vv: VV = {
        height: initialHeight,
        listeners,
        addEventListener(ev, cb) {
            if (!listeners.has(ev)) listeners.set(ev, new Set())
            listeners.get(ev)!.add(cb)
        },
        removeEventListener(ev, cb) {
            listeners.get(ev)?.delete(cb)
        },
        dispatch(ev) {
            listeners.get(ev)?.forEach((cb) => cb())
        },
    }
    Object.defineProperty(window, "visualViewport", {
        value: vv,
        writable: true,
        configurable: true,
    })
    return vv
}

function uninstallVisualViewport() {
    Object.defineProperty(window, "visualViewport", {
        value: undefined,
        writable: true,
        configurable: true,
    })
}

describe("AddBar (U02 — hide on soft keyboard)", () => {
    const onAddSongs = vi.fn()
    const onAddItem = vi.fn()
    const INNER = 800
    const originalInnerHeight = window.innerHeight

    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(window, "innerHeight", {
            value: INNER,
            writable: true,
            configurable: true,
        })
    })

    afterEach(() => {
        uninstallVisualViewport()
        Object.defineProperty(window, "innerHeight", {
            value: originalInnerHeight,
            writable: true,
            configurable: true,
        })
    })

    it("renders visible (no `hidden` class) by default", () => {
        installVisualViewport(INNER)
        render(<AddBar onAddSongs={onAddSongs} onAddItem={onAddItem} />)
        const bar = screen.getByTestId("add-bar")
        expect(bar.className).not.toMatch(/\bhidden\b/)
    })

    it("hides when visualViewport shrinks below 75% (keyboard open)", () => {
        const vv = installVisualViewport(INNER)
        render(<AddBar onAddSongs={onAddSongs} onAddItem={onAddItem} />)

        act(() => {
            vv.height = INNER * 0.5
            vv.dispatch("resize")
        })
        expect(screen.getByTestId("add-bar").className).toMatch(/\bhidden\b/)
    })

    it("re-shows when visualViewport returns to full height (keyboard close)", () => {
        const vv = installVisualViewport(INNER)
        render(<AddBar onAddSongs={onAddSongs} onAddItem={onAddItem} />)

        act(() => {
            vv.height = INNER * 0.5
            vv.dispatch("resize")
        })
        expect(screen.getByTestId("add-bar").className).toMatch(/\bhidden\b/)

        act(() => {
            vv.height = INNER
            vv.dispatch("resize")
        })
        expect(screen.getByTestId("add-bar").className).not.toMatch(/\bhidden\b/)
    })

    it("no-ops (no crash) when window.visualViewport is undefined", () => {
        uninstallVisualViewport()
        expect(() =>
            render(<AddBar onAddSongs={onAddSongs} onAddItem={onAddItem} />)
        ).not.toThrow()
        expect(screen.getByTestId("add-bar").className).not.toMatch(/\bhidden\b/)
    })

    it("keeps the + Add Item trigger button present and 44px-compliant", () => {
        installVisualViewport(INNER)
        render(<AddBar onAddSongs={onAddSongs} onAddItem={onAddItem} />)
        const trigger = screen.getByRole("button", { name: /add item/i })
        expect(trigger).toBeDefined()
        // U01 floor preserved: button keeps h-11 sizing token
        expect(trigger.className).toMatch(/\bh-11\b/)
    })

    it("removes its visualViewport listener on unmount", () => {
        const vv = installVisualViewport(INNER)
        const { unmount } = render(<AddBar onAddSongs={onAddSongs} onAddItem={onAddItem} />)
        expect(vv.listeners.get("resize")?.size).toBe(1)
        unmount()
        expect(vv.listeners.get("resize")?.size ?? 0).toBe(0)
    })
})
