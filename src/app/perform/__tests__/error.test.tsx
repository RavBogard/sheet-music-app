/**
 * PGR-11 — perform/error.tsx routes the band's hot-route chart-render
 * failures to Sentry on mount. Previously the boundary's `_error` prop was
 * discarded, so an iPad chart-render crash mid-service never reached Daniel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

import PerformError from "../error"
import { captureException } from "@/lib/error-reporting"

vi.mock("@/lib/error-reporting", () => ({
    captureException: vi.fn(),
}))
vi.mock("next/navigation", () => ({
    useRouter: () => ({ back: vi.fn() }),
}))

describe("PerformError (perform/error.tsx)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        cleanup()
    })
    afterEach(() => cleanup())

    it("captures the render error to Sentry on mount with source/location tags", () => {
        const error = Object.assign(new Error("react-pdf blew up"), {
            digest: "abc123",
        })
        render(<PerformError error={error} reset={vi.fn()} />)

        expect(captureException).toHaveBeenCalledTimes(1)
        expect(captureException).toHaveBeenCalledWith(error, {
            source: "client",
            location: "perform/error",
            extra: { digest: "abc123" },
        })
    })

    it("still renders the recovery UI (heading + Go Back + Retry)", () => {
        render(<PerformError error={new Error("boom")} reset={vi.fn()} />)
        // getByText / getByRole throw if absent, so these assert presence.
        expect(screen.getByText("Chart failed to load")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Go Back" })).toBeTruthy()
    })
})
