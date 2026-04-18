/**
 * Tests for PerformanceOfflineIndicator — IDB-backed N/M charts ready.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"

import { PerformanceOfflineIndicator } from "../PerformanceOfflineIndicator"

const listFileIdsMock = vi.fn<() => Promise<string[]>>(async () => [])
const loggerWarn = vi.fn()

vi.mock("@/lib/offline-idb", () => ({
    listFileIds: () => listFileIdsMock(),
}))
vi.mock("@/lib/logger", () => ({
    logger: { warn: (...a: unknown[]) => loggerWarn(...a), error: vi.fn(), info: vi.fn() },
}))

function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => value,
    })
}

async function flush() {
    // Let the async IDB-read effect settle.
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
}

describe("PerformanceOfflineIndicator", () => {
    beforeEach(() => {
        listFileIdsMock.mockReset()
        loggerWarn.mockReset()
        setOnline(true)
    })
    afterEach(() => {
        cleanup()
    })

    it("renders nothing when online and no reconnect pulse", () => {
        setOnline(true)
        const { container } = render(
            <PerformanceOfflineIndicator setlistFileIds={["a", "b"]} />
        )
        expect(container.textContent).toBe("")
    })

    it("shows N/M CHARTS READY when offline with fileIds and IDB data", async () => {
        setOnline(false)
        listFileIdsMock.mockResolvedValueOnce(["a", "b", "x"])
        render(<PerformanceOfflineIndicator setlistFileIds={["a", "b", "c"]} />)
        await flush()
        expect(screen.getByText(/OFFLINE \u2014 2\/3 CHARTS READY/)).toBeDefined()
    })

    it("shows plain OFFLINE MODE when offline with empty fileIds", async () => {
        setOnline(false)
        render(<PerformanceOfflineIndicator setlistFileIds={[]} />)
        await flush()
        expect(screen.getByText("OFFLINE MODE")).toBeDefined()
        expect(listFileIdsMock).not.toHaveBeenCalled()
    })

    it("falls back to OFFLINE MODE when listFileIds throws", async () => {
        setOnline(false)
        listFileIdsMock.mockRejectedValueOnce(new Error("idb boom"))
        render(<PerformanceOfflineIndicator setlistFileIds={["a", "b"]} />)
        await flush()
        expect(screen.getByText("OFFLINE MODE")).toBeDefined()
        expect(loggerWarn).toHaveBeenCalled()
    })

    it("shows 0/M when IDB has none of the setlist's fileIds", async () => {
        setOnline(false)
        listFileIdsMock.mockResolvedValueOnce(["z", "y"])
        render(<PerformanceOfflineIndicator setlistFileIds={["a", "b"]} />)
        await flush()
        expect(screen.getByText(/OFFLINE \u2014 0\/2 CHARTS READY/)).toBeDefined()
    })
})
