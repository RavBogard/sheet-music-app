/**
 * Tests for OnboardingCard — stacking-bug guard + variant selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

import { OnboardingCard } from "../OnboardingCard"

vi.mock("@/lib/firebase", () => ({
    db: {},
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
        const u = setup({})
        return typeof u === 'function' ? u : () => {}
    }),
}))
vi.mock("firebase/firestore", () => ({
    doc: vi.fn(),
    updateDoc: vi.fn(),
}))
vi.mock("@/lib/users-firebase", () => ({
    markWelcomeModalViewed: vi.fn(),
}))
vi.mock("@/components/people/NudgeAdminButton", () => ({
    NudgeAdminButton: () => <button data-testid="nudge-admin">Nudge Admin</button>,
}))
vi.mock("@/components/ui/illustrations", () => ({
    PendingAccountIllustration: () => <svg data-testid="pending-illus" />,
}))

describe("OnboardingCard", () => {
    beforeEach(() => cleanup())
    afterEach(() => cleanup())

    const baseProps = {
        congregationShortName: "CRC",
        userId: "user-1",
    }

    it("renders the PENDING variant when role='pending'", () => {
        render(
            <OnboardingCard
                {...baseProps}
                role="pending"
                isMember={false}
                profile={{ musicianProfile: {}, viewedWelcomeModal: false }}
            />
        )
        expect(screen.getByText(/Welcome to CRC/)).toBeDefined()
        expect(screen.getByTestId("nudge-admin")).toBeDefined()
        expect(screen.queryByText(/You.re approved/)).toBeNull()
    })

    it("renders the APPROVED variant when isMember and no instrument/viewedWelcome", () => {
        render(
            <OnboardingCard
                {...baseProps}
                role="musician"
                isMember={true}
                profile={{ musicianProfile: {}, viewedWelcomeModal: false }}
            />
        )
        expect(screen.getByText(/You.re approved/)).toBeDefined()
        expect(screen.queryByText(/Welcome to CRC/)).toBeNull()
        expect(screen.queryByTestId("nudge-admin")).toBeNull()
    })

    it("stacking guard: role='pending' AND isMember=true renders ONLY the PENDING variant", () => {
        // Simulates the race where a role transition leaves both predicates
        // momentarily true. Previously rendered both cards.
        render(
            <OnboardingCard
                {...baseProps}
                role="pending"
                isMember={true}
                profile={{ musicianProfile: {}, viewedWelcomeModal: false }}
            />
        )
        expect(screen.getByText(/Welcome to CRC/)).toBeDefined()
        expect(screen.queryByText(/You.re approved/)).toBeNull()
        // Assert exactly one card div by counting the outer role headline.
        expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1)
    })

    it("returns null when the user has an instrument set", () => {
        const { container } = render(
            <OnboardingCard
                {...baseProps}
                role="musician"
                isMember={true}
                profile={{ musicianProfile: { instrument: "Guitar" }, viewedWelcomeModal: false }}
            />
        )
        expect(container.firstChild).toBeNull()
    })

    it("returns null when the user has dismissed the welcome modal", () => {
        const { container } = render(
            <OnboardingCard
                {...baseProps}
                role="musician"
                isMember={true}
                profile={{ musicianProfile: {}, viewedWelcomeModal: true }}
            />
        )
        expect(container.firstChild).toBeNull()
    })

    it("returns null when userId is missing", () => {
        const { container } = render(
            <OnboardingCard
                {...baseProps}
                userId={null}
                role="pending"
                isMember={false}
                profile={{ musicianProfile: {}, viewedWelcomeModal: false }}
            />
        )
        expect(container.firstChild).toBeNull()
    })
})
