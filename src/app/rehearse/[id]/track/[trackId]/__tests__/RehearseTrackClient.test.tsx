import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const viewer = vi.hoisted(() => ({ smart: vi.fn(), pdf: vi.fn() }))

vi.mock('next/dynamic', () => ({
    default: (loader: () => Promise<unknown>) => {
        void loader
        return (props: Record<string, unknown>) => {
            // Stand-ins named by the props they receive.
            if ('fileId' in props) viewer.smart(props)
            else viewer.pdf(props)
            return <div data-testid={'fileId' in props ? 'smart-viewer' : 'pdf-viewer'} />
        }
    },
}))
vi.mock('@/lib/perform-chart-loaders', () => ({
    loadAudioViewer: vi.fn(),
    loadImageScoreViewer: vi.fn(),
    loadPDFViewer: vi.fn(),
    loadSmartScoreViewer: vi.fn(),
    loadTextScoreViewer: vi.fn(),
}))

import { RehearseTrackClient } from '../RehearseTrackClient'
import type { RehearseSongRow } from '../../../rows'

afterEach(() => {
    cleanup()
    viewer.smart.mockClear()
    viewer.pdf.mockClear()
})

const song = (over: Partial<RehearseSongRow> = {}): RehearseSongRow => ({
    kind: 'song',
    id: 't2',
    title: 'Hashkivenu',
    key: 'Dm',
    bpm: null,
    notes: null,
    folio: null,
    fileId: 'f2',
    take: { id: 'rec-a', title: 'Take A' },
    ...over,
})

describe('Rehearse chart page', () => {
    it('mounts the MusicXML viewer read-only, so nothing writes a key', () => {
        render(<RehearseTrackClient setlistId="sl1" song={song()} kind="musicxml" prevId={null} nextId="t4" />)
        expect(viewer.smart).toHaveBeenCalled()
        expect(viewer.smart.mock.calls[0][0]).toMatchObject({ fileId: 'f2', readOnly: true })
        expect(screen.getByRole('group')).toBeInTheDocument() // local transpose controls
    })

    it('a PDF gets the PDF viewer and no transpose control', () => {
        render(<RehearseTrackClient setlistId="sl1" song={song()} kind="pdf" prevId="t1" nextId={null} />)
        expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument()
        expect(screen.queryByRole('group')).not.toBeInTheDocument()
        expect(screen.getByTestId('rehearse-key')).toHaveTextContent('Dm')
    })

    it('the toolbar holds the note, position, next song, player, exit and prev/next links', () => {
        render(
            <RehearseTrackClient
                setlistId="sl1"
                song={song({ notes: 'Slow start' })}
                kind="pdf"
                prevId="t1"
                nextId="t4"
                position={2}
                total={5}
                next={{ title: 'Adon Olam', key: 'G' }}
            />,
        )
        expect(screen.getByTestId('chart-note-strip')).toHaveTextContent('Slow start')
        expect(screen.getByTestId('rehearse-position')).toHaveTextContent('Adon Olam')
        expect(screen.getByTestId('rehearse-back')).toHaveAttribute('href', '/rehearse/sl1')
        expect(screen.getByRole('heading', { level: 1, name: 'Hashkivenu' })).toBeInTheDocument()
        expect(screen.getByTestId('rehearse-prev')).toHaveAttribute('href', '/rehearse/sl1/track/t1')
        expect(screen.getByTestId('rehearse-next')).toHaveAttribute('href', '/rehearse/sl1/track/t4')
        expect(screen.getByTestId('rehearse-dock').querySelector('[data-testid="recording-player"]')).not.toBeNull()
    })

    it('first and last songs have a disabled end; no take says so', () => {
        render(<RehearseTrackClient setlistId="sl1" song={song({ take: null })} kind="pdf" prevId={null} nextId={null} />)
        expect(screen.getByTestId('rehearse-prev')).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByTestId('rehearse-next')).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByText('No recording yet')).toBeInTheDocument()
    })

    it('a song with no chart shows an empty state instead of a viewer', () => {
        render(<RehearseTrackClient setlistId="sl1" song={song({ fileId: null })} kind={null} prevId={null} nextId={null} />)
        expect(screen.getByTestId('rehearse-no-chart')).toBeInTheDocument()
        expect(viewer.pdf).not.toHaveBeenCalled()
    })
})
