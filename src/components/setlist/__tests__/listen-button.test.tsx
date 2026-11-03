import "@testing-library/jest-dom"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/cache-utils", () => ({ isFileCached: vi.fn(async () => true) }))

import { SetlistCard, UpcomingSetlistCard } from "../SetlistCards"
import type { Setlist } from "@/lib/setlist-firebase"

const SETLIST = {
    id: "s1",
    name: "Test Setlist A",
    eventDate: new Date(2026, 9, 3, 10, 0).toISOString(),
    fileIds: ["f1"],
    trackCount: 3,
} as unknown as Setlist
const noop = () => {}

function upcoming(role: { canEdit: boolean; canDuplicate: boolean; canDelete: boolean }) {
    return (
        <UpcomingSetlistCard
            setlist={SETLIST}
            onPerform={noop}
            onEdit={noop}
            navigatingTo={null}
            onDownload={noop}
            isDownloading={false}
            onDuplicate={noop}
            onCloneNextWeek={noop}
            onSaveAsTemplate={noop}
            onSaveAsDefault={noop}
            onDelete={noop}
            isAdmin={false}
            {...role}
        />
    )
}

describe("Listen button on upcoming setlist rows", () => {
    afterEach(cleanup)

    it("is a labelled link for an editor", () => {
        render(upcoming({ canEdit: true, canDuplicate: true, canDelete: true }))
        const link = screen.getByTestId("setlist-row-listen")
        expect(link).toHaveAttribute("href", "/rehearse/s1")
        expect(link).toHaveTextContent("Rehearse")
    })

    it("is shown to a musician or visitor with no edit rights", () => {
        render(upcoming({ canEdit: false, canDuplicate: false, canDelete: false }))
        expect(screen.getByTestId("setlist-row-listen")).toHaveAttribute("href", "/rehearse/s1")
    })

    it("is not on past rows' primary actions for a visitor", () => {
        render(
            <SetlistCard
                setlist={SETLIST}
                onPerform={noop}
                onEdit={noop}
                navigatingTo={null}
                onDuplicate={noop}
                onCloneNextWeek={noop}
                onSaveAsTemplate={noop}
                onSaveAsDefault={noop}
                onDelete={noop}
                canDelete={false}
                canDuplicate={false}
                canEdit={false}
                isAdmin={false}
            />,
        )
        expect(screen.queryByTestId("setlist-row-listen")).not.toBeInTheDocument()
    })
})
