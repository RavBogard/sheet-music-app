import '@testing-library/jest-dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RehearseClient } from '../RehearseClient'
import { buildRehearseRows, songNeighbors } from '../rows'

afterEach(cleanup)

const tracks = [
    { id: 't1', title: 'Opening', type: 'header' },
    { id: 't2', title: 'Hashkivenu', type: 'song', songId: 's-a', key: 'Dm', bpm: 92, notes: 'Slow start\nthen build', fileId: 'f2', liturgyRef: { folio: 12 } },
    { id: 't3', title: 'Torah reading', type: 'reading' },
    { id: 't4', title: 'Adon Olam', songId: 's-b' },
    { id: 't5', title: 'Closing', type: 'section' },
    { id: 't6', title: 'Mi Shebeirach', type: 'song', bpm: 0, key: '  ', fileId: '' },
]
const featured = { 's-a': { id: 'rec-a', title: 'Shir Shabbat, Nov 14, 2025' } }

describe('buildRehearseRows', () => {
    it('carries key, BPM, notes, chart presence and take; blanks become null', () => {
        const rows = buildRehearseRows(tracks, featured)
        expect(rows.find((r) => r.id === 't2')).toMatchObject({
            key: 'Dm',
            bpm: 92,
            notes: 'Slow start\nthen build',
            fileId: 'f2',
            take: { id: 'rec-a' },
        })
        expect(rows.find((r) => r.id === 't6')).toMatchObject({ key: null, bpm: null, notes: null, fileId: null, take: null })
    })

    it('keeps author order and section headings, drops non-song rows', () => {
        expect(buildRehearseRows(tracks, featured).map((r) => r.id)).toEqual(['t1', 't2', 't4', 't5', 't6'])
    })

    it('previous/next step over section headings and non-song rows', () => {
        const rows = buildRehearseRows(tracks, featured)
        expect(songNeighbors(rows, 't2')).toMatchObject({ prev: null, next: { id: 't4' } })
        expect(songNeighbors(rows, 't4')).toMatchObject({ prev: { id: 't2' }, next: { id: 't6' } })
        expect(songNeighbors(rows, 't6').next).toBeNull()
        expect(songNeighbors(rows, 't4')).toMatchObject({ position: 2, total: 3 })
        expect(songNeighbors(rows, 't1').song).toBeNull()
        expect(songNeighbors(rows, 't3').song).toBeNull()
    })
})

describe('Rehearse page', () => {
    it('rows in author order; key, BPM, notes, chart button only where present', () => {
        const rows = buildRehearseRows(tracks, featured)
        render(<RehearseClient setlistId="sl1" name="Shabbat morning" eventDate="2025-11-15T12:00:00.000Z" rows={rows} />)

        expect(screen.getByRole('heading', { level: 1, name: 'Shabbat morning' })).toBeInTheDocument()
        expect(screen.queryByText('Torah reading')).not.toBeInTheDocument()

        const songs = screen.getAllByTestId('rehearse-song')
        expect(songs).toHaveLength(3)
        expect(within(songs[0]).getByTestId('rehearse-key-tag')).toHaveTextContent('Dm')
        expect(within(songs[0]).getByTestId('rehearse-bpm')).toHaveTextContent('92 BPM')
        expect(within(songs[0]).getByTestId('rehearse-folio')).toHaveTextContent('12')
        expect(within(songs[0]).getByTestId('rehearse-take')).toHaveTextContent('Shir Shabbat, Nov 14, 2025')
        expect(within(songs[0]).getByTestId('rehearse-notes')).toHaveTextContent('Slow start')
        expect(within(songs[0]).getByTestId('recording-player')).toBeInTheDocument()
        expect(within(songs[0]).getByTestId('rehearse-chart-link')).toHaveAttribute('href', '/rehearse/sl1/track/t2')

        expect(within(songs[1]).getByText('No recording yet')).toBeInTheDocument()
        expect(within(songs[1]).queryByTestId('rehearse-chart-link')).not.toBeInTheDocument()
        expect(within(songs[1]).queryByTestId('rehearse-key-tag')).not.toBeInTheDocument()
        expect(within(songs[1]).queryByTestId('rehearse-bpm')).not.toBeInTheDocument()
        expect(within(songs[1]).queryByTestId('rehearse-folio')).not.toBeInTheDocument()
        expect(within(songs[2]).queryByTestId('rehearse-chart-link')).not.toBeInTheDocument()
        expect(document.querySelectorAll('audio')).toHaveLength(1)

        // Section headings draw as Perform's labels: a level-2 heading with its hue and pages.
        const sections = screen.getAllByTestId('rehearse-section')
        expect(sections.map((s) => s.tagName)).toEqual(['H2', 'H2'])
        expect(sections[0]).toHaveAttribute('data-section-hue')
        expect(sections[0]).toHaveTextContent('p. 12')
        expect(screen.getByTestId('rehearse-status-line')).toHaveTextContent('3 songs')
    })

    it('titles drop a stray file extension like the editor rows', () => {
        const rows = buildRehearseRows(
            [
                { id: 'a', title: "L'Cha Dodi Dmin .pdf", songId: 's1' },
                { id: 'b', title: 'Shiru L_Adonai Shir Shabbat.pdf', songId: 's2' },
            ],
            {},
        )
        expect(rows.map((r) => (r.kind === 'song' ? r.title : ''))).toEqual(["L'Cha Dodi Dmin", 'Shiru L_Adonai Shir Shabbat'])
    })

    it('says so when the setlist has no songs', () => {
        render(<RehearseClient setlistId="sl1" name="Empty" eventDate={null} rows={[]} />)
        expect(screen.queryAllByTestId('rehearse-song')).toHaveLength(0)
        expect(screen.getByText(/no songs/i)).toBeInTheDocument()
    })
})
