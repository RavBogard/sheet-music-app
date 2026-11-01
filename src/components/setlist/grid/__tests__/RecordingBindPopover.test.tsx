import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
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
const { mockSubscribe, mockUpload, mockFeature, authState, orgState } = vi.hoisted(() => ({
    mockSubscribe: vi.fn(),
    mockFeature: vi.fn(),
    mockUpload: vi.fn(),
    authState: { isBandLeader: false, isAdmin: false },
    orgState: { current: 'crc' as string },
}))

vi.mock('@/lib/recordings/recordings-client', () => ({
    subscribeRecordingsForSong: mockSubscribe,
    uploadRecording: mockUpload,
    featureRecording: mockFeature,
    getRecordingPlaybackUrl: (rec: { id: string }) =>
        `/api/recordings/file/${rec.id}`,
}))

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => authState,
}))

// v11.7-06-01: the popover scopes the subscription to the current tenant org.
vi.mock('@/lib/org/org-context', () => ({
    useOrg: () => orgState.current,
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
    orgState.current = 'crc'
})

afterEach(() => {
    // RTL auto-cleanup handles unmounting.
})

describe('RecordingBindPopover', () => {
    it('featured take shown first; held takes not shown; leader sees Show this take', async () => {
        const recs = [
            makeRecording({ id: 'rec-old', title: 'Older take', createdAt: '2026-01-01T00:00:00Z' }),
            makeRecording({ id: 'rec-feat', title: 'Featured take', featured: true }),
            makeRecording({ id: 'rec-held', title: 'Held take', status: 'held' }),
        ]
        mockSubscribe.mockImplementation(
            (_songId: string, _orgId: string, cb: (r: Recording[]) => void) => {
                cb(recs)
                return () => {}
            },
        )
        mockFeature.mockResolvedValue(undefined)
        authState.isBandLeader = true

        render(
            <RecordingBindPopover songId="song-1" songTitle="Adon Olam">
                <button>open</button>
            </RecordingBindPopover>,
        )
        await userEvent.click(screen.getByText('open'))
        await screen.findByTestId('recording-bind-popover')

        const featured = screen.getByTestId('featured-take')
        expect(within(featured).getByText('Featured take')).toBeInTheDocument()
        expect(screen.queryByText('Held take')).not.toBeInTheDocument()
        // featured + one other; the held take has no audio element
        expect(document.querySelectorAll('audio')).toHaveLength(2)
        expect(document.querySelector('audio')!.getAttribute('src')).toBe('/api/recordings/file/rec-feat')

        await userEvent.click(screen.getByRole('button', { name: 'Show this take' }))
        expect(mockFeature).toHaveBeenCalledWith('rec-old')
        expect(mockSubscribe).toHaveBeenCalledWith('song-1', 'crc', expect.any(Function))
    })

    it('a member sees no Show this take control', async () => {
        mockSubscribe.mockImplementation(
            (_s: string, _o: string, cb: (r: Recording[]) => void) => {
                cb([makeRecording({ id: 'a', featured: true }), makeRecording({ id: 'b', title: 'B' })])
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
        expect(screen.queryByRole('button', { name: 'Show this take' })).not.toBeInTheDocument()
    })

    it('scopes the subscription to the current tenant org', async () => {
        // A viewer on the Brothers Lazaroff host → subscribe filters on that org.
        orgState.current = 'brotherslazaroff'
        mockSubscribe.mockImplementation(
            (_songId: string, _orgId: string, cb: (r: Recording[]) => void) => {
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

        expect(mockSubscribe).toHaveBeenCalledWith(
            'song-1',
            'brotherslazaroff',
            expect.any(Function),
        )
    })

    it('shows an empty state when the song has no recordings', async () => {
        mockSubscribe.mockImplementation(
            (_songId: string, _orgId: string, cb: (r: Recording[]) => void) => {
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
            (_songId: string, _orgId: string, cb: (r: Recording[]) => void) => {
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
