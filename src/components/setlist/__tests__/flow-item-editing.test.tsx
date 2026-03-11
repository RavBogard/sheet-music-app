import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SetlistTrack } from "@/types/models"

// Mock dnd-kit sortable
vi.mock("@dnd-kit/sortable", () => ({
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false,
    }),
}))

vi.mock("@dnd-kit/utilities", () => ({
    CSS: { Transform: { toString: () => null } },
}))

import { FlowRow } from "../v2/FlowRow"

const mockReading: SetlistTrack = {
    id: "reading-1",
    title: "Torah Reading",
    type: "reading",
    description: "Genesis 1:1-5",
    performer: "Rabbi",
    estimatedMinutes: 5,
}

const mockPrayer: SetlistTrack = {
    id: "prayer-1",
    title: "Opening Prayer",
    type: "prayer",
    performer: "Congregation",
    estimatedMinutes: 3,
}

const mockTransition: SetlistTrack = {
    id: "transition-1",
    title: "Ark Opening",
    type: "transition",
    estimatedMinutes: 1,
}

describe("FlowRow", () => {
    const onTap = vi.fn()
    const onUpdate = vi.fn()
    const onDelete = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders reading type correctly in collapsed state", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={true}
                isExpanded={false}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        expect(screen.getByText("Torah Reading")).toBeTruthy()
        expect(screen.getByText("Rabbi")).toBeTruthy()
    })

    it("renders prayer type correctly in collapsed state", () => {
        render(
            <FlowRow
                track={mockPrayer}
                canEdit={true}
                isExpanded={false}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        expect(screen.getByText("Opening Prayer")).toBeTruthy()
        expect(screen.getByText("Congregation")).toBeTruthy()
    })

    it("renders transition type correctly in collapsed state", () => {
        render(
            <FlowRow
                track={mockTransition}
                canEdit={true}
                isExpanded={false}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        expect(screen.getByText("Ark Opening")).toBeTruthy()
    })

    it("does NOT render inline fields when collapsed", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={true}
                isExpanded={false}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        expect(screen.queryByPlaceholderText("Item title")).toBeNull()
        expect(screen.queryByPlaceholderText("Description or text...")).toBeNull()
    })

    it("renders expanded inline fields when isExpanded is true", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        expect(screen.getByPlaceholderText("Item title")).toBeTruthy()
        expect(screen.getByPlaceholderText("Description or text...")).toBeTruthy()
        expect(screen.getByPlaceholderText("Who leads this")).toBeTruthy()
        expect(screen.getByText("Delete")).toBeTruthy()
    })

    it("calls onUpdate with title when title is changed", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        const titleInput = screen.getByPlaceholderText("Item title")
        fireEvent.change(titleInput, { target: { value: "Haftarah Reading" } })
        expect(onUpdate).toHaveBeenCalledWith("reading-1", { title: "Haftarah Reading" })
    })

    it("calls onUpdate with description when description is changed", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        const descInput = screen.getByPlaceholderText("Description or text...")
        fireEvent.change(descInput, { target: { value: "Isaiah 40:1-11" } })
        expect(onUpdate).toHaveBeenCalledWith("reading-1", { description: "Isaiah 40:1-11" })
    })

    it("calls onUpdate with performer when performer is changed", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        const performerInput = screen.getByPlaceholderText("Who leads this")
        fireEvent.change(performerInput, { target: { value: "Cantor" } })
        expect(onUpdate).toHaveBeenCalledWith("reading-1", { performer: "Cantor" })
    })

    it("calls onDelete when Delete button is clicked", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        fireEvent.click(screen.getByText("Delete"))
        expect(onDelete).toHaveBeenCalledWith("reading-1")
    })

    it("does not render inline fields when canEdit is false even if isExpanded", () => {
        render(
            <FlowRow
                track={mockReading}
                canEdit={false}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onDelete={onDelete}
            />
        )

        expect(screen.queryByPlaceholderText("Item title")).toBeNull()
        expect(screen.queryByText("Delete")).toBeNull()
    })
})
