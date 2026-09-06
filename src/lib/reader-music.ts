import type { LocalTrack } from "@/lib/local/types"

export interface ReaderMusicCrosswalk {
    orgId: string
    momentId: string
    pieceId: string
    status: "reviewed"
}

export interface ReaderMusicSetlist extends Record<string, unknown> {
    id: string
    orgId?: string
    eventDate?: unknown
    date?: unknown
    isTemplate?: boolean
    isTest?: boolean
}

export interface ReaderMusicBinding {
    setlistId: string
    trackId: string
    songId: string
    fileId: string
    title: string | null
    key: string | null
    arrangement: string | null
    version: string | null
    mimeType: string | null
    lastUsedDate: string
    lastUsedLabel: string
}

export type ReaderMusicSelection =
    | { status: "available"; binding: ReaderMusicBinding }
    | { status: "unavailable" }

export interface ReaderMusicSelectionDependencies {
    getTracksForSetlist: (
        setlistId: string,
        setlist: ReaderMusicSetlist,
    ) => Promise<LocalTrack[]>
    isBindingAuthorized: (binding: ReaderMusicBinding) => Promise<boolean>
}

function instant(value: unknown): number | null {
    if (value instanceof Date) {
        const ms = value.getTime()
        return Number.isFinite(ms) ? ms : null
    }
    if (typeof value === "string" || typeof value === "number") {
        const ms = new Date(value).getTime()
        return Number.isFinite(ms) ? ms : null
    }
    if (value && typeof value === "object") {
        const timestamp = value as {
            toDate?: () => Date
            seconds?: unknown
        }
        if (typeof timestamp.toDate === "function") {
            const ms = timestamp.toDate().getTime()
            return Number.isFinite(ms) ? ms : null
        }
        if (typeof timestamp.seconds === "number") {
            const ms = timestamp.seconds * 1000
            return Number.isFinite(ms) ? ms : null
        }
    }
    return null
}

/** Actual eventDate first; `date` is the established legacy service-date fallback. */
export function readerMusicEventInstant(
    setlist: Pick<ReaderMusicSetlist, "eventDate" | "date">,
): number | null {
    return instant(setlist.eventDate) ?? instant(setlist.date)
}

function readerMusicLastUsedDate(
    setlist: Pick<ReaderMusicSetlist, "eventDate" | "date">,
    usedAt: number,
): string {
    const eventMs = instant(setlist.eventDate)
    const raw = eventMs === null ? setlist.date : setlist.eventDate
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw)) {
        return raw.slice(0, 10)
    }
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(usedAt))
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
    return `${part("year")}-${part("month")}-${part("day")}`
}

function exactString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null
}

function trackBinding(
    setlistId: string,
    track: LocalTrack,
    usedAt: number,
    lastUsedDate: string,
): ReaderMusicBinding | null {
    const songId = exactString(track.songId)
    const fileId = exactString(track.fileId)
    if (!songId || !fileId) return null

    return {
        setlistId,
        trackId: track.id,
        songId,
        fileId,
        title: exactString(track.title),
        key: exactString(track.key),
        arrangement: exactString(track.arrangement),
        version: exactString(track.version),
        mimeType: exactString(track.mimeType),
        lastUsedDate,
        lastUsedLabel: `Last used ${lastUsedDate}`,
    }
}

function bindingSignature(binding: ReaderMusicBinding): string {
    return JSON.stringify([
        binding.songId,
        binding.fileId,
        binding.key,
        binding.arrangement,
        binding.version,
    ])
}

function matchesReviewedIdentity(
    track: LocalTrack,
    crosswalk: ReaderMusicCrosswalk,
): boolean {
    const identity = track.readerMusic
    if (!identity || typeof identity !== "object") return false
    const persisted = identity as Record<string, unknown>
    return (
        persisted.momentId === crosswalk.momentId &&
        persisted.pieceId === crosswalk.pieceId
    )
}

/**
 * Deterministically select the newest exact reviewed identity occurrence.
 * Validation applies only to the newest binding: a bad latest row never falls
 * back to an older chart and same-instant conflicting bindings are ambiguous.
 */
export async function selectLatestReaderMusic(
    setlists: ReaderMusicSetlist[],
    crosswalk: ReaderMusicCrosswalk,
    nowMs: number,
    deps: ReaderMusicSelectionDependencies,
): Promise<ReaderMusicSelection> {
    if (crosswalk.status !== "reviewed") return { status: "unavailable" }

    const eligible = setlists
        .map((setlist) => ({
            setlist,
            usedAt: readerMusicEventInstant(setlist),
        }))
        .filter(
            (candidate): candidate is {
                setlist: ReaderMusicSetlist
                usedAt: number
            } =>
                candidate.setlist.orgId === crosswalk.orgId &&
                candidate.setlist.isTest === false &&
                candidate.setlist.isTemplate !== true &&
                candidate.usedAt !== null &&
                candidate.usedAt <= nowMs,
        )
        .sort(
            (a, b) =>
                b.usedAt - a.usedAt ||
                a.setlist.id.localeCompare(b.setlist.id),
        )

    const occurrences: Array<{ usedAt: number; binding: ReaderMusicBinding }> = []
    for (const { setlist, usedAt } of eligible) {
        const lastUsedDate = readerMusicLastUsedDate(setlist, usedAt)
        const tracks = await deps.getTracksForSetlist(setlist.id, setlist)
        for (const track of tracks) {
            if (!matchesReviewedIdentity(track, crosswalk)) continue
            const binding = trackBinding(setlist.id, track, usedAt, lastUsedDate)
            if (!binding) {
                // An exact latest occurrence without a complete binding is
                // deliberately retained as unavailable rather than skipped.
                occurrences.push({
                    usedAt,
                    binding: {
                        setlistId: setlist.id,
                        trackId: track.id,
                        songId: "",
                        fileId: "",
                        title: exactString(track.title),
                        key: exactString(track.key),
                        arrangement: exactString(track.arrangement),
                        version: exactString(track.version),
                        mimeType: exactString(track.mimeType),
                        lastUsedDate,
                        lastUsedLabel: `Last used ${lastUsedDate}`,
                    },
                })
                continue
            }
            occurrences.push({ usedAt, binding })
        }
    }
    if (occurrences.length === 0) return { status: "unavailable" }

    const newestInstant = Math.max(...occurrences.map((o) => o.usedAt))
    const newest = occurrences
        .filter((o) => o.usedAt === newestInstant)
        .sort(
            (a, b) =>
                a.binding.setlistId.localeCompare(b.binding.setlistId) ||
                a.binding.trackId.localeCompare(b.binding.trackId),
        )
    if (new Set(newest.map((o) => bindingSignature(o.binding))).size !== 1) {
        return { status: "unavailable" }
    }

    const binding = newest[0]!.binding
    if (!binding.songId || !binding.fileId) return { status: "unavailable" }
    if (!(await deps.isBindingAuthorized(binding))) {
        return { status: "unavailable" }
    }
    return { status: "available", binding }
}
