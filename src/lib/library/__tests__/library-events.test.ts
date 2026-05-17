/**
 * Cycle-3 NEW-3 (A3) — unit tests for the `library.row.created` event bus.
 *
 * Verifies the atomic-guard contract: a subscriber throwing or rejecting
 * must NEVER propagate back to the caller of emitLibraryRowCreated. The
 * caller is processChartUpload, mid-import — a propagation would
 * effectively roll back a successful import for an advisory failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
    emitLibraryRowCreated,
    emitLibraryRowCreatedAndWait,
    onLibraryRowCreated,
    __getLibraryEventHandlerCountForTesting,
    __resetLibraryEventHandlersForTesting,
    type LibraryRowCreatedEvent,
} from "../library-events"

function makeEvent(
    overrides: Partial<LibraryRowCreatedEvent> = {},
): LibraryRowCreatedEvent {
    return {
        rowId: "upload-abc-123",
        fileId: "upload-abc-123",
        source: "upload",
        nameLower: "shalom rav (frankel)",
        title: "Shalom Rav (Frankel)",
        mimeType: "application/pdf",
        sizeBytes: 12345,
        collection: "supplemental",
        storagePath: "library/upload-abc-123.pdf",
        contentHash: "a".repeat(64),
        uploaderUid: "rabbi-daniel",
        ...overrides,
    }
}

describe("library-events bus", () => {
    beforeEach(() => {
        __resetLibraryEventHandlersForTesting()
    })

    afterEach(() => {
        __resetLibraryEventHandlersForTesting()
    })

    it("delivers events to every registered subscriber", () => {
        const a = vi.fn()
        const b = vi.fn()
        onLibraryRowCreated(a)
        onLibraryRowCreated(b)

        const event = makeEvent()
        emitLibraryRowCreated(event)

        expect(a).toHaveBeenCalledTimes(1)
        expect(a).toHaveBeenCalledWith(event)
        expect(b).toHaveBeenCalledTimes(1)
    })

    it("returns an unsubscribe handle", () => {
        const a = vi.fn()
        const off = onLibraryRowCreated(a)
        off()
        emitLibraryRowCreated(makeEvent())
        expect(a).not.toHaveBeenCalled()
        expect(__getLibraryEventHandlerCountForTesting()).toBe(0)
    })

    it("a synchronously-thrown subscriber does NOT prevent later subscribers from firing", () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const a = vi.fn(() => {
            throw new Error("boom")
        })
        const b = vi.fn()
        onLibraryRowCreated(a)
        onLibraryRowCreated(b)

        // Must not throw — atomic-guard contract.
        expect(() => emitLibraryRowCreated(makeEvent())).not.toThrow()
        expect(a).toHaveBeenCalledTimes(1)
        expect(b).toHaveBeenCalledTimes(1)
        errSpy.mockRestore()
    })

    it("an async subscriber that rejects does NOT throw to the caller", () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        onLibraryRowCreated(async () => {
            throw new Error("async boom")
        })
        expect(() => emitLibraryRowCreated(makeEvent())).not.toThrow()
        errSpy.mockRestore()
    })

    it("emitLibraryRowCreatedAndWait awaits each handler in order", async () => {
        const order: string[] = []
        onLibraryRowCreated(async () => {
            await new Promise((r) => setTimeout(r, 5))
            order.push("a")
        })
        onLibraryRowCreated(async () => {
            order.push("b")
        })
        await emitLibraryRowCreatedAndWait(makeEvent())
        expect(order).toEqual(["a", "b"])
    })

    it("emitLibraryRowCreatedAndWait swallows handler rejection", async () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const after = vi.fn()
        onLibraryRowCreated(async () => {
            throw new Error("rejected")
        })
        onLibraryRowCreated(after)
        await expect(
            emitLibraryRowCreatedAndWait(makeEvent()),
        ).resolves.toBeUndefined()
        expect(after).toHaveBeenCalledTimes(1)
        errSpy.mockRestore()
    })
})
