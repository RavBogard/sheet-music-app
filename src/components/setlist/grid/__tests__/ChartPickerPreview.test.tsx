import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// David's ask 1 (2026-09-22): page-1 previews in the chart pickers. These
// pin the two properties that matter on a 700-row library: only rows that
// are actually on screen fetch, and looking at a preview never binds.

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}

// An IntersectionObserver the test drives: rows are "on screen" only when
// the test says so.
const observed = new Map<Element, (entries: Array<{ isIntersecting: boolean }>) => void>()
class IntersectionObserverStub {
    constructor(private cb: (entries: Array<{ isIntersecting: boolean }>) => void) {}
    observe(el: Element) {
        observed.set(el, this.cb)
    }
    unobserve(el: Element) {
        observed.delete(el)
    }
    disconnect() {
        for (const [el, cb] of observed) if (cb === this.cb) observed.delete(el)
    }
}
;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IntersectionObserverStub

function setOnScreen(fileId: string, on: boolean) {
    for (const [el, cb] of observed) {
        if (el.getAttribute('data-chart-thumb') === fileId) cb([{ isIntersecting: on }])
    }
}

const load = vi.fn()
vi.mock('@/lib/charts/chart-page1', async (orig) => {
    const actual = await orig<typeof import('@/lib/charts/chart-page1')>()
    return { ...actual, chartPage1Loader: () => ({ load, stats: () => ({}) }) }
})

import { getDb, resetDbForTests } from '@/lib/local/schema'

import { ChartBindPopover } from '../ChartBindPopover'
import { ChartCell } from '../cells/ChartCell'

async function seed(n: number) {
    await getDb().songs.bulkPut(
        Array.from({ length: n }, (_, i) => ({
            id: `file-${i}`,
            title: `Song ${String(i).padStart(2, '0')}`,
            normalizedTitle: `song ${i}`,
        })),
    )
}

async function openPicker(onBind = vi.fn()) {
    render(
        <ChartBindPopover onBind={onBind}>
            <ChartCell hasChart={false} />
        </ChartBindPopover>,
    )
    await userEvent.click(screen.getByTestId('chart-cell'))
    await screen.findByText('Song 00')
    return onBind
}

describe('chart picker page-1 previews', () => {
    beforeEach(async () => {
        await resetDbForTests()
        observed.clear()
        load.mockReset()
        load.mockImplementation(() => Promise.resolve({ kind: 'image', url: 'blob:page1' }))
    })
    afterEach(async () => {
        vi.useRealTimers()
        await resetDbForTests()
    })

    it('fetches only the rows that are on screen, and stops when a row leaves', async () => {
        await seed(40)
        await openPicker()
        expect(observed.size).toBe(40) // every row is watched…
        expect(load).not.toHaveBeenCalled() // …none fetched yet

        act(() => {
            for (let i = 0; i < 6; i++) setOnScreen(`file-${i}`, true)
        })
        await waitFor(() => expect(load).toHaveBeenCalledTimes(6))
        const ids = load.mock.calls.map(([req]) => req.fileId).sort()
        expect(ids).toEqual(['file-0', 'file-1', 'file-2', 'file-3', 'file-4', 'file-5'])

        // A row that scrolls away aborts its request.
        const signal: AbortSignal = load.mock.calls.find(([req]) => req.fileId === 'file-0')![0].signal
        act(() => setOnScreen('file-0', false))
        await waitFor(() => expect(signal.aborted).toBe(true))
    })

    it('a row that only flashes past on a fast scroll never fetches', async () => {
        await seed(3)
        await openPicker()
        act(() => setOnScreen('file-1', true))
        act(() => setOnScreen('file-1', false))
        await new Promise((r) => setTimeout(r, 250))
        expect(load).not.toHaveBeenCalled()
    })

    it('tapping a thumbnail opens page 1 without binding, and closing keeps the picker and filter', async () => {
        await seed(3)
        const onBind = await openPicker()
        await userEvent.type(screen.getByLabelText('Bind a chart'), 'Song 01')
        const thumb = document.querySelector('[data-chart-thumb="file-1"]') as HTMLElement
        await userEvent.click(thumb)

        const dialog = await screen.findByTestId('chart-page1-dialog')
        expect(within(dialog).getByText('Song 01')).toBeInTheDocument()
        expect(await within(dialog).findByAltText('Page 1 of Song 01')).toHaveAttribute('src', 'blob:page1')
        expect(load.mock.calls.some(([req]) => req.fileId === 'file-1' && req.priority)).toBe(true)

        // Clicks and Enter inside the preview must not reach the list item.
        await userEvent.click(dialog)
        await userEvent.keyboard('{Enter}')
        expect(onBind).not.toHaveBeenCalled()

        await userEvent.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByTestId('chart-page1-dialog')).not.toBeInTheDocument())
        expect(screen.getByTestId('chart-bind-popover')).toBeInTheDocument()
        expect(screen.getByLabelText('Bind a chart')).toHaveValue('Song 01')
        expect(onBind).not.toHaveBeenCalled()
    })

    it('Ctrl+Enter previews the highlighted row from the keyboard', async () => {
        await seed(3)
        const onBind = await openPicker()
        const input = screen.getByLabelText('Bind a chart')
        await userEvent.type(input, 'Song 02')
        await userEvent.keyboard('{Control>}{Enter}{/Control}')
        expect(await screen.findByTestId('chart-page1-dialog')).toBeInTheDocument()
        expect(onBind).not.toHaveBeenCalled()
    })

    it('says so plainly when a chart has no page to show', async () => {
        load.mockImplementation(() => Promise.resolve({ kind: 'none', reason: 'not-previewable' }))
        await seed(1)
        await openPicker()
        await userEvent.click(document.querySelector('[data-chart-thumb="file-0"]') as HTMLElement)
        expect(await screen.findByTestId('chart-page1-none')).toHaveTextContent('No preview for this kind of chart.')
    })
})
