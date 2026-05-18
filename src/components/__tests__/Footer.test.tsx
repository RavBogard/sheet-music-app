import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/build-info.json", () => ({
    default: { version: "test", commit: "deadbeef" },
}))

vi.mock("@/components/v2/v2-beta-toggle", () => ({
    V2BetaOptInLink: () => null,
    V2BetaOptOutLink: () => null,
}))

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}))

describe("Footer legal links (C5D-002)", () => {
    it("v1 Footer renders Changelog, Privacy, Terms, Accessibility", async () => {
        const { Footer } = await import("@/components/Footer")
        render(<Footer />)
        for (const [name, href] of [
            ["Changelog", "/changelog"],
            ["Privacy", "/privacy"],
            ["Terms", "/terms"],
            ["Accessibility", "/accessibility"],
        ]) {
            const link = screen.getByRole("link", { name })
            expect(link.getAttribute("href")).toBe(href)
        }
    })

    it("V2Footer renders Changelog, Privacy, Terms, Accessibility", async () => {
        const { V2Footer } = await import("@/components/v2/v2-footer")
        render(<V2Footer />)
        for (const [name, href] of [
            ["Changelog", "/changelog"],
            ["Privacy", "/privacy"],
            ["Terms", "/terms"],
            ["Accessibility", "/accessibility"],
        ]) {
            const link = screen.getByRole("link", { name })
            expect(link.getAttribute("href")).toBe(href)
        }
    })
})
