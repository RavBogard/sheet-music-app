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
export const NOT_YET_MIGRATED: readonly string[] = [
    "src/app/(main)/accessibility/*", // 30 strings, 1 files

    "src/app/(main)/changelog/*", // 1 strings, 1 files

    "src/app/(main)/library/*", // 5 strings, 1 files

    "src/app/(main)/manage/", // 115 strings, 4 files

    "src/app/(main)/privacy/*", // 66 strings, 1 files

    "src/app/(main)/setlists/", // 4 strings, 1 files

    "src/app/(main)/sms-consent/*", // 79 strings, 1 files

    "src/app/(main)/terms/*", // 58 strings, 1 files

    "src/app/api/admin/", // 4 strings, 3 files

    "src/app/api/ai/", // 5 strings, 4 files

    "src/app/api/auth/", // 23 strings, 5 files

    "src/app/api/charts/", // 3 strings, 2 files

    "src/app/api/intake/", // 3 strings, 1 files

    "src/app/api/library/", // 15 strings, 5 files

    "src/app/api/nudge-admin/*", // 1 strings, 1 files

    "src/app/api/push/", // 2 strings, 1 files

    "src/app/api/recordings/", // 13 strings, 2 files

    "src/app/api/scheduling/", // 11 strings, 5 files

    "src/app/api/setlist/", // 23 strings, 9 files

    "src/app/api/setlists/", // 15 strings, 6 files

    "src/app/api/tenant/", // 1 strings, 1 files

    "src/components/admin/*", // 136 strings, 6 files

    "src/components/admin/library/*", // 15 strings, 1 files

    "src/components/admin/people/*", // 4 strings, 1 files

    "src/components/legal/*", // 174 strings, 1 files

    "src/components/library/*", // 205 strings, 11 files

    "src/components/setlist/*", // 177 strings, 11 files

    "src/components/setlist/grid/", // 120 strings, 23 files

    "src/components/setlist/importer/*", // 75 strings, 1 files

    "src/components/setlist/modals/*", // 34 strings, 4 files

    "src/components/setlist/wizard/*", // 18 strings, 1 files

    "src/lib/*", // 5 strings, 2 files
]
