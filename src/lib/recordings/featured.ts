/**
 * Recordings 2026-11 — which take of a song a musician hears. PURE: no
 * firebase imports, because the ingest's publish script imports this too.
 *
 * Each song shows one featured take. Only playable takes count (status absent
 * or 'live'; held and hidden are never listed or played). An explicitly
 * featured take wins, then the higher matcher confidence (a legacy upload with
 * no source ranks as 1), then the newer createdAt.
 */
import type { Recording } from "@/types/models"

export type { Recording, RecordingSource, RecordingStatus } from "@/types/models"

export interface FeaturedRecording {
    id: string
    title: string
    /** Site-relative: `/api/recordings/file/<id>`. Prefix a host for an absolute link. */
    url: string
}

export function isPlayable(r: Pick<Recording, "status">): boolean {
    return r.status === undefined || r.status === null || r.status === "live"
}

/** The serving route's path for a recording; pass `base` (e.g. https://host) for an absolute URL. */
export function recordingFileUrl(id: string, base = ""): string {
    return `${base.replace(/\/+$/, "")}/api/recordings/file/${encodeURIComponent(id)}`
}

function confidenceOf(r: Recording): number {
    const c = r.source?.confidence
    return typeof c === "number" && Number.isFinite(c) ? c : 1
}

/** createdAt in ms from any FirestoreDate shape; unknown → 0. */
export function createdMs(v: unknown): number {
    if (v === null || v === undefined) return 0
    if (typeof v === "number") return v
    if (typeof v === "string") {
        const t = Date.parse(v)
        return Number.isNaN(t) ? 0 : t
    }
    if (v instanceof Date) return v.getTime()
    if (typeof v === "object") {
        const o = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number; _seconds?: number }
        if (typeof o.toMillis === "function") return o.toMillis()
        if (typeof o.toDate === "function") return o.toDate().getTime()
        if (typeof o.seconds === "number") return o.seconds * 1000
        if (typeof o._seconds === "number") return o._seconds * 1000
    }
    return 0
}

/** Best first: featured, then confidence, then newest. Ties keep input order. */
export function compareTakes(a: Recording, b: Recording): number {
    const fa = a.featured === true ? 1 : 0
    const fb = b.featured === true ? 1 : 0
    if (fa !== fb) return fb - fa
    const ca = confidenceOf(a)
    const cb = confidenceOf(b)
    if (ca !== cb) return cb - ca
    return createdMs(b.createdAt) - createdMs(a.createdAt)
}

export function pickFeatured(recs: Recording[]): Recording | null {
    const playable = recs.filter(isPlayable)
    if (playable.length === 0) return null
    return [...playable].sort(compareTakes)[0]
}

export function toFeatured(r: Recording, base = ""): FeaturedRecording {
    return { id: r.id, title: r.title, url: recordingFileUrl(r.id, base) }
}
