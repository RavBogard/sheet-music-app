import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/lib/live-director', () => ({
    changeTrackKey: vi.fn(async () => undefined),
    swapTrackChart: vi.fn(async () => undefined),
    insertTrack: vi.fn(async () => 'new-id'),
}))
vi.mock('@/lib/library-store', () => {
    const allFiles = [
        { id: 'lib-a', name: 'Hashkivenu.pdf', displayName: 'Hashkivenu', mimeType: 'application/pdf' },
        { id: 'lib-b', name: 'Hashkivenu (Klepper).pdf', displayName: 'Hashkivenu (Klepper)', mimeType: 'application/pdf' },
        { id: 'lib-c', name: 'Adon Olam.pdf', displayName: 'Adon Olam', mimeType: 'application/pdf' },
    ]
    return {
        useLibraryStore: (selector: (s: { allFiles: typeof allFiles }) => unknown) =>
            selector({ allFiles }),
    }
})

import {
    ChangeKeyAction,
    SwapChartAction,
    InsertSongAction,
    deriveStem,
    filterLibrary,
} from '@/components/performance/LiveDirectorActions'
import { changeTrackKey, swapTrackChart, insertTrack } from '@/lib/live-director'
import type { SetlistTrack } from '@/types/models'

const mockedChangeKey = vi.mocked(changeTrackKey)
const mockedSwap = vi.mocked(swapTrackChart)
const mockedInsert = vi.mocked(insertTrack)

beforeEach(() => {
    mockedChangeKey.mockReset(); mockedChangeKey.mockResolvedValue(undefined)
    mockedSwap.mockReset(); mockedSwap.mockResolvedValue(undefined)
    mockedInsert.mockReset(); mockedInsert.mockResolvedValue('new-id')
})

function track(): SetlistTrack {
    return {
        id: 'track-A',
        title: 'Hashkivenu',
        type: 'song',
        fileId: 'lib-a',
        key: 'C',
    } as SetlistTrack
}

describe('deriveStem', () => {
    it('strips composer-parenthetical clarifiers', () => {
        expect(deriveStem('Hashkivenu (Klepper-Freelander)')).toBe('Hashkivenu')
    })
    it('returns the title unchanged when no parenthetical', () => {
        expect(deriveStem('Adon Olam')).toBe('Adon Olam')
    })
    it('handles missing or empty title', () => {
        expect(deriveStem(undefined)).toBe('')
        expect(deriveStem('  ')).toBe('')
    })
})

describe('filterLibrary', () => {
    const files = [
        { id: 'a', name: 'Hashkivenu.pdf', displayName: 'Hashkivenu', mimeType: 'application/pdf' },
        { id: 'b', name: 'Hashkivenu (Klepper).pdf', displayName: 'Hashkivenu (Klepper)', mimeType: 'application/pdf' },
        { id: 'c', name: 'Adon Olam.pdf', displayName: 'Adon Olam', mimeType: 'application/pdf' },
    ]
    it('returns the whole pool (capped) on empty query', () => {
        expect(filterLibrary(files, '', null).map((f) => f.id)).toEqual(['a', 'b', 'c'])
    })
    it('substring-matches case-insensitively on displayName', () => {
        expect(filterLibrary(files, 'klepper', null).map((f) => f.id)).toEqual(['b'])
    })
    it('excludes the currently-bonded chart id when provided', () => {
        const out = filterLibrary(files, 'Hashkivenu', 'a')
        expect(out.map((f) => f.id)).toEqual(['b'])
    })
})

describe('<ChangeKeyAction>', () => {
    it('renders the current key and calls changeTrackKey on pick', () => {
        const onDone = vi.fn()
        render(<ChangeKeyAction track={track()} onDone={onDone} />)
        // "Current key: C" label — scope the lookup via the label prefix to
        // disambiguate from the KeyPicker trigger that also renders "C".
        expect(screen.getByText(/Current key:/i).textContent).toMatch(/C/)
        // KeyPicker uses a popover trigger labeled with the current value.
        const trigger = screen.getByRole('button', { name: /^C$/ })
        fireEvent.click(trigger)
        // Pick D from the rendered grid.
        const pick = screen.getByRole('button', { name: /^D$/ })
        fireEvent.click(pick)
        expect(mockedChangeKey).toHaveBeenCalledWith('track-A', 'D')
    })
})

describe('<SwapChartAction>', () => {
    it('renders other arrangements of the same stem by default + commits on pick', async () => {
        const onDone = vi.fn()
        render(<SwapChartAction track={track()} onDone={onDone} />)
        // Search input pre-populated with the stem.
        const input = screen.getByRole('textbox') as HTMLInputElement
        expect(input.value).toBe('Hashkivenu')
        // Currently-bonded chart (lib-a) MUST be excluded from results.
        expect(screen.queryByRole('button', { name: /Swap to Hashkivenu$/ })).not.toBeInTheDocument()
        const klepper = screen.getByRole('button', { name: /Swap to Hashkivenu \(Klepper\)/ })
        fireEvent.click(klepper)
        expect(mockedSwap).toHaveBeenCalledWith('track-A', expect.objectContaining({ id: 'lib-b' }))
    })
})

describe('<InsertSongAction>', () => {
    it('inserts AFTER the long-pressed row by default', async () => {
        const tracks = [
            { id: 't0', title: 'a' } as SetlistTrack,
            { id: 't1', title: 'b' } as SetlistTrack,
        ]
        const onDone = vi.fn()
        render(
            <InsertSongAction
                setlistId="sl-1"
                setlistTracks={tracks}
                currentIndex={0}
                onDone={onDone}
            />,
        )
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'Adon' } })
        const adon = screen.getByRole('button', { name: /Insert Adon Olam/ })
        fireEvent.click(adon)
        expect(mockedInsert).toHaveBeenCalledWith({
            setlistId: 'sl-1',
            song: expect.objectContaining({ id: 'lib-c' }),
            placement: 'after',
            currentIndex: 0,
            currentTracks: tracks,
        })
    })

    it('placement chooser updates the insert call', async () => {
        const tracks = [
            { id: 't0', title: 'a' } as SetlistTrack,
            { id: 't1', title: 'b' } as SetlistTrack,
        ]
        render(
            <InsertSongAction
                setlistId="sl-1"
                setlistTracks={tracks}
                currentIndex={1}
                onDone={vi.fn()}
            />,
        )
        const group = screen.getByRole('radiogroup', { name: /where to insert/i })
        fireEvent.click(within(group).getByRole('radio', { name: /at end/i }))
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'Adon' } })
        fireEvent.click(screen.getByRole('button', { name: /Insert Adon Olam/ }))
        expect(mockedInsert).toHaveBeenCalledWith(
            expect.objectContaining({ placement: 'append' }),
        )
    })

    it('shows an empty-state hint when the query yields no matches', () => {
        render(
            <InsertSongAction
                setlistId="sl-1"
                setlistTracks={[]}
                currentIndex={0}
                onDone={vi.fn()}
            />,
        )
        const input = screen.getByRole('textbox')
        fireEvent.change(input, { target: { value: 'zzz-nothing-here' } })
        expect(screen.getByText(/no charts match/i)).toBeInTheDocument()
    })
})
