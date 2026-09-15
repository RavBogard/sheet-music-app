import { bareStem } from "@/lib/mcp/title-specificity"
import { momentIdForUnit } from "@/lib/books/moments"
import { historyInstant } from "./types"
import type { Chapter, Diff, DiffRow, HistoryRow, MatchBasis, RowStatus } from "./types"

/**
 * Reconcile a planned setlist against Overlays' cue log.
 *
 * WHY THIS IS NOT A RED/GREEN DIFF. At CRC most of what the band plays produces
 * no graphic at all — band-only songs, headers, whole stretches of a machzor
 * nobody has cued yet. A naive diff paints an ordinary Shabbat morning red and
 * teaches everyone to ignore it. So the engine is deliberately cautious about
 * the word "skipped":
 *
 *   A row is `skipped` ONLY when a cue could plausibly have fired for it (it
 *   carries a `liturgyRef`) AND the service demonstrably passed through that
 *   stretch — there is a performed row before it and a performed row after it.
 *   Everything else it cannot speak to is `untracked`, which is a statement
 *   about the cue log, not about the service.
 *
 * Headers and notes never produce a graphic, so they are never `skipped`; like
 * band-only songs they INHERIT `performed` when bracketed by performed
 * neighbours, because the service plainly went through them.
 */

/** A planned row, as the reconcile needs to see it. */
export interface PlannedRow {
    trackId: string
    title: string
    type?: string | null
    liturgyRef?: { book: string; unitId?: string; folio: number } | null
    /**
     * The row's stored moment, written at bind time. Preferred over deriving
     * one from the unit id: a row bound before the moments artifact covered
     * its book still carries the unit, and a row whose book has since changed
     * still carries the moment.
     */
    momentId?: string | null
}

const NO_GRAPHIC_TYPES = new Set(["header", "note"])

function emptyCounts(): Record<RowStatus, number> {
    return { performed: 0, skipped: 0, added: 0, reordered: 0, untracked: 0 }
}

/** A history row with nothing to match on at all — a custom names panel. */
function hasIdentity(r: HistoryRow): boolean {
    return !!(r.unitId || r.momentId || (r.book && Number.isInteger(r.folio)))
}

/** The moment a planned row is about, when anything says so. */
function plannedMoment(row: PlannedRow): string | null {
    return row.momentId ?? momentIdForUnit(row.liturgyRef?.unitId ?? null)
}

/** The moment a history row is about, directly or via its unit. */
function historyMoment(r: HistoryRow): string | null {
    return r.momentId ?? momentIdForUnit(r.unitId ?? null)
}

/**
 * Pick the planned row a cue belongs to, from those still unmatched.
 *
 * Order of evidence, strongest first:
 *   1. `momentId` — book-independent, and the only basis that survives a change
 *      of book.
 *   2. `liturgyRef` — same book AND same printed page. Several planned rows can
 *      share a page (on RH Day 2, the "Awakening" header, Modeh Ani and Mah
 *      Tovu are all p.39), so a header or note never wins this tie: those are
 *      structure, not the thing a cue is about.
 *   3. title fold — only when the cue carries a label at all, through the same
 *      `bareStem` the chart-bond matcher uses.
 */
function pickPlanned(
    rows: PlannedRow[],
    taken: Set<number>,
    cue: HistoryRow,
): { index: number; basis: MatchBasis } | null {
    const cueMoment = historyMoment(cue)
    if (cueMoment) {
        for (let i = 0; i < rows.length; i++) {
            if (taken.has(i)) continue
            if (plannedMoment(rows[i]) === cueMoment) return { index: i, basis: "momentId" }
        }
    }

    if (cue.book && Number.isInteger(cue.folio)) {
        const candidates: number[] = []
        for (let i = 0; i < rows.length; i++) {
            if (taken.has(i)) continue
            const ref = rows[i].liturgyRef
            if (ref && ref.book === cue.book && ref.folio === cue.folio) candidates.push(i)
        }
        const substantive = candidates.filter(
            (i) => !NO_GRAPHIC_TYPES.has(rows[i].type ?? "song"),
        )
        const pick = (substantive.length ? substantive : candidates)[0]
        if (pick !== undefined) return { index: pick, basis: "liturgyRef" }
    }

    const label = cue.title?.trim()
    if (label) {
        const stem = bareStem(label)
        if (stem) {
            for (let i = 0; i < rows.length; i++) {
                if (taken.has(i)) continue
                if (bareStem(rows[i].title) === stem) return { index: i, basis: "title" }
            }
        }
    }

    return null
}

/** A title for a cue that matched no planned row. */
function addedTitle(cue: HistoryRow): string {
    return (
        cue.title?.trim() ||
        cue.momentId ||
        cue.unitId?.split("@")[0]?.split(".").pop()?.replace(/-/g, " ") ||
        (cue.book && Number.isInteger(cue.folio) ? `${cue.book} p.${cue.folio}` : "Untitled cue")
    )
}

export function reconcile(
    setlistId: string,
    planned: PlannedRow[],
    history: HistoryRow[],
): Diff {
    const cues = [...history].sort((a, b) => a.seq - b.seq)
    const usable = cues.filter(hasIdentity)

    const taken = new Set<number>()
    /** plannedIndex → the cue that matched it. */
    const matched = new Map<number, { cue: HistoryRow; basis: MatchBasis }>()
    const added: HistoryRow[] = []

    for (const cue of usable) {
        const hit = pickPlanned(planned, taken, cue)
        if (!hit) {
            added.push(cue)
            continue
        }
        taken.add(hit.index)
        matched.set(hit.index, { cue, basis: hit.basis })
    }

    // `reordered` compares each matched row's RANK in the plan against its rank
    // in the cue log. A swap moves two rows, so both are flagged — a running
    // high-water mark would blame only whichever one happened to come second,
    // which reads as an accusation rather than a description.
    const matchedIndexes = [...matched.keys()].sort((a, b) => a - b)
    const bySeq = [...matchedIndexes].sort(
        (a, b) => matched.get(a)!.cue.seq - matched.get(b)!.cue.seq,
    )
    const seqRank = new Map(bySeq.map((idx, rank) => [idx, rank]))
    const reordered = new Set<number>()
    matchedIndexes.forEach((idx, planRank) => {
        if (seqRank.get(idx) !== planRank) reordered.add(idx)
    })

    const firstMatched = matchedIndexes[0]
    const lastMatched = matchedIndexes[matchedIndexes.length - 1]
    const isBracketed = (i: number) =>
        firstMatched !== undefined && i > firstMatched && i < lastMatched

    const rows: DiffRow[] = []
    const counts = emptyCounts()

    planned.forEach((row, i) => {
        const hit = matched.get(i)
        const base: DiffRow = {
            status: "untracked",
            plannedPosition: i,
            trackId: row.trackId,
            title: row.title,
            type: row.type ?? undefined,
            liturgyRef: row.liturgyRef ?? null,
            basis: "none",
        }

        if (hit) {
            base.status = reordered.has(i) ? "reordered" : "performed"
            base.basis = hit.basis
            base.performedAt = historyInstant(hit.cue.at) ?? undefined
            base.seq = hit.cue.seq
            if (base.status === "reordered") {
                base.note = "Fired out of the planned sequence."
            }
        } else if (NO_GRAPHIC_TYPES.has(row.type ?? "song")) {
            // Structure. Never "skipped" — a header does not fire.
            if (isBracketed(i)) {
                base.status = "performed"
                base.basis = "bracketed"
                base.note = "No cue of its own; the service ran through it."
            } else {
                base.note = "Structure — produces no graphic."
            }
        } else if (row.liturgyRef) {
            if (isBracketed(i)) {
                base.status = "skipped"
                base.note =
                    "Has a page, and the service ran past it without a cue firing."
            } else {
                base.note = "Has a page, but no cue fired anywhere near it."
            }
        } else if (isBracketed(i)) {
            // A band-only song: no page, no graphic, but the service went
            // through this stretch. Common case at CRC — say so rather than
            // showing red.
            base.status = "performed"
            base.basis = "bracketed"
            base.note = "Band-only — no graphic; the service ran through it."
        } else {
            base.note = "Band-only — no graphic, and no cue nearby."
        }

        counts[base.status] += 1
        rows.push(base)
    })

    // Splice added cues in at the position their seq implies: after the last
    // planned row that fired before them.
    for (const cue of added) {
        let insertAfter = -1
        for (const i of matchedIndexes) {
            if (matched.get(i)!.cue.seq < cue.seq) insertAfter = i
        }
        const proposed: DiffRow = {
            status: "added",
            title: addedTitle(cue),
            type: "prayer",
            liturgyRef:
                cue.book && Number.isInteger(cue.folio)
                    ? {
                          book: cue.book,
                          ...(cue.unitId ? { unitId: cue.unitId } : {}),
                          folio: cue.folio as number,
                      }
                    : null,
            performedAt: historyInstant(cue.at) ?? undefined,
            seq: cue.seq,
            basis: "none",
            note: "Audible — fired with no planned row.",
        }
        counts.added += 1
        const at = rows.findIndex((r) => r.plannedPosition === insertAfter)
        if (at === -1) rows.unshift(proposed)
        else rows.splice(at + 1, 0, proposed)
    }

    return {
        setlistId,
        rows,
        counts,
        ignoredRows: cues.length - usable.length,
        historyRows: cues.length,
    }
}

/**
 * Chapter lines for a recording description, relative to the first cue.
 *
 * `offsetSeconds` shifts the origin — the stream almost always starts before
 * the first cue fires, and Daniel pastes the result into the recording, so the
 * number has to be adjustable by hand rather than guessed here.
 */
export function chapters(diff: Diff, offsetSeconds = 0): Chapter[] {
    const fired = diff.rows.filter((r) => r.performedAt && typeof r.seq === "number")
    if (fired.length === 0) return []
    const origin = Math.min(...fired.map((r) => Date.parse(r.performedAt!)))

    return fired
        .slice()
        .sort((a, b) => a.seq! - b.seq!)
        .map((r) => {
            const seconds = Math.max(
                0,
                Math.round((Date.parse(r.performedAt!) - origin) / 1000) + offsetSeconds,
            )
            return { offsetSeconds: seconds, label: r.title, line: `${clock(seconds)}  ${r.title}` }
        })
}

function clock(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    const pad = (n: number) => String(n).padStart(2, "0")
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
