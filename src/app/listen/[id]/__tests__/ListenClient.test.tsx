import '@testing-library/jest-dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ListenClient } from '../ListenClient'
import { buildListenRows } from '../rows'

afterEach(cleanup)

const tracks = [
    { id: 't1', title: 'Opening', type: 'header' },
    { id: 't2', title: 'Hashkivenu', type: 'song', songId: 's-a' },
    { id: 't3', title: 'Torah reading', type: 'reading' },
    { id: 't4', title: 'Adon Olam', songId: 's-b' },
    { id: 't5', title: 'Closing', type: 'section' },
    { id: 't6', title: 'Mi Shebeirach', type: 'song' },
]
const featured = { 's-a': { id: 'rec-a', title: 'Shir Shabbat, Nov 14, 2025' } }

describe('Listen page', () => {
    it('rows in author order; songs without a take say No recording yet; sections render as headings', () => {
        const rows = buildListenRows(tracks, featured)
        render(<ListenClient name="Shabbat morning" eventDate="2025-11-15T12:00:00.000Z" rows={rows} />)

        expect(screen.getByRole('heading', { level: 1, name: 'Shabbat morning' })).toBeInTheDocument()
        const headings = screen.getAllByRole('heading').map((h) => h.textContent)
        expect(headings).toEqual(['Shabbat morning', 'Opening', 'Hashkivenu', 'Adon Olam', 'Closing', 'Mi Shebeirach'])
        expect(screen.queryByText('Torah reading')).not.toBeInTheDocument()

        const songs = screen.getAllByTestId('listen-song')
        expect(songs).toHaveLength(3)
        expect(within(songs[0]).getByTestId('recording-player')).toBeInTheDocument()
        expect(within(songs[1]).getByText('No recording yet')).toBeInTheDocument()
        expect(within(songs[2]).getByText('No recording yet')).toBeInTheDocument()
        expect(document.querySelectorAll('audio')).toHaveLength(1)
    })

    it('titles drop a stray file extension and underscores-as-is like the editor rows', () => {
        const rows = buildListenRows(
            [
                { id: 'a', title: "L'Cha Dodi Dmin .pdf", songId: 's1' },
                { id: 'b', title: 'Shiru L_Adonai Shir Shabbat.pdf', songId: 's2' },
            ],
            {},
        )
        expect(rows.map((r) => r.title)).toEqual(["L'Cha Dodi Dmin", 'Shiru L_Adonai Shir Shabbat'])
    })

    it('a song with no take is one line (title and note share the row); a take keeps the player', () => {
        const rows = buildListenRows(tracks, featured)
        render(<ListenClient name="X" eventDate={null} rows={rows} />)
        const songs = screen.getAllByTestId('listen-song')
        const noTake = songs[1]
        expect(noTake.children).toHaveLength(2)
        expect(noTake.className).toContain('flex')
        expect(noTake.className).not.toContain('flex-col')
        expect(within(noTake).getByRole('heading', { level: 3 }).className).toContain('truncate')
        expect(within(songs[0]).getByTestId('recording-player')).toBeInTheDocument()
    })

    it('says so when the setlist has no songs', () => {
        render(<ListenClient name="Empty" eventDate={null} rows={[]} />)
        expect(screen.queryAllByTestId('listen-song')).toHaveLength(0)
        expect(screen.getByText(/no songs/i)).toBeInTheDocument()
    })
})
