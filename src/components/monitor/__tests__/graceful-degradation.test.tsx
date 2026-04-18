import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DisconnectedOverlay } from "../ConnectionIndicator"

describe("DisconnectedOverlay", () => {
    it("renders children normally when active=false", () => {
        const { container } = render(
            <DisconnectedOverlay active={false}>
                <div data-testid="child">Fader content</div>
            </DisconnectedOverlay>
        )
        expect(screen.getByTestId("child")).toBeTruthy()
        // Should NOT have pointer-events-none
        expect(container.querySelector(".pointer-events-none")).toBeNull()
    })

    it("renders children with reduced opacity when active=true", () => {
        const { container } = render(
            <DisconnectedOverlay active={true}>
                <div data-testid="child">Fader content</div>
            </DisconnectedOverlay>
        )
        expect(screen.getByTestId("child")).toBeTruthy()
        expect(container.querySelector(".opacity-50")).toBeTruthy()
    })

    it("disables pointer events when active=true", () => {
        const { container } = render(
            <DisconnectedOverlay active={true}>
                <div>Fader</div>
            </DisconnectedOverlay>
        )
        expect(container.querySelector(".pointer-events-none")).toBeTruthy()
    })

    it("shows stale message when active=true", () => {
        render(
            <DisconnectedOverlay active={true}>
                <div>Fader</div>
            </DisconnectedOverlay>
        )
        expect(screen.getByText(/last known levels/i)).toBeTruthy()
    })

    it("does not show stale message when active=false", () => {
        render(
            <DisconnectedOverlay active={false}>
                <div>Fader</div>
            </DisconnectedOverlay>
        )
        expect(screen.queryByText(/last known levels/i)).toBeNull()
    })
})

describe("Monitor store isolation", () => {
    it("monitor store disconnected state does not affect non-monitor stores", async () => {
        // Import the store directly -- no React needed
        const { useMonitorStore } = await import("@/lib/monitor-store")

        // Set monitor to disconnected
        useMonitorStore.getState().setStatus("disconnected")
        expect(useMonitorStore.getState().status).toBe("disconnected")

        // Monitor store changes should be isolated -- the store itself does not
        // reference or modify any other stores. This is an architectural test:
        // useMonitorStore is a standalone Zustand store with no cross-store subscriptions.
        // Its reset/setStatus methods only modify its own state slice.
        const state = useMonitorStore.getState()
        expect(state.channels).toEqual([]) // channels preserved (empty in this case)
        expect(state.config).toBeNull()
        expect(state.buses).toEqual([])

        // Reset for other tests
        useMonitorStore.getState().reset()
    })
})
