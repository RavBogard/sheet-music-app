import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { OrgProvider, useOrg } from "@/lib/org/org-context"

// NOTE: the resolveOrgIdByDomain host matrix (brotherslazaroff.live / www /
// port / centralreform.live / localhost / vercel / null) is already fully
// covered in registry.test.ts — not duplicated here. This file covers the
// v11-03-01 client provider/hook seam.

function Probe() {
    return <span data-testid="org">{useOrg()}</span>
}

describe("OrgProvider / useOrg", () => {
    it("provides the org id to descendant client components", () => {
        render(
            <OrgProvider orgId="brotherslazaroff">
                <Probe />
            </OrgProvider>,
        )
        expect(screen.getByTestId("org").textContent).toBe("brotherslazaroff")
    })

    it("provides crc when that is the resolved org", () => {
        render(
            <OrgProvider orgId="crc">
                <Probe />
            </OrgProvider>,
        )
        expect(screen.getByTestId("org").textContent).toBe("crc")
    })

    it("defaults to crc when useOrg is called outside <OrgProvider>", () => {
        // Benign fallback (not a throw): the real app always wraps in
        // <OrgProvider>; org only drives chrome/vocab, so an unwrapped mount
        // degrades to the default tenant rather than crashing.
        render(<Probe />)
        expect(screen.getByTestId("org").textContent).toBe("crc")
    })
})
