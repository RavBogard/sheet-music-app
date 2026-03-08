// @vitest-environment jsdom
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

// Mock KeyPicker to a simple input
vi.mock("@/components/ui/key-picker", () => ({
    KeyPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <input data-testid="key-picker" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}))

import { SongRow } from "../v2/SongRow"

const mockTrack: SetlistTrack = {
    id: "song-1",
    title: "Shalom Rav",
    key: "Am",
    bpm: 120,
    leadMusician: "Sarah",
    type: "song",
    fileId: "file-123",
    fileName: "shalom-rav.pdf",
    notes: "Slow intro",
}

describe("SongRow", () => {
    const onTap = vi.fn()
    const onUpdate = vi.fn()
    const onReplace = vi.fn()
    const onDelete = vi.fn()
    const onPlayFile = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders collapsed row with title, key badge, and lead", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={false}
                onTap={onTap}
                onPlayFile={onPlayFile}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        expect(screen.getByText("Shalom Rav")).toBeTruthy()
        expect(screen.getByText("Am")).toBeTruthy()
        expect(screen.getByText("Sarah")).toBeTruthy()
    })

    it("does NOT render inline fields when collapsed", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={false}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        expect(screen.queryByText("Replace")).toBeNull()
        expect(screen.queryByText("Delete")).toBeNull()
        expect(screen.queryByPlaceholderText("BPM")).toBeNull()
    })

    it("renders expanded inline fields when isExpanded is true", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        // Inline fields should be visible
        expect(screen.getByPlaceholderText("BPM")).toBeTruthy()
        expect(screen.getByPlaceholderText("Lead musician")).toBeTruthy()
        expect(screen.getByPlaceholderText("Performance notes...")).toBeTruthy()
        expect(screen.getByText("Replace")).toBeTruthy()
        expect(screen.getByText("Delete")).toBeTruthy()
    })

    it("calls onUpdate with correct field data when tempo is changed", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        const tempoInput = screen.getByPlaceholderText("BPM")
        fireEvent.change(tempoInput, { target: { value: "140" } })
        expect(onUpdate).toHaveBeenCalledWith("song-1", { bpm: 140 })
    })

    it("calls onUpdate when lead musician is changed", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        const leadInput = screen.getByPlaceholderText("Lead musician")
        fireEvent.change(leadInput, { target: { value: "David" } })
        expect(onUpdate).toHaveBeenCalledWith("song-1", { leadMusician: "David" })
    })

    it("calls onUpdate when notes are changed", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        const notesInput = screen.getByPlaceholderText("Performance notes...")
        fireEvent.change(notesInput, { target: { value: "Fast tempo" } })
        expect(onUpdate).toHaveBeenCalledWith("song-1", { notes: "Fast tempo" })
    })

    it("calls onReplace when Replace button is clicked", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        fireEvent.click(screen.getByText("Replace"))
        expect(onReplace).toHaveBeenCalledWith(mockTrack)
    })

    it("calls onDelete when Delete button is clicked", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={true}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        fireEvent.click(screen.getByText("Delete"))
        expect(onDelete).toHaveBeenCalledWith("song-1")
    })

    it("does not render inline fields when canEdit is false even if isExpanded", () => {
        render(
            <SongRow
                track={mockTrack}
                canEdit={false}
                isExpanded={true}
                onTap={onTap}
                onUpdate={onUpdate}
                onReplace={onReplace}
                onDelete={onDelete}
            />
        )

        expect(screen.queryByPlaceholderText("BPM")).toBeNull()
        expect(screen.queryByText("Replace")).toBeNull()
    })
})
