import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { format } from 'date-fns'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom ships neither ResizeObserver, scrollIntoView, nor the Pointer Capture
// API — Radix Popover + Select (used by the date picker + service-type select)
// touch all three. Stub before any of those render (parity with
// RecordingBindPopover.test, plus the pointer-capture stubs Radix Select needs).
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(
    globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }
).ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined') {
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = function () {}
    }
    if (!Element.prototype.hasPointerCapture) {
        Element.prototype.hasPointerCapture = () => false
    }
    if (!Element.prototype.setPointerCapture) {
        Element.prototype.setPointerCapture = () => {}
    }
    if (!Element.prototype.releasePointerCapture) {
        Element.prototype.releasePointerCapture = () => {}
    }
}

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

import { SetlistMetaEditSheet } from '../SetlistMetaEditSheet'
import { OrgProvider } from '@/lib/org/org-context'
import type { OrgId } from '@/lib/org/types'

// A fixed event date so format() assertions are deterministic.
const EVENT_DATE_MS = new Date('2026-05-16T12:00:00Z').getTime()
const EVENT_DATE_LABEL = format(new Date(EVENT_DATE_MS), 'PPP')

function renderSheet(
    over: {
        initial?: Partial<Parameters<typeof SetlistMetaEditSheet>[0]['initial']>
        applyEdit?: ReturnType<typeof vi.fn>
        onOpenChange?: ReturnType<typeof vi.fn>
        org?: OrgId
    } = {},
) {
    const applyEdit = over.applyEdit ?? vi.fn().mockResolvedValue(undefined)
    const onOpenChange = over.onOpenChange ?? vi.fn()
    render(
        // The sheet calls useOrg() (v11-03-03) — default crc keeps the
        // synagogue fields visible so the existing AC tests are unchanged.
        <OrgProvider orgId={over.org ?? 'crc'}>
            <SetlistMetaEditSheet
                setlistId="setlist-1"
                open
                onOpenChange={onOpenChange}
                initial={{
                    name: 'Shabbat Morning',
                    eventDate: EVENT_DATE_MS,
                    rabbi: 'Rabbi Daniel',
                    templateType: 'shabbat_morning',
                    ...over.initial,
                }}
                applyEdit={applyEdit}
            />
        </OrgProvider>,
    )
    return { applyEdit, onOpenChange }
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('SetlistMetaEditSheet', () => {
    it('AC-1: renders the form pre-filled from `initial`', () => {
        renderSheet()

        expect(screen.getByLabelText('Name')).toHaveValue('Shabbat Morning')
        expect(screen.getByLabelText('Rabbi')).toHaveValue('Rabbi Daniel')
        // Date trigger button shows the formatted initial date as its text
        // (its accessible *name* is the associated "Event date" <Label>).
        expect(screen.getByText(EVENT_DATE_LABEL)).toBeInTheDocument()
        // Service-type select shows the human label for shabbat_morning.
        expect(screen.getByText('Shabbat Morning')).toBeInTheDocument()
    })

    it('AC-2: changing the name and saving enqueues a changed-only patch', async () => {
        const user = userEvent.setup()
        const { applyEdit, onOpenChange } = renderSheet()

        const nameInput = screen.getByLabelText('Name')
        await user.clear(nameInput)
        await user.type(nameInput, 'Erev Shabbat')
        await user.click(screen.getByRole('button', { name: /save/i }))

        expect(applyEdit).toHaveBeenCalledTimes(1)
        expect(applyEdit).toHaveBeenCalledWith({
            op: 'update',
            collection: 'setlists',
            docId: 'setlist-1',
            patch: { name: 'Erev Shabbat' },
        })
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('AC-3: changing the rabbi saves only the rabbi field', async () => {
        const user = userEvent.setup()
        const { applyEdit } = renderSheet()

        const rabbiInput = screen.getByLabelText('Rabbi')
        await user.clear(rabbiInput)
        await user.type(rabbiInput, 'Rabbi Randy')
        await user.click(screen.getByRole('button', { name: /save/i }))

        expect(applyEdit).toHaveBeenCalledTimes(1)
        expect(applyEdit).toHaveBeenCalledWith({
            op: 'update',
            collection: 'setlists',
            docId: 'setlist-1',
            patch: { rabbi: 'Rabbi Randy' },
        })
    })

    it('AC-3: changing the service type saves only templateType', async () => {
        const user = userEvent.setup()
        const { applyEdit } = renderSheet()

        // Open the Radix Select and pick "Friday Night".
        await user.click(screen.getByRole('combobox'))
        await user.click(screen.getByRole('option', { name: 'Friday Night' }))
        await user.click(screen.getByRole('button', { name: /save/i }))

        expect(applyEdit).toHaveBeenCalledTimes(1)
        expect(applyEdit).toHaveBeenCalledWith({
            op: 'update',
            collection: 'setlists',
            docId: 'setlist-1',
            patch: { templateType: 'friday_night' },
        })
    })

    it('AC-4: saving with no changes does not write and closes the sheet', async () => {
        const user = userEvent.setup()
        const { applyEdit, onOpenChange } = renderSheet()

        await user.click(screen.getByRole('button', { name: /save/i }))

        expect(applyEdit).not.toHaveBeenCalled()
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('AC-4: Cancel does not write and closes the sheet', async () => {
        const user = userEvent.setup()
        const { applyEdit, onOpenChange } = renderSheet()

        await user.click(screen.getByRole('button', { name: /cancel/i }))

        expect(applyEdit).not.toHaveBeenCalled()
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    // v11-03-03: org-aware vocab + synagogue-field trim.
    it('CRC shows the Service-type + Rabbi fields and synagogue vocab', () => {
        renderSheet({ org: 'crc' })
        expect(screen.getByText('Edit setlist details')).toBeInTheDocument()
        expect(screen.getByText('Service type')).toBeInTheDocument()
        expect(screen.getByLabelText('Rabbi')).toBeInTheDocument()
    })

    it('Brothers Lazaroff hides the Service-type + Rabbi fields and uses band vocab', () => {
        renderSheet({ org: 'brotherslazaroff' })
        expect(screen.getByText('Edit set details')).toBeInTheDocument()
        expect(screen.queryByText('Edit setlist details')).not.toBeInTheDocument()
        expect(screen.queryByText('Service type')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Rabbi')).not.toBeInTheDocument()
        // Name field stays.
        expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
})
