import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import "@testing-library/jest-dom"

import { GlassSurface } from "@/components/v2/glass-surface"
import { GlassCard } from "@/components/v2/glass-card"
import { DenseList, DenseRow } from "@/components/v2/dense-list"

describe("v2 primitives — GlassSurface", () => {
  it("renders children and applies glass-v2 utility", () => {
    render(<GlassSurface data-testid="surface">hello</GlassSurface>)
    const el = screen.getByTestId("surface")
    expect(el).toHaveTextContent("hello")
    expect(el.className).toMatch(/glass-v2/)
  })

  it("renders as the requested element via `as` prop", () => {
    render(<GlassSurface as="section" data-testid="section">body</GlassSurface>)
    expect(screen.getByTestId("section").tagName).toBe("SECTION")
  })

  it("merges caller className with the base utility", () => {
    render(<GlassSurface data-testid="surface" className="p-8">x</GlassSurface>)
    const el = screen.getByTestId("surface")
    expect(el.className).toMatch(/glass-v2/)
    expect(el.className).toMatch(/\bp-8\b/)
  })
})

describe("v2 primitives — GlassCard", () => {
  it("applies default padding plus the glass-v2 utility", () => {
    render(<GlassCard data-testid="card">x</GlassCard>)
    const el = screen.getByTestId("card")
    expect(el.className).toMatch(/glass-v2/)
    expect(el.className).toMatch(/\bp-5\b/)
  })

  it("allows caller to override padding via className (tailwind-merge wins)", () => {
    render(<GlassCard data-testid="card" className="p-0">x</GlassCard>)
    const el = screen.getByTestId("card")
    expect(el.className).toMatch(/\bp-0\b/)
    expect(el.className).not.toMatch(/\bp-5\b/)
  })
})

describe("v2 primitives — DenseList + DenseRow", () => {
  it("renders DenseList as a <ul role=list> with children rows", () => {
    render(
      <DenseList data-testid="list" aria-label="demo">
        <DenseRow>row a</DenseRow>
        <DenseRow>row b</DenseRow>
      </DenseList>
    )
    const list = screen.getByTestId("list")
    expect(list.tagName).toBe("UL")
    expect(list).toHaveAttribute("role", "list")
    expect(list).toHaveAttribute("aria-label", "demo")
    expect(list.children).toHaveLength(2)
  })

  it("applies the dense-row utility and is a non-interactive <li> by default", () => {
    render(<DenseList><DenseRow data-testid="row">just text</DenseRow></DenseList>)
    const row = screen.getByTestId("row")
    expect(row.tagName).toBe("LI")
    expect(row.className).toMatch(/dense-row/)
    expect(row).not.toHaveAttribute("role")
    expect(row).not.toHaveAttribute("tabindex")
  })

  it("becomes role=button + tabindex=0 when onClick is provided", () => {
    const onClick = vi.fn()
    render(
      <DenseList>
        <DenseRow onClick={onClick} data-testid="row">click me</DenseRow>
      </DenseList>
    )
    const row = screen.getByTestId("row")
    expect(row).toHaveAttribute("role", "button")
    expect(row).toHaveAttribute("tabindex", "0")
    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("activates on Enter/Space when interactive", () => {
    const onClick = vi.fn()
    render(<DenseList><DenseRow onClick={onClick} data-testid="row">x</DenseRow></DenseList>)
    const row = screen.getByTestId("row")
    fireEvent.keyDown(row, { key: "Enter" })
    fireEvent.keyDown(row, { key: " " })
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it("does NOT activate on Enter/Space when not interactive", () => {
    const onKeyDown = vi.fn()
    render(
      <DenseList>
        <DenseRow onKeyDown={onKeyDown} data-testid="row">x</DenseRow>
      </DenseList>
    )
    fireEvent.keyDown(screen.getByTestId("row"), { key: "Enter" })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it("renders aria-current=true on active rows", () => {
    render(
      <DenseList>
        <DenseRow active data-testid="row">now playing</DenseRow>
      </DenseList>
    )
    expect(screen.getByTestId("row")).toHaveAttribute("aria-current", "true")
  })
})
