import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { OrgLogo } from "@/components/nav/OrgLogo"

describe("OrgLogo", () => {
    it("renders an <img> with the CRC canonical alt when logoUrl is /logo.jpg (byte-identical)", () => {
        const { container } = render(
            <OrgLogo logoUrl="/logo.jpg" shortName="CRC Music" sizeClass="w-8 h-8" />,
        )
        const img = container.querySelector("img")
        expect(img).not.toBeNull()
        expect(img!.getAttribute("src")).toBe("/logo.jpg")
        expect(img!.getAttribute("alt")).toBe("Central Reform Congregation logo")
        expect(img!.className).toContain("rounded-full")
        // No monogram in the image branch.
        expect(screen.queryByRole("img", { name: /CRC Music logo/ })).toBeNull()
    })

    it("renders an <img> with a shortName-derived alt for a non-CRC logoUrl", () => {
        const { container } = render(
            <OrgLogo logoUrl="/logo-band.png" shortName="Some Band" sizeClass="w-8 h-8" />,
        )
        const img = container.querySelector("img")
        expect(img!.getAttribute("src")).toBe("/logo-band.png")
        expect(img!.getAttribute("alt")).toBe("Some Band logo")
    })

    it("renders a brand monogram (no <img>) when logoUrl is empty", () => {
        const { container } = render(
            <OrgLogo logoUrl="" shortName="Brothers Lazaroff" sizeClass="w-7 h-7" />,
        )
        expect(container.querySelector("img")).toBeNull()
        const badge = screen.getByRole("img", { name: "Brothers Lazaroff logo" })
        expect(badge.textContent).toBe("BL")
        expect(badge.className).toContain("bg-brand")
        expect(badge.className).toContain("text-brand-foreground")
        expect(badge.className).toContain("rounded-full")
    })

    it("derives initials: first letter of up to two words, single word → first two chars", () => {
        const { rerender } = render(<OrgLogo logoUrl="" shortName="Shir Chadash" sizeClass="w-7 h-7" />)
        expect(screen.getByRole("img").textContent).toBe("SC")
        rerender(<OrgLogo logoUrl="" shortName="Shireinu" sizeClass="w-7 h-7" />)
        expect(screen.getByRole("img").textContent).toBe("SH")
    })
})
