"use client"

/**
 * Three action surfaces for the live-director gesture, mounted inside
 * `LiveDirectorMenu`:
 *
 *   - `<ChangeKeyAction>` — KeyPicker over the live track key.
 *   - `<SwapChartAction>` — library search modal; default filter biases to
 *     other arrangements of the same stem (matching the swap_chart MCP
 *     tool's "another arrangement" intent), with a clear-filter toggle to
 *     scan the whole library.
 *   - `<InsertSongAction>` — library search modal + before/after/append
 *     placement chooser; writes a new track at the chosen position.
 *
 * All three commit on tap (tap-once-commit per DISCUSSION ##ADDENDUM 4),
 * close the parent sheet on success, and surface errors inline if a write
 * fails (the auth-gated row is still mounted; Bryn can retry).
 */

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { KeyPicker } from "@/components/ui/key-picker"
import { useLibraryStore } from "@/lib/library-store"
import {
    changeTrackKey,
    swapTrackChart,
    insertTrack,
    type InsertPlacement,
} from "@/lib/live-director"
import type { DriveFile, SetlistTrack } from "@/types/models"

const SEARCH_RESULT_CAP = 60

// ──────────────────────────────────────────────────────────────────────────
// Change key
// ──────────────────────────────────────────────────────────────────────────

export interface ChangeKeyActionProps {
    track: SetlistTrack
    onDone: () => void
}

export function ChangeKeyAction({ track, onDone }: ChangeKeyActionProps) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Local mirror of the picker value — the picker calls onChange on every
    // tap, and we commit immediately (tap-once-commit). Useful for showing
    // the in-flight selection in the trigger button.
    const [pendingKey, setPendingKey] = useState<string>(track.key ?? "")

    const handlePick = async (key: string) => {
        // Empty string == clear key. KeyPicker's "Clear" button passes "".
        setPendingKey(key)
        setBusy(true)
        setError(null)
        try {
            await changeTrackKey(track.id, key)
            onDone()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't change the key.")
            setBusy(false)
        }
    }

    return (
        <div className="p-4 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
                Current key:{" "}
                <span className="font-mono font-semibold text-foreground">
                    {track.key || "—"}
                </span>
            </p>
            <div className="flex items-center gap-2">
                <KeyPicker
                    value={pendingKey}
                    onChange={handlePick}
                    className="h-12 px-4 text-base"
                />
                {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />}
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <p className="text-xs text-muted-foreground">
                Tap a key to commit. The displayed key updates everywhere this setlist is open.
            </p>
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Swap chart
// ──────────────────────────────────────────────────────────────────────────

export interface SwapChartActionProps {
    track: SetlistTrack
    onDone: () => void
}

export function SwapChartAction({ track, onDone }: SwapChartActionProps) {
    const allFiles = useLibraryStore((s) => s.allFiles)
    const [query, setQuery] = useState<string>(() => deriveStem(track.title))
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const results = useMemo(
        () => filterLibrary(allFiles, query, track.fileId),
        [allFiles, query, track.fileId],
    )

    const handlePick = async (song: DriveFile) => {
        setBusy(true)
        setError(null)
        try {
            await swapTrackChart(track.id, song)
            onDone()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't swap the chart.")
            setBusy(false)
        }
    }

    return (
        <div className="p-4 flex flex-col gap-3 h-full min-h-0">
            <SearchBox
                query={query}
                onQueryChange={setQuery}
                placeholder="Search the library…"
            />
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <LibraryResultsList
                results={results}
                emptyHint={
                    allFiles.length === 0
                        ? "Library hasn't finished loading. Try again in a moment."
                        : "No charts match this search."
                }
                onPick={handlePick}
                busy={busy}
                emphasisLabel="Swap to"
            />
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Insert new song
// ──────────────────────────────────────────────────────────────────────────

export interface InsertSongActionProps {
    setlistId: string
    setlistTracks: SetlistTrack[]
    currentIndex: number
    onDone: () => void
}

export function InsertSongAction({
    setlistId,
    setlistTracks,
    currentIndex,
    onDone,
}: InsertSongActionProps) {
    const allFiles = useLibraryStore((s) => s.allFiles)
    const [query, setQuery] = useState("")
    const [placement, setPlacement] = useState<InsertPlacement>("after")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const results = useMemo(
        // Insert path doesn't pre-bias on stem — Bryn might add an unrelated
        // song (e.g. an Adon Olam at the end of a Friday-night setlist that
        // didn't have one). Pass no excludeId.
        () => filterLibrary(allFiles, query, null),
        [allFiles, query],
    )

    const handlePick = async (song: DriveFile) => {
        setBusy(true)
        setError(null)
        try {
            await insertTrack({
                setlistId,
                song,
                placement,
                currentIndex,
                currentTracks: setlistTracks,
            })
            onDone()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't insert the song.")
            setBusy(false)
        }
    }

    return (
        <div className="p-4 flex flex-col gap-3 h-full min-h-0">
            <PlacementChooser value={placement} onChange={setPlacement} />
            <SearchBox
                query={query}
                onQueryChange={setQuery}
                placeholder="Search a song to insert…"
            />
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <LibraryResultsList
                results={results}
                emptyHint={
                    allFiles.length === 0
                        ? "Library hasn't finished loading. Try again in a moment."
                        : query.trim().length === 0
                            ? "Type to search the library."
                            : "No charts match this search."
                }
                onPick={handlePick}
                busy={busy}
                emphasisLabel="Insert"
            />
        </div>
    )
}

interface PlacementChooserProps {
    value: InsertPlacement
    onChange: (value: InsertPlacement) => void
}

function PlacementChooser({ value, onChange }: PlacementChooserProps) {
    const opts: { value: InsertPlacement; label: string }[] = [
        { value: "before", label: "Before" },
        { value: "after", label: "After" },
        { value: "append", label: "At end" },
    ]
    return (
        <div
            role="radiogroup"
            aria-label="Where to insert"
            className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border/60"
        >
            {opts.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        "flex-1 min-h-11 px-3 py-2 rounded-md text-sm font-medium [touch-action:manipulation]",
                        value === o.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Shared bits
// ──────────────────────────────────────────────────────────────────────────

interface SearchBoxProps {
    query: string
    onQueryChange: (value: string) => void
    placeholder: string
}

function SearchBox({ query, onQueryChange, placeholder }: SearchBoxProps) {
    return (
        <div className="relative">
            <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={placeholder}
                aria-label={placeholder}
                className="h-11 text-base pr-10 [touch-action:manipulation]"
                autoFocus
            />
            {query.length > 0 && (
                <button
                    type="button"
                    onClick={() => onQueryChange("")}
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted [touch-action:manipulation]"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
        </div>
    )
}

interface LibraryResultsListProps {
    results: DriveFile[]
    emptyHint: string
    onPick: (song: DriveFile) => void | Promise<void>
    busy: boolean
    emphasisLabel: string
}

function LibraryResultsList({
    results,
    emptyHint,
    onPick,
    busy,
    emphasisLabel,
}: LibraryResultsListProps) {
    if (results.length === 0) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
                {emptyHint}
            </div>
        )
    }
    return (
        <ul className="flex-1 min-h-0 overflow-y-auto -mx-4">
            {results.map((song) => (
                <li key={song.id}>
                    <button
                        type="button"
                        onClick={() => onPick(song)}
                        disabled={busy}
                        aria-label={`${emphasisLabel} ${song.displayName ?? song.name}`}
                        className={cn(
                            "w-full min-h-12 flex items-center gap-3 px-4 py-2 text-left [touch-action:manipulation]",
                            "hover:bg-muted active:bg-muted/80 disabled:opacity-50 disabled:pointer-events-none",
                            "border-b border-border/40",
                        )}
                    >
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-foreground truncate">
                                {song.displayName ?? song.name}
                            </span>
                            {song.metadata?.key && (
                                <span className="block text-[11px] font-mono text-muted-foreground">
                                    {song.metadata.key}
                                </span>
                            )}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers (no React, no I/O — exported for unit tests)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Strip composer-parenthetical / arrangement-clarifier suffixes to derive a
 * "stem" we can default-search the library with. Matches the same hand
 * heuristic Daniel uses verbally: "Hashkivenu (Klepper-Freelander)" → "Hashkivenu".
 */
export function deriveStem(title: string | undefined): string {
    if (!title) return ""
    const trimmed = title.trim()
    const idx = trimmed.indexOf("(")
    if (idx > 0) return trimmed.slice(0, idx).trim()
    return trimmed
}

/**
 * Lightweight client-side library filter. We use a substring match here
 * (not the Fuse index from library-store) because:
 *   1. The result list is mounted inside a sheet with a known small viewport,
 *      so >60 results is wasteful regardless of fuzzy match quality.
 *   2. The Fuse index requires the library-store filter() call which mutates
 *      `displayedFiles` — invasive on a shared store for a transient gesture.
 *   3. Substring match is deterministic and trivially unit-testable.
 *
 * `excludeId` drops the currently-bonded chart from swap results (Bryn won't
 * "swap to the same chart").
 */
export function filterLibrary(
    allFiles: DriveFile[],
    query: string,
    excludeId: string | null | undefined,
): DriveFile[] {
    const q = query.trim().toLowerCase()
    let pool = allFiles
    if (excludeId) pool = pool.filter((f) => f.id !== excludeId)
    if (q.length === 0) {
        // Empty query: surface the whole pool, capped — gives Bryn a scroll-
        // to-find affordance when she doesn't remember the title.
        return pool.slice(0, SEARCH_RESULT_CAP)
    }
    const matches: DriveFile[] = []
    for (const f of pool) {
        const name = (f.displayName ?? f.name).toLowerCase()
        if (name.includes(q)) {
            matches.push(f)
            if (matches.length >= SEARCH_RESULT_CAP) break
        }
    }
    return matches
}
