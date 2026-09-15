/**
 * Fold a liturgical name to its comparable form.
 *
 * The apostrophe is the whole problem: Daniel writes `Bar’chu` with a curly
 * one, the booklet prints `Bar'chu` with a straight one, and a chart is filed
 * as `Barchu`. All three are the same moment, so every apostrophe variant
 * folds AWAY rather than being normalised to one of them.
 *
 * Its own module because both `./lookup` and `./confirmed` need it and the
 * lookup reads the confirmations — a shared leaf keeps that a line rather
 * than a cycle. `./lookup` re-exports it, which is where it used to live and
 * where the rest of the repo still imports it from.
 */
export function foldLiturgyName(s: string): string {
    return s
        .toLowerCase()
        .replace(/[’'`ʼ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
}
