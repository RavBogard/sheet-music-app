/**
 * Multi-tenant phase 7 — directories whose user-visible strings are NOT YET
 * moved into the catalogue. The untranslated-string scan
 * (no-raw-strings.test.ts) skips files under these entries and fails on a raw
 * string anywhere else. The final state of this list is EMPTY.
 *
 *   "dir/"   the directory and everything under it
 *   "dir/*"  only the files directly in the directory
 *
 * Extraction lanes: when a directory is clean, delete ITS line (and only its
 * line). Entries are one per line with a blank line between them, so lanes
 * deleting different entries never touch adjacent lines and their merges do
 * not conflict. The test also fails on a stale entry (nothing left to
 * migrate under it) so the list cannot outlive the work.
 *
 * Counts are scanner findings (occurrences, not unique strings) and files at
 * the time the list was generated (phase 7 infra, on master 745c1c16).
 */
export const NOT_YET_MIGRATED: readonly string[] = []
