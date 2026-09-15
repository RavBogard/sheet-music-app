import type { SetlistTrack } from "@/types/models"

/**
 * Which Perform rows fold away, and into which runs.
 *
 * Pure, and separate from the component, because the rule about WHAT folds is
 * the part that must not drift: a row with a chart bonded to it is a row the
 * band plays from, and folding one of those away would hide a chart behind a
 * divider on a music stand mid-service. That is the failure this file exists
 * to make impossible to reintroduce by accident.
 */

/**
 * A row the band never plays from: marked fixed by a template, and carrying no
 * chart.
 *
 * `fixed` alone is not enough. The Always merge puts `fixed: true` on rows the
 * template already carried as song slots, chart and all — Bar'chu on the
 * Friday template is `fixed` AND bonded — and those are exactly the rows a
 * musician taps. A header is not folded either: a header is the sign that says
 * where you are, and folding the signs away would make the folded list harder
 * to read than the unfolded one.
 */
export function isFoldableLiturgyRow(track: SetlistTrack): boolean {
    const type = track.type as string | undefined
    if (type === "header" || type === "section") return false
    if (!track.fixed) return false
    return !track.fileId
}

export interface LiturgyRun {
    /** Index in `tracks` of the first folded row. */
    start: number
    /** Indices of every row in the run, ascending and contiguous. */
    indexes: number[]
}

/** Consecutive foldable rows, grouped. Rows that do not fold are not listed. */
export function liturgyRuns(tracks: readonly SetlistTrack[]): LiturgyRun[] {
    const runs: LiturgyRun[] = []
    let current: LiturgyRun | null = null
    tracks.forEach((track, i) => {
        if (isFoldableLiturgyRow(track)) {
            if (current) current.indexes.push(i)
            else current = { start: i, indexes: [i] }
            return
        }
        if (current) {
            runs.push(current)
            current = null
        }
    })
    if (current) runs.push(current)
    return runs
}

/** The printed pages a run spans, ascending and de-duplicated. */
export function runFolios(
    tracks: readonly SetlistTrack[],
    run: LiturgyRun,
): number[] {
    const seen = new Set<number>()
    for (const i of run.indexes) {
        const folio = tracks[i]?.liturgyRef?.folio
        if (typeof folio === "number") seen.add(folio)
    }
    return [...seen].sort((a, b) => a - b)
}
