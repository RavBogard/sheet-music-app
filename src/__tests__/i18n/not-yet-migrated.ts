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
    "src/app/(main)/*", // 18 strings, 2 files

    "src/app/(main)/accessibility/*", // 30 strings, 1 files

    "src/app/(main)/changelog/*", // 1 strings, 1 files

    "src/app/(main)/library/*", // 5 strings, 1 files

    "src/app/(main)/manage/", // 115 strings, 4 files

    "src/app/(main)/monitor/", // 12 strings, 3 files

    "src/app/(main)/privacy/*", // 66 strings, 1 files

    "src/app/(main)/schedule/*", // 13 strings, 1 files

    "src/app/(main)/setlists/", // 4 strings, 1 files

    "src/app/(main)/settings/*", // 30 strings, 1 files

    "src/app/(main)/sms-consent/*", // 79 strings, 1 files

    "src/app/(main)/terms/*", // 58 strings, 1 files

    "src/app/(v2)/v2/*", // 10 strings, 1 files

    "src/app/*", // 8 strings, 3 files

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

    "src/app/auth-error/*", // 4 strings, 1 files

    "src/app/invite/[token]/*", // 13 strings, 1 files

    "src/app/login/*", // 23 strings, 2 files

    "src/app/perform/[fileId]/*", // 8 strings, 1 files

    "src/app/perform/*", // 4 strings, 1 files

    "src/app/perform/setlist/", // 25 strings, 2 files

    "src/app/qr/[code]/*", // 18 strings, 1 files

    "src/app/test-login/*", // 3 strings, 1 files

    "src/components/*", // 11 strings, 2 files

    "src/components/admin/*", // 136 strings, 6 files

    "src/components/admin/library/*", // 15 strings, 1 files

    "src/components/admin/people/*", // 4 strings, 1 files

    "src/components/audio/*", // 7 strings, 1 files

    "src/components/auth/*", // 7 strings, 1 files

    "src/components/calendar/*", // 9 strings, 3 files

    "src/components/dashboard/*", // 41 strings, 7 files

    "src/components/home/*", // 10 strings, 1 files

    "src/components/legal/*", // 174 strings, 1 files

    "src/components/library/*", // 205 strings, 11 files

    "src/components/monitor/*", // 71 strings, 8 files

    "src/components/music/*", // 87 strings, 10 files

    "src/components/nav/*", // 38 strings, 6 files

    "src/components/offline/*", // 4 strings, 1 files

    "src/components/people/*", // 5 strings, 1 files

    "src/components/performance/*", // 138 strings, 22 files

    "src/components/scheduling/*", // 12 strings, 1 files

    "src/components/setlist/*", // 177 strings, 11 files

    "src/components/setlist/grid/", // 120 strings, 23 files

    "src/components/setlist/importer/*", // 75 strings, 1 files

    "src/components/setlist/modals/*", // 34 strings, 4 files

    "src/components/setlist/wizard/*", // 18 strings, 1 files

    "src/components/settings/*", // 57 strings, 3 files

    "src/components/ui/*", // 14 strings, 6 files

    "src/components/v2/*", // 9 strings, 2 files

    "src/hooks/*", // 46 strings, 7 files

    "src/lib/*", // 5 strings, 2 files
]
