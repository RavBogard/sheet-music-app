import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { LocalSetlist, LocalTrack } from '@/lib/local/types'

import { PublishedSnapshotDriftBanner } from '../PublishedSnapshotDriftBanner'

function setlist(
    overrides: Partial<LocalSetlist> & Record<string, unknown> = {},
): LocalSetlist {
    return {
        id: 'set-1',
        updatedAt: Date.now(),
        ownerId: 'u1',
        ...overrides,
    }
}

function track(
    id: string,
    fileId: string,
    title = '',
    extras: Partial<LocalTrack> & Record<string, unknown> = {},
): LocalTrack {
    return {
        id,
        setlistId: 'set-1',
        order: 0,
        fileId,
        title,
        type: 'song',
        ...extras,
    }
}

describe('PublishedSnapshotDriftBanner', () => {
    it('renders nothing when liveSetlist is undefined', () => {
        const { container } = render(
            <PublishedSnapshotDriftBanner liveSetlist={undefined} tracks={[]} />,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when the setlist has never been published', () => {
        const { container } = render(
            <PublishedSnapshotDriftBanner
                liveSetlist={setlist()}
                tracks={[track('t1', 'song-A', 'Adon Olam')]}
            />,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when current tracks match publishedSnapshot exactly', () => {
        const { container } = render(
            <PublishedSnapshotDriftBanner
                liveSetlist={setlist({
                    publishedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
                    publishedSnapshot: [
                        { title: 'Adon Olam', key: 'D', fileId: 'song-A' },
                    ],
                })}
                tracks={[track('t1', 'song-A', 'Adon Olam', { key: 'D' })]}
            />,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('renders the banner with combined add/remove/modify counts on drift', () => {
        render(
            <PublishedSnapshotDriftBanner
                liveSetlist={setlist({
                    publishedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
                    lastNotifiedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
                    publishedSnapshot: [
                        { title: 'Old Title', key: 'D', fileId: 'song-A' },
                        { title: 'Removed Song', key: 'G', fileId: 'song-B' },
                    ],
                })}
                tracks={[
                    // song-A: same fileId, title changed → modified
                    track('t1', 'song-A', 'Renamed', { key: 'D' }),
                    // song-C: brand new → added
                    track('t2', 'song-C', 'New Song'),
                ]}
            />,
        )
        const banner = screen.getByTestId('published-snapshot-drift-banner')
        expect(banner).toBeInTheDocument()
        expect(banner).toHaveTextContent(/Published snapshot is stale/i)
        expect(banner).toHaveTextContent(/1 added/i)
        expect(banner).toHaveTextContent(/1 removed/i)
        expect(banner).toHaveTextContent(/1 modified/i)
        expect(banner).toHaveTextContent(/Re-publish/i)
    })

    it('ignores non-song track types when computing drift', () => {
        const { container } = render(
            <PublishedSnapshotDriftBanner
                liveSetlist={setlist({
                    publishedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
                    publishedSnapshot: [
                        { title: 'Adon Olam', key: 'D', fileId: 'song-A' },
                    ],
                })}
                tracks={[
                    track('t1', 'song-A', 'Adon Olam', { key: 'D' }),
                    // header rows shouldn't count as "added"
                    track('h1', '', '', { type: 'header', title: 'Section break' }),
                ]}
            />,
        )
        expect(container).toBeEmptyDOMElement()
    })
})
