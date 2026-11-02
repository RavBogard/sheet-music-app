"use client"

import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { useLibraryStore } from "@/lib/library-store"
import { rowOrg } from "@/lib/org/membership"
import { useOrg } from "@/lib/org/org-context"
import { isHiddenStatus } from "@/lib/songs/picker-scope"

export interface PickedSong {
    id: string
    title: string
}

const MAX_RESULTS = 30

function songTitle(f: { name: string; displayName?: string }): string {
    return f.displayName || f.name.replace(/\.[^/.]+$/, "")
}

/**
 * "Which song is this a recording of?" — a search over this site's own
 * library rows (the list the Library page already loaded). A song's id is its
 * library file id, the same id recordings link to. Rows of another site never
 * appear: the upload route only takes a song of this congregation.
 */
export function RecordingSongPicker({ onPick }: { onPick: (song: PickedSong) => void }) {
    const t = useT()
    const org = useOrg()
    const ownFiles = useLibraryStore((s) => s.ownFiles)
    const [q, setQ] = useState("")

    const songs = useMemo(
        () =>
            ownFiles
                .filter((f) => rowOrg(f.orgId) === org && !isHiddenStatus(f.status) && !f.mimeType.includes("folder"))
                .map((f) => ({ id: f.id, title: songTitle(f) })),
        [ownFiles, org],
    )
    const matches = useMemo(() => {
        const needle = q.trim().toLowerCase()
        const hits = needle ? songs.filter((s) => s.title.toLowerCase().includes(needle)) : songs
        return hits.slice(0, MAX_RESULTS)
    }, [songs, q])

    return (
        <div data-testid="recording-song-picker">
            <label htmlFor="recording-song-search" className="text-xs text-brand font-medium mb-1 block">
                {t("recordings.whichSong")}
            </label>
            <Input
                id="recording-song-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("recordings.songSearchPlaceholder")}
                aria-label={t("recordings.songSearchAria")}
                autoComplete="off"
            />
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border" role="listbox" aria-label={t("recordings.whichSong")}>
                {matches.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">{t("recordings.noSongMatch")}</li>
                ) : (
                    matches.map((s) => (
                        <li key={s.id} role="option" aria-selected={false}>
                            <button
                                type="button"
                                data-song-id={s.id}
                                onClick={() => onPick(s)}
                                className="flex min-h-11 w-full items-center px-3 text-start text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="truncate">{s.title}</span>
                            </button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    )
}
