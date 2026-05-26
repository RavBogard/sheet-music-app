import { describe, it, expect, vi } from "vitest"

// Electron isn't loaded in the vitest harness; stub the surface we touch.
// Only `createTrayIcon` exercises this — `pickTrayColor` and
// `renderTrayIconBuffer` are pure and would work without the stub.
vi.mock("electron", () => {
    return {
        nativeImage: {
            createFromBuffer: (buf: Buffer, opts: { width: number; height: number }) => ({
                __isStub: true,
                buf,
                opts,
                getSize: () => ({ width: opts.width, height: opts.height }),
            }),
        },
    }
})

import { pickTrayColor, renderTrayIconBuffer, createTrayIcon } from "../tray-icon"

/**
 * Lane #9 / F-A3 — tray-icon health-color selector + factory.
 *
 * `pickTrayColor` is the load-bearing piece: it's the only logic that
 * decides what color the tray operator sees. The factory + buffer renderer
 * are dumb pipelines around it; we still smoke them to catch shape
 * regressions (RGBA layout, anti-aliased edge, alpha bounds).
 */

describe("pickTrayColor", () => {
    describe("red — X32 unreachable / defensive default", () => {
        it("returns red when status is null", () => {
            expect(pickTrayColor(null)).toBe("red")
        })

        it("returns red when status is undefined", () => {
            expect(pickTrayColor(undefined)).toBe("red")
        })

        it("returns red when x32Connected is false", () => {
            expect(pickTrayColor({ x32Connected: false })).toBe("red")
        })

        it("returns red when x32Connected is missing (undefined)", () => {
            expect(pickTrayColor({})).toBe("red")
        })

        it("returns red when x32Connected is false even with fresh state (impossible-but-defensive)", () => {
            // The truth table says "any non-true x32Connected → red"; stateFresh
            // can't override a dead socket.
            expect(pickTrayColor({ x32Connected: false, stateFresh: true })).toBe("red")
        })

        it("does not treat truthy non-boolean x32Connected as connected (strict ===)", () => {
            // pickTrayColor uses `!== true`, so 1, "true", {} all read as "not connected".
            // This protects against accidentally widening the contract via JSON-coerced fields.
            expect(pickTrayColor({ x32Connected: 1 as unknown as boolean })).toBe("red")
            expect(pickTrayColor({ x32Connected: "true" as unknown as boolean })).toBe("red")
        })
    })

    describe("orange — X32 connected but state writes are stale", () => {
        it("returns orange when x32Connected true AND stateFresh false", () => {
            expect(pickTrayColor({ x32Connected: true, stateFresh: false })).toBe("orange")
        })
    })

    describe("green — fully healthy / forward-compat default", () => {
        it("returns green when x32Connected true AND stateFresh true", () => {
            expect(pickTrayColor({ x32Connected: true, stateFresh: true })).toBe("green")
        })

        it("returns green when x32Connected true AND stateFresh undefined (current prod shape)", () => {
            // BridgeInternalStatus today (v10.0.5 / 048297c8c) only exposes
            // x32Connected. The orange branch is dormant — pickTrayColor must
            // NOT decay to red when stateFresh isn't surfaced; the tray would
            // never go green on a healthy bridge.
            expect(pickTrayColor({ x32Connected: true })).toBe("green")
        })
    })
})

describe("renderTrayIconBuffer", () => {
    it("returns an RGBA buffer of size*size*4 bytes", () => {
        const buf = renderTrayIconBuffer("green", 16)
        expect(buf.length).toBe(16 * 16 * 4)
    })

    it("paints the center pixel with the requested color at full alpha", () => {
        const size = 16
        const buf = renderTrayIconBuffer("red", size)
        // Center-ish pixel (within the inner-disc threshold dist < size/2 - 0.5).
        const offset = (8 * size + 8) * 4
        expect(buf[offset]).toBe(0xef) // tailwind red-500 R
        expect(buf[offset + 1]).toBe(0x44) // G
        expect(buf[offset + 2]).toBe(0x44) // B
        expect(buf[offset + 3]).toBe(0xff) // full alpha
    })

    it("paints the orange and green centers with their tints", () => {
        const size = 16
        const orange = renderTrayIconBuffer("orange", size)
        const green = renderTrayIconBuffer("green", size)
        const center = (8 * size + 8) * 4
        expect([orange[center], orange[center + 1], orange[center + 2]]).toEqual([0xf5, 0x9e, 0x0b])
        expect([green[center], green[center + 1], green[center + 2]]).toEqual([0x10, 0xb9, 0x81])
    })

    it("leaves the corner pixel transparent (outside the circle)", () => {
        const buf = renderTrayIconBuffer("green", 16)
        // (0,0) is well outside the inscribed circle.
        expect(buf[3]).toBe(0) // alpha
    })

    it("keeps all alpha values within [0, 255]", () => {
        const buf = renderTrayIconBuffer("orange", 16)
        for (let i = 3; i < buf.length; i += 4) {
            expect(buf[i]).toBeGreaterThanOrEqual(0)
            expect(buf[i]).toBeLessThanOrEqual(255)
        }
    })
})

describe("createTrayIcon", () => {
    it("delegates to nativeImage.createFromBuffer with a 16×16 RGBA buffer", () => {
        const icon = createTrayIcon("green") as unknown as {
            __isStub: boolean
            buf: Buffer
            opts: { width: number; height: number }
        }
        expect(icon.__isStub).toBe(true)
        expect(icon.opts).toEqual({ width: 16, height: 16 })
        expect(icon.buf.length).toBe(16 * 16 * 4)
    })

    it("produces a different buffer per color (red ≠ green ≠ orange)", () => {
        const red = createTrayIcon("red") as unknown as { buf: Buffer }
        const green = createTrayIcon("green") as unknown as { buf: Buffer }
        const orange = createTrayIcon("orange") as unknown as { buf: Buffer }
        expect(red.buf.equals(green.buf)).toBe(false)
        expect(green.buf.equals(orange.buf)).toBe(false)
        expect(red.buf.equals(orange.buf)).toBe(false)
    })
})
