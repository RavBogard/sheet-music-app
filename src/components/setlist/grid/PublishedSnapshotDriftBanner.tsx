'use client'

import { AlertTriangle } from 'lucide-react'

import type { LocalSetlist, LocalTrack } from '@/lib/local/types'

interface SnapshotRow {
    title: string
    key: string
    fileId: string
}

interface FirestoreTimestampLike {
    toMillis?: () => number
    toDate?: () => Date
    seconds?: number
    _seconds?: number
}

interface Props {
    liveSetlist: LocalSetlist | undefined
    tracks: LocalTrack[] | undefined
}

/**
 * F-017 — Drift banner shown above the track list when the setlist has
 * been published AND the current song rows differ from the snapshot the
 * band was notified about. Daniel doesn't re-publish on minor edits, so
 * the band's in-app notification + email keep showing the old set. This
 * surfaces the divergence so the editor can decide whether to re-publish.
 *
 * Read-only — no writes, no MCP calls. publishedSnapshot, publishedAt,
 * and lastNotifiedAt all live on the setlist doc and flow into Dexie via
 * snapshot-listener; the drift is computed client-side by fileId-keyed
 * diff against the live track list.
 */
export function PublishedSnapshotDriftBanner({
    liveSetlist,
    tracks,
}: Props): React.ReactElement | null {
    if (!liveSetlist || !tracks) return null

    const publishedSnapshot = parsePublishedSnapshot(liveSetlist.publishedSnapshot)
    if (publishedSnapshot.length === 0) return null

    const currentSnapshot = tracks
        .filter(
            (t): t is LocalTrack & { fileId: string } =>
                (t.type === undefined || t.type === 'song') &&
                typeof t.fileId === 'string' &&
                t.fileId.length > 0,
        )
        .map((t) => ({
            title: typeof t.title === 'string' ? t.title : '',
            key: typeof t.key === 'string' ? t.key : '',
            fileId: t.fileId,
        }))

    const diff = diffSnapshots(publishedSnapshot, currentSnapshot)
    const changeCount =
        diff.added.length + diff.removed.length + diff.modified.length
    if (changeCount === 0) return null

    const lastPublishedAtMs = readTimestampMs(
        liveSetlist.lastNotifiedAt ?? liveSetlist.publishedAt,
    )
    const sinceLabel =
        lastPublishedAtMs !== null ? formatTimeAgo(lastPublishedAtMs) : null

    const parts: string[] = []
    if (diff.added.length > 0)
        parts.push(`${diff.added.length} added`)
    if (diff.removed.length > 0)
        parts.push(`${diff.removed.length} removed`)
    if (diff.modified.length > 0)
        parts.push(`${diff.modified.length} modified`)
    const changesLabel = parts.join(', ')

    return (
        <div
            role="status"
            aria-label="Published snapshot drift"
            className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            data-testid="published-snapshot-drift-banner"
        >
            <AlertTriangle
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300"
                aria-hidden
            />
            <div className="flex flex-col gap-0.5">
                <p className="font-medium">
                    Published snapshot is stale
                    {sinceLabel ? ` — last published ${sinceLabel}` : ''}
                </p>
                <p className="text-amber-200/80">
                    {changesLabel} since the band was notified. Re-publish to
                    push the current list.
                </p>
            </div>
        </div>
    )
}

function parsePublishedSnapshot(raw: unknown): SnapshotRow[] {
    if (!Array.isArray(raw)) return []
    const rows: SnapshotRow[] = []
    for (const r of raw) {
        if (!r || typeof r !== 'object') continue
        const row = r as Record<string, unknown>
        const fileId = typeof row.fileId === 'string' ? row.fileId : ''
        if (!fileId) continue
        rows.push({
            title: typeof row.title === 'string' ? row.title : '',
            key: typeof row.key === 'string' ? row.key : '',
            fileId,
        })
    }
    return rows
}

function diffSnapshots(
    previous: SnapshotRow[],
    current: SnapshotRow[],
): {
    added: SnapshotRow[]
    removed: SnapshotRow[]
    modified: SnapshotRow[]
} {
    const prevByFileId = new Map(previous.map((r) => [r.fileId, r]))
    const currByFileId = new Map(current.map((r) => [r.fileId, r]))
    const added: SnapshotRow[] = []
    const modified: SnapshotRow[] = []
    for (const row of current) {
        const prior = prevByFileId.get(row.fileId)
        if (!prior) {
            added.push(row)
            continue
        }
        if (prior.title !== row.title || prior.key !== row.key) {
            modified.push(row)
        }
    }
    const removed: SnapshotRow[] = []
    for (const row of previous) {
        if (!currByFileId.has(row.fileId)) removed.push(row)
    }
    return { added, removed, modified }
}

function readTimestampMs(value: unknown): number | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (value instanceof Date) return value.getTime()
    if (typeof value === 'string') {
        const ms = Date.parse(value)
        return Number.isFinite(ms) ? ms : null
    }
    if (typeof value === 'object') {
        const ts = value as FirestoreTimestampLike
        if (typeof ts.toMillis === 'function') {
            try {
                return ts.toMillis()
            } catch {
                return null
            }
        }
        if (typeof ts.toDate === 'function') {
            try {
                return ts.toDate().getTime()
            } catch {
                return null
            }
        }
        const seconds = ts.seconds ?? ts._seconds
        if (typeof seconds === 'number' && Number.isFinite(seconds)) {
            return seconds * 1000
        }
    }
    return null
}

function formatTimeAgo(thenMs: number): string {
    const diffMs = Date.now() - thenMs
    if (diffMs < 0) return 'just now'
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hr ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'yesterday'
    if (days < 14) return `${days} days ago`
    const weeks = Math.floor(days / 7)
    return `${weeks} wk ago`
}
