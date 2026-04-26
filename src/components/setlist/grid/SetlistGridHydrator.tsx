'use client'

import { useEffect, useState } from 'react'

import { getDb } from '@/lib/local/schema'
import type { LocalSetlist, LocalTrack } from '@/lib/local/types'

import { SetlistGrid, type SetlistGridProps } from './SetlistGrid'

export interface SetlistGridHydratorProps {
    setlistId: string
    initialSetlist: LocalSetlist
    initialTracks: LocalTrack[]
    gridProps?: Omit<SetlistGridProps, 'setlistId'>
}

export function SetlistGridHydrator({
    setlistId,
    initialSetlist,
    initialTracks,
    gridProps,
}: SetlistGridHydratorProps) {
    const [hydration, setHydration] = useState<'pending' | 'done'>('pending')

    useEffect(() => {
        let cancelled = false
        const db = getDb()

        async function hydrate() {
            // LWW per-document: only overwrite local rows when the server's
            // updatedAt is newer (or local is missing). Server data is
            // authoritative — write directly to Dexie, NOT via applyEdit
            // (which would enqueue an outbox row and re-send back to Firestore).
            await db.transaction('rw', db.setlists, db.tracks, async () => {
                const localSetlist = await db.setlists.get(setlistId)
                if (
                    !localSetlist ||
                    (localSetlist.updatedAt ?? 0) <
                        (initialSetlist.updatedAt ?? 0)
                ) {
                    await db.setlists.put(initialSetlist)
                }

                if (initialTracks.length === 0) return

                const localById = new Map<string, LocalTrack>()
                const localTracks = await db.tracks
                    .where('setlistId')
                    .equals(setlistId)
                    .toArray()
                for (const t of localTracks) localById.set(t.id, t)

                const toPut: LocalTrack[] = []
                for (const t of initialTracks) {
                    const local = localById.get(t.id)
                    if (
                        !local ||
                        ((local.updatedAt as number | undefined) ?? 0) <
                            ((t.updatedAt as number | undefined) ?? 0)
                    ) {
                        toPut.push(t)
                    }
                }
                if (toPut.length > 0) await db.tracks.bulkPut(toPut)
            })

            if (!cancelled) setHydration('done')
        }

        void hydrate()
        return () => {
            cancelled = true
        }
    }, [setlistId, initialSetlist, initialTracks])

    return (
        <div data-testid="setlist-grid-hydrator" data-hydration={hydration}>
            <SetlistGrid setlistId={setlistId} {...gridProps} />
        </div>
    )
}
