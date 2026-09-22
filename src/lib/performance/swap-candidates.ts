/**
 * The Swap sheet's candidates (David's ask 4). The app OFFERS; it never
 * recommends. Every section is ordered alphabetically by title, then
 * collection, then id — never by use, recency, key or anything else that
 * amounts to a musical suggestion. The planned chart is not a candidate: the
 * sheet lists it first, on its own, as the plan.
 */
import { bareStem } from "@/lib/mcp/title-specificity"
import type { DriveFile } from "@/types/models"

export const SEARCH_CAP = 60

export function candidateTitle(f: Pick<DriveFile, "name" | "displayName">): string {
    return (f.displayName ?? f.name ?? "").trim()
}

export function alphabetical(a: DriveFile, b: DriveFile): number {
    return (
        candidateTitle(a).localeCompare(candidateTitle(b), undefined, { sensitivity: "base" }) ||
        (a.collection ?? "").localeCompare(b.collection ?? "") ||
        a.id.localeCompare(b.id)
    )
}

export interface SwapCandidateInput {
    /** The site's own library (host-scoped, hidden rows already removed). */
    allFiles: DriveFile[]
    plannedFileId: string | null | undefined
    plannedTitle: string
    /** Charts other rows of the same liturgical moment are bonded to. */
    momentFileIds: ReadonlySet<string>
    query: string
}

export interface SwapCandidates {
    moment: DriveFile[]
    stem: DriveFile[]
    search: DriveFile[]
}

export function swapCandidates(input: SwapCandidateInput): SwapCandidates {
    const pool = input.allFiles.filter((f) => f.id && f.id !== input.plannedFileId)
    const moment = pool.filter((f) => input.momentFileIds.has(f.id)).sort(alphabetical)
    const shown = new Set(moment.map((f) => f.id))
    const stem = bareStem(input.plannedTitle)
    const sameStem = stem
        ? pool.filter((f) => !shown.has(f.id) && bareStem(candidateTitle(f)) === stem).sort(alphabetical)
        : []
    const q = input.query.trim().toLowerCase()
    const search = q
        ? pool
              .filter((f) => candidateTitle(f).toLowerCase().includes(q))
              .sort(alphabetical)
              .slice(0, SEARCH_CAP)
        : []
    return { moment, stem: sameStem, search }
}
