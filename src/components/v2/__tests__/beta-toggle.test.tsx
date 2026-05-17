import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import "@testing-library/jest-dom"

import {
  V2BetaOptInLink,
  V2BetaOptOutLink,
  V2_BETA_OPTIN_COOKIE,
} from "@/components/v2/v2-beta-toggle"

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const hit = document.cookie.split("; ").find((c) => c.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0`
}

describe("V2BetaOptInLink", () => {
  beforeEach(() => {
    clearCookie(V2_BETA_OPTIN_COOKIE)
  })

  it("renders an anchor pointing at /v2 with the expected label", () => {
    render(<V2BetaOptInLink />)
    const link = screen.getByRole("link", { name: /try the new experience/i })
    expect(link).toHaveAttribute("href", "/v2")
  })

  it("sets the v2_beta_optin cookie when clicked", () => {
    render(<V2BetaOptInLink />)
    expect(readCookie(V2_BETA_OPTIN_COOKIE)).toBeNull()
    // We can't intercept the navigation in jsdom (Link prevents default only on
    // client-side route match), but the onClick fires regardless — that's all
    // we need to verify the cookie write.
    fireEvent.click(screen.getByRole("link"))
    expect(readCookie(V2_BETA_OPTIN_COOKIE)).toBe("1")
  })

  it("supports a custom label", () => {
    render(<V2BetaOptInLink label="Switch to v2" />)
    expect(screen.getByRole("link", { name: "Switch to v2" })).toBeInTheDocument()
  })
})

describe("V2BetaOptOutLink", () => {
  beforeEach(() => {
    // Pre-seed the cookie so we can verify the click clears it.
    document.cookie = `${V2_BETA_OPTIN_COOKIE}=1; Path=/`
  })

  it("renders an anchor pointing at /", () => {
    render(<V2BetaOptOutLink />)
    const link = screen.getByRole("link", { name: /back to classic/i })
    expect(link).toHaveAttribute("href", "/")
  })

  it("clears the v2_beta_optin cookie when clicked", () => {
    render(<V2BetaOptOutLink />)
    expect(readCookie(V2_BETA_OPTIN_COOKIE)).toBe("1")
    fireEvent.click(screen.getByRole("link"))
    expect(readCookie(V2_BETA_OPTIN_COOKIE)).toBeNull()
  })
})

describe("V2_BETA_OPTIN_COOKIE", () => {
  it("exposes the canonical cookie name for server-side reads", () => {
    expect(V2_BETA_OPTIN_COOKIE).toBe("v2_beta_optin")
  })
})
