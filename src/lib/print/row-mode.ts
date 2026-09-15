/**
 * `rows` — which rows a printed document carries.
 *
 * Daniel, 2026-09-15 (BIND-NOT-ADD addendum 2): print and the gig packet must
 * offer "just music", "full", or both. The two audiences want opposite
 * documents from the same setlist. The band wants the pieces it plays; putting
 * twenty spoken liturgy rows on a music stand is noise between charts. The
 * rabbi wants the whole order of the service, pages and all, and a sheet that
 * silently dropped every unsung moment would be useless on the shtender.
 *
 * So the defaults differ, deliberately: `generate_gig_packet` is `music`,
 * `generate_service_sheet` is `full`. Neither is a restriction on what can be
 * printed — the other mode is one argument away, and `both` prints one
 * document containing each in turn.
 *
 * NO ROW IS EVER HIDDEN FROM ANYONE. This is a choice about a printout, made
 * per call by whoever is printing. Ruling 2 as reinterpreted is emphatic that
 * the setlist itself shows everything to everyone.
 */

export type PrintRowMode = "music" | "full" | "both"

export const PRINT_ROW_MODES: readonly PrintRowMode[] = ["music", "full", "both"]

export function isPrintRowMode(v: unknown): v is PrintRowMode {
    return typeof v === "string" && (PRINT_ROW_MODES as readonly string[]).includes(v)
}

export interface PrintableRow {
    type?: string | null
    fileId?: string | null
}

/**
 * Is this a MUSIC row?
 *
 * A row with a chart bound to it, or a row typed `song`. The second half
 * matters: a song the band knows by heart has no chart and is still the band's
 * row, and dropping it would leave a hole in the middle of the set.
 */
export function isMusicRow(row: PrintableRow): boolean {
    if (typeof row.fileId === "string" && row.fileId.length > 0) return true
    return row.type === "song"
}

/**
 * The rows one SECTION of a printed document carries.
 *
 * `both` is two sections, so it is not a filter — ask for each section in
 * turn with `music` and `full`.
 */
export function rowsForSection<T extends PrintableRow>(
    rows: T[],
    section: "music" | "full",
): T[] {
    return section === "full" ? rows : rows.filter(isMusicRow)
}

/** The sections a mode produces, in the order they print. */
export function sectionsFor(mode: PrintRowMode): Array<"music" | "full"> {
    if (mode === "both") return ["full", "music"]
    return [mode]
}
