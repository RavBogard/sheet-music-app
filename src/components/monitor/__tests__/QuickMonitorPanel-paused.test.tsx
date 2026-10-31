import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

/**
 * MIXER-09: when the bridge is down the popover keeps the last known levels on
 * screen (under the offline overlay) and says, in words, that the wedge is
 * unchanged and who restarts the bridge, instead of one bare status line.
 */

const store = vi.hoisted(() => ({
    state: {} as Record<string, unknown>,
}))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u" } }) }))
vi.mock("@/hooks/use-monitor-access", () => ({ useMonitorAccess: () => ({ hasAccess: true }) }))
vi.mock("@/hooks/use-monitor-connection", () => ({ getMonitorClient: () => null }))
vi.mock("@/lib/monitor/use-monitor-staleness", () => ({ useMonitorStaleness: () => ({ stale: false }) }))
vi.mock("@/lib/firebase", () => ({ getDb: () => Promise.resolve({}) }))
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: () => Promise.resolve({ exists: () => false }) }))
vi.mock("@/components/monitor/SavedMixControls", () => ({ SavedMixControls: () => <div data-testid="saved-mix-controls" /> }))
vi.mock("@/components/monitor/VerticalFaderStrip", () => ({
    VerticalFaderStrip: ({ label }: { label: string }) => <div data-testid={`vfader-${label}`} />,
}))
vi.mock("@/components/ui/scroll-fade", () => ({
    ScrollFade: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/monitor/ConnectionIndicator", () => ({
    getBridgeStatusMessage: () => "Bridge is offline",
    isMixerOffline: () => true,
    isStateSyncing: () => false,
    DisconnectedOverlay: ({ active, children }: { active: boolean; children: React.ReactNode }) => (
        <div data-testid="overlay" data-active={active}>{children}</div>
    ),
}))
vi.mock("@/lib/monitor-store", () => ({
    useMonitorStore: (sel: (s: Record<string, unknown>) => unknown) => sel(store.state),
    getVisibleChannels: (d: number[]) => d,
}))

import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"

function seed(myBusIndex: number | null) {
    store.state = {
        status: "connected",
        channels: [{ index: 1, name: "Kick" }],
        buses: [{ index: 5, name: "Rabbi", fader: 0.6, sends: [{ channelIndex: 1, level: 0.5, on: true }] }],
        config: { bridge: { status: "offline" } },
        myBusIndex,
        myBusIndices: myBusIndex == null ? [] : [myBusIndex],
        snapshotCount: 1,
        unconfirmed: [],
        rejections: {},
        clamps: {},
        homeLevels: {},
        starredChannels: [],
        defaultChannels: [1],
    }
}

describe("QuickMonitorPanel with the bridge down (MIXER-09)", () => {
    it("keeps the last known faders under the overlay and says the wedge is unchanged", () => {
        seed(5)
        render(<QuickMonitorPanel />)
        expect(screen.getByTestId("monitor-paused").textContent).toMatch(/wedge sounds the same/i)
        expect(screen.getByTestId("overlay").getAttribute("data-active")).toBe("true")
        expect(screen.getByTestId("vfader-Kick")).toBeTruthy()
    })

    it("with no bus to show, still says it plainly", () => {
        seed(null)
        render(<QuickMonitorPanel />)
        expect(screen.getByTestId("monitor-paused")).toBeTruthy()
        expect(screen.queryByTestId("overlay")).toBeNull()
    })
})
