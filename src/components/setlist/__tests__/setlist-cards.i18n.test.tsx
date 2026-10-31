import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

/** Phase 7 i18n: setlist cards (upcoming, past, placeholder) come through t() / fmt. */

vi.mock("@/lib/cache-utils", () => ({ isFileCached: vi.fn(async () => true) }))

import { renderPseudo, expectNoUntranslatedText } from "@/test-utils/i18n"
import { UpcomingSetlistCard, SetlistCard, PlaceholderCard } from "../SetlistCards"
import type { Setlist } from "@/lib/setlist-firebase"

const SETLIST = {
    id: "s1",
    name: "Test Setlist A",
    eventDate: new Date(2026, 9, 3, 10, 0).toISOString(),
    fileIds: ["f1"],
    trackCount: 3,
    templateType: "shabbat_morning",
} as unknown as Setlist

const DATA = [SETLIST.name]
const noop = () => {}

function upcoming() {
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
            canDelete
            canDuplicate
            canEdit
            isAdmin
        />
    )
}

function past() {
    return (
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
            canDelete
            canDuplicate
            canEdit
            isAdmin
        />
    )
}

async function openMenu() {
    const trigger = document.querySelector('[aria-haspopup="menu"]') as HTMLElement
    await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
        fireEvent.keyDown(trigger, { key: "Enter" })
    })
    await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
}

describe.each([false, true])("setlist cards i18n (rtl=%s)", (rtl) => {
    afterEach(() => cleanup())

    it("UpcomingSetlistCard: card text, offline badge, and the open menu", async () => {
        const r = renderPseudo(upcoming(), { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        await waitFor(() => expect(document.querySelector(".text-green-400")).not.toBeNull()) // offline-ready badge
        expectNoUntranslatedText(document.body, { allow: DATA })
        await openMenu()
        expect(screen.getByTestId("setlist-card-save-as-default")).toBeDefined()
        expectNoUntranslatedText(document.body, { allow: DATA })
    })

    it("SetlistCard (past): card text and the open menu", async () => {
        const r = renderPseudo(past(), { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body, { allow: DATA })
        await openMenu()
        expect(screen.getByTestId("setlist-card-save-as-default")).toBeDefined()
        expectNoUntranslatedText(document.body, { allow: DATA })
    })

    it("PlaceholderCard: tenant vocabulary and date", () => {
        const r = renderPseudo(<PlaceholderCard date={new Date(2026, 9, 9)} onCreate={noop} />, { rtl })
        if (rtl) expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(document.body)
    })

    it("missing date falls back to the translated 'No Date'", () => {
        renderPseudo(<SetlistCard {...past().props} setlist={{ ...SETLIST, eventDate: undefined } as unknown as Setlist} />, { rtl })
        expectNoUntranslatedText(document.body, { allow: DATA })
    })
})

describe("setlist cards English output is unchanged", () => {
    afterEach(() => cleanup())

    it("renders today's English", async () => {
        render(upcoming())
        expect(screen.getByText("3 songs")).toBeDefined()
        expect(screen.getByText("Oct 3, 2026")).toBeDefined()
        expect(screen.getByLabelText("Open setlist — Test Setlist A")).toBeDefined()
        expect(screen.getByLabelText("Download setlist for offline — Test Setlist A").getAttribute("title")).toBe("Download for Offline")
        await waitFor(() => expect(screen.getByText("Offline ready")).toBeDefined())
        await openMenu()
        expect(screen.getByText("Save as Default for Shabbat Morning")).toBeDefined()
        expect(screen.getByText("Clone for Next Week")).toBeDefined()
        cleanup()

        render(<SetlistCard {...past().props} setlist={{ ...SETLIST, eventDate: undefined } as unknown as Setlist} />)
        expect(screen.getByText("No Date")).toBeDefined()
        cleanup()

        render(<PlaceholderCard date={new Date(2026, 9, 9)} onCreate={noop} />)
        expect(screen.getByText("Plan Service")).toBeDefined()
        expect(screen.getByText("Friday, Oct 9")).toBeDefined()
    })
})
