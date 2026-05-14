import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom doesn't ship ResizeObserver / scrollIntoView — Radix Popover touches
// both. Stub before any popover renders (parity with ChartBindPopover.test).
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(
    globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }
).ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
}

import type { Recording } from '@/types/models'

// vi.hoisted guarantees these exist before the vi.mock factories run.
const { mockSubscribe, mockUpload, authState } = vi.hoisted(() => ({
    mockSubscribe: vi.fn(),
    mockUpload: vi.fn(),
    authState: { isBandLeader: false, isAdmin: false },
}))

vi.mock('@/lib/recordings/recordings-client', () => ({
    subscribeRecordingsForSong: mockSubscribe,
    uploadRecording: mockUpload,
    getRecordingPlaybackUrl: (rec: { id: string }) =>
        `/api/recordings/file/${rec.id}`,
}))

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => authState,
}))

import { RecordingBindPopover } from '../RecordingBindPopover'

function makeRecording(over: Partial<Recording> = {}): Recording {
    return {
        id: 'rec-1',
        songId: 'song-1',
        title: 'Take 1',
        storagePath: 'recordings/rec-1.mp3',
        createdAt: '2026-05-14T00:00:00Z',
        createdBy: 'uid-1',
        ...over,
    }
}

beforeEach(() => {
    mockSubscribe.mockReset()
    mockUpload.mockReset()
    authState.isBandLeader = false
    authState.isAdmin = false
})

afterEach(() => {
    // RTL auto-cleanup handles unmounting.
})

describe('RecordingBindPopover', () => {
    it("lists a song's recordings newest-first with inline audio when opened", async () => {
        const recs = [
            makeRecording({ id: 'rec-1', title: 'Take 1' }),
            makeRecording({ id: 'rec-2', title: 'Take 2' }),
        ]
        mockSubscribe.mockImplementation(
            (_songId: string, cb: (r: Recording[]) => void) => {
                cb(recs)
                return () => {}
            },
        )

        render(
            <RecordingBindPopover songId="song-1" songTitle="Adon Olam">
                <button>open</button>
            </RecordingBindPopover>,
        )

        await userEvent.click(screen.getByText('open'))
        await screen.findByTestId('recording-bind-popover')

        expect(screen.getByText('Take 1')).toBeInTheDocument()
        expect(screen.getByText('Take 2')).toBeInTheDocument()

        const audios = document.querySelectorAll('audio')
        expect(audios).toHaveLength(2)
        expect(audios[0].getAttribute('src')).toBe(
            '/api/recordings/file/rec-1',
        )
        expect(mockSubscribe).toHaveBeenCalledWith(
            'song-1',
            expect.any(Function),
        )
    })

    it('shows an empty state when the song has no recordings', async () => {
        mockSubscribe.mockImplementation(
            (_songId: string, cb: (r: Recording[]) => void) => {
                cb([])
                return () => {}
            },
        )

        render(
            <RecordingBindPopover songId="song-1">
                <button>open</button>
            </RecordingBindPopover>,
        )

        await userEvent.click(screen.getByText('open'))
        await screen.findByTestId('recording-bind-popover')

        expect(screen.getByText(/No recordings yet/)).toBeInTheDocument()
        expect(document.querySelectorAll('audio')).toHaveLength(0)
    })

    it('shows the upload affordance only for band-leaders / admins', async () => {
        mockSubscribe.mockImplementation(
            (_songId: string, cb: (r: Recording[]) => void) => {
                cb([])
                return () => {}
            },
        )

        // Member — no upload affordance.
        const { unmount } = render(
            <RecordingBindPopover songId="song-1">
                <button>open</button>
            </RecordingBindPopover>,
        )
        await userEvent.click(screen.getByText('open'))
        await screen.findByTestId('recording-bind-popover')
        expect(
            screen.queryByText('Upload recording'),
        ).not.toBeInTheDocument()
        unmount()

        // Band-leader — upload affordance present.
        authState.isBandLeader = true
        render(
            <RecordingBindPopover songId="song-1">
                <button>open</button>
            </RecordingBindPopover>,
        )
        await userEvent.click(screen.getByText('open'))
        await screen.findByTestId('recording-bind-popover')
        expect(screen.getByText('Upload recording')).toBeInTheDocument()
    })
})
