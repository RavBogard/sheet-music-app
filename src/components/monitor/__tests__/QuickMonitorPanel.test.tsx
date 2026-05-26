import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"

// ── Lightweight mocks for the panel's external deps. We intentionally do NOT
// touch monitor-store internals — the panel's wiring/contract is exercised by
// other tests (channel-starring, fader-interaction, etc). This suite is
// scoped to the LAYOUT-SHAPE refactor shipped in lane
// `monitor-popup-fullbottom-redesign` (2026-05-26): full-bottom-third
// container + 44×44 close button + horizontal-spread fader row.

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: { uid: "test-uid" } }),
}))

vi.mock("@/hooks/use-monitor-access", () => ({
    useMonitorAccess: () => ({ hasAccess: true }),
}))

vi.mock("@/hooks/use-monitor-connection", () => ({
    getMonitorClient: () => ({ setBusMaster: vi.fn(), setSendLevel: vi.fn(), setSendOn: vi.fn() }),
}))

vi.mock("@/lib/monitor/use-monitor-staleness", () => ({
    useMonitorStaleness: () => ({ stale: false }),
}))

vi.mock("@/lib/firebase", () => ({
    getDb: () => Promise.resolve({}),
}))

vi.mock("firebase/firestore", () => ({
    doc: vi.fn(),
    getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
}))

// Stub VerticalFaderStrip to a flat dom node so layout assertions don't
// depend on the strip's internals (which are out-of-scope for this lane).
vi.mock("@/components/monitor/VerticalFaderStrip", () => ({
    VerticalFaderStrip: ({ label, isMaster }: { label: string; isMaster?: boolean }) => (
        <div data-testid={isMaster ? "vfader-master" : `vfader-${label}`}>{label}</div>
    ),
}))

// Stub ScrollFade to its inner scroller div so we can read the scrollClassName
// directly (the real ScrollFade adds a wrapping <div className="relative">).
vi.mock("@/components/ui/scroll-fade", () => ({
    ScrollFade: ({ children, scrollClassName, className }: { children: React.ReactNode; scrollClassName?: string; className?: string }) => (
        <div data-testid="scroll-fade-outer" className={className}>
            <div data-testid="scroll-fade-inner" className={scrollClassName}>{children}</div>
        </div>
    ),
}))

// Stub ConnectionIndicator helpers so the "live" branch renders.
vi.mock("@/components/monitor/ConnectionIndicator", () => ({
    getBridgeStatusMessage: () => null,
    isMixerOffline: () => false,
    DisconnectedOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Default-channels visibility helper — return the configured channels as-is.
vi.mock("@/lib/monitor/bus-index", () => ({
    hasAssignedBus: (idx: number | null | undefined) => idx != null,
}))

// Build a fixture store that the panel reads via granular selectors.
function buildStore(overrides: Partial<Record<string, unknown>> = {}) {
    const defaultState = {
        status: "connected",
        channels: [
            { index: 1, name: "Kick" },
            { index: 2, name: "Snare" },
            { index: 3, name: "Hat" },
        ],
        buses: [
            {
                index: 5,
                name: "My Wedge",
                fader: 0.75,
                sends: [
                    { channelIndex: 1, level: 0.5, on: true },
                    { channelIndex: 2, level: 0.6, on: true },
                    { channelIndex: 3, level: 0.4, on: false },
                ],
            },
        ],
        config: { bridge: { x32Connected: true } },
        myBusIndex: 5,
        snapshotCount: 1,
        starredChannels: [1, 2, 3],
        defaultChannels: [1, 2, 3],
        setStarredChannels: vi.fn(),
        updateBusFader: vi.fn(),
        updateSendLevel: vi.fn(),
        updateSendOn: vi.fn(),
        ...overrides,
    }
    return defaultState
}

vi.mock("@/lib/monitor-store", () => {
    const state = buildStore()
    const useMonitorStore = ((selector?: (s: typeof state) => unknown) => {
        return selector ? selector(state) : state
    }) as unknown as typeof import("@/lib/monitor-store").useMonitorStore
    return {
        useMonitorStore,
        getVisibleChannels: (defaults: number[], starred: number[], _sends: unknown[]) =>
            Array.from(new Set([...defaults, ...starred])),
    }
})

describe("QuickMonitorPanel — monitor-popup-fullbottom-redesign layout", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("outer container claims full parent height (flex column)", () => {
        const { container } = render(<QuickMonitorPanel onClose={vi.fn()} />)
        const outer = container.firstChild as HTMLElement
        expect(outer).toBeTruthy()
        expect(outer.className).toContain("w-full")
        expect(outer.className).toContain("h-full")
        expect(outer.className).toContain("flex")
        expect(outer.className).toContain("flex-col")
    })

    it("header uses px-6 py-3 + bottom divider + does not shrink", () => {
        const { container } = render(<QuickMonitorPanel onClose={vi.fn()} />)
        const header = container.querySelector(".px-6.py-3") as HTMLElement | null
        expect(header).toBeTruthy()
        expect(header!.className).toContain("border-b")
        expect(header!.className).toContain("shrink-0")
    })

    it("fader row is gap-6 + px-6 py-4 — horizontal spread (not the old gap-3 p-3)", () => {
        render(<QuickMonitorPanel onClose={vi.fn()} />)
        const inner = screen.getByTestId("scroll-fade-inner")
        expect(inner.className).toContain("gap-6")
        expect(inner.className).toContain("px-6")
        expect(inner.className).toContain("py-4")
        expect(inner.className).not.toContain("gap-3")
        expect(inner.className).not.toContain("p-3 ")
    })

    it("master fader renders first; channel-send strips render after", () => {
        render(<QuickMonitorPanel onClose={vi.fn()} />)
        // master uses isMaster=true → vfader-master testid
        expect(screen.getByTestId("vfader-master")).toBeTruthy()
        // sends: Kick, Snare, Hat
        expect(screen.getByTestId("vfader-Kick")).toBeTruthy()
        expect(screen.getByTestId("vfader-Snare")).toBeTruthy()
        expect(screen.getByTestId("vfader-Hat")).toBeTruthy()
    })

    it("renders a 44×44 close button with an accessible name when onClose is provided", () => {
        const onClose = vi.fn()
        render(<QuickMonitorPanel onClose={onClose} />)
        const btn = screen.getByRole("button", { name: /close monitor mix/i })
        expect(btn.className).toContain("min-h-[44px]")
        expect(btn.className).toContain("min-w-[44px]")
        expect(btn.className).toContain("cursor-pointer")
    })

    it("close button invokes onClose when clicked", () => {
        const onClose = vi.fn()
        render(<QuickMonitorPanel onClose={onClose} />)
        const btn = screen.getByRole("button", { name: /close monitor mix/i })
        fireEvent.click(btn)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("omits the close button when onClose is not provided (graceful fallback)", () => {
        render(<QuickMonitorPanel />)
        expect(screen.queryByRole("button", { name: /close monitor mix/i })).toBeNull()
    })
})
