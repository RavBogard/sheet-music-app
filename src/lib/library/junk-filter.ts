/**
 * Pure (firebase-admin-free) library-row junk classification — the SINGLE
 * source of truth shared by:
 *  - the MCP read tools (list_library / search_library / reconcile_library,
 *    via `isNonChartArtifactShape`), and
 *  - the browser surfaces (consumer library browse via `getServerLibrary`,
 *    and the chart-bind picker `ChartBindPopover`).
 *
 * Kept dependency-light (only a pure regex import) so it bundles cleanly into
 * CLIENT components — the prior home, `@/lib/mcp/tools/library.ts`, pulls
 * `firebase-admin`, so importing the predicate from there into a client
 * component would break the client/server bundle boundary.
 *
 * v11.5-04-02 (library hygiene).
 */
import { TEST_UID_PREFIXES } from "@/lib/test-isolation"

/**
 * "Is this row a non-chart artifact (i.e. not chart bytes)?" — moved verbatim
 * from `@/lib/mcp/tools/library.ts` so the browser surfaces and the MCP tools
 * agree on the definition. Output MUST stay byte-identical to the prior
 * definition; list_library / search_library / reconcile_library depend on it.
 *
 * Accepts a loose shape so callers can pass either a LibraryIndexEntry
 * (mimeType + name both present) or a partial-join record (name only) and the
 * predicate degrades gracefully.
 */
export function isNonChartArtifactShape(rec: {
    mimeType?: string | null
    name?: string | null
}): boolean {
    const mime = (rec.mimeType ?? "").toLowerCase()
    if (mime) {
        if (mime.startsWith("audio/")) return true
        if (mime.startsWith("application/vnd.google-apps.")) return true
        if (
            mime ===
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            mime ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
            return true
        }
        if (mime === "application/octet-stream") return true
        if (mime.includes("folder")) return true
    }
    const name = rec.name ?? ""
    if (name.startsWith(".")) return true
    // Filename-extension backstop for the search_library path where mimeType
    // isn't always joined (and for songs/* rows whose Drive sync dropped the
    // mime). Covers the cowork-observed cases (.mp3, .xlsx) plus close cousins.
    const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
    if (ext) {
        if (
            ext === "mp3" ||
            ext === "m4a" ||
            ext === "wav" ||
            ext === "aac" ||
            ext === "flac" ||
            ext === "ogg" ||
            ext === "xlsx" ||
            ext === "xls" ||
            ext === "docx" ||
            ext === "doc"
        ) {
            return true
        }
    }
    return false
}

/** library_index `status` values that are non-displayable cruft (not real charts). */
const JUNK_STATUSES = new Set(["orphaned", "duplicate", "archived"])

/**
 * Should this library row be HIDDEN from consumer-facing surfaces (browse +
 * bind picker)? A superset of `isNonChartArtifactShape` that also hides:
 *  - reconcile cruft: `status ∈ {orphaned, duplicate, archived}`
 *  - test-uid-owned rows: `uploadedBy` matching the unforgeable
 *    `TEST_UID_PREFIXES` shape (the real signal for the `[role-*] tiny`
 *    cowork seeds — their name pattern is only a convention).
 *
 * Every field is optional and a missing field simply does not trip its clause,
 * so callers with partial records degrade gracefully. NOTE: the Dexie songs
 * mirror that feeds the bind picker lacks `uploadedBy`, so on that surface the
 * test-uid clause is inert (those rows are eliminated by deletion, not filter);
 * `getServerLibrary` reads the raw doc and DOES carry `uploadedBy`.
 *
 * Never hides a real active chart: PDF / MusicXML / plain-text mimes are not
 * artifacts, `active` is not a junk status, and a normal `uploadedBy` is not a
 * test uid.
 */
export function isJunkLibraryRow(row: {
    name?: string | null
    mimeType?: string | null
    status?: string | null
    uploadedBy?: string | null
}): boolean {
    if (isNonChartArtifactShape(row)) return true
    if (row.status && JUNK_STATUSES.has(row.status)) return true
    if (row.uploadedBy && TEST_UID_PREFIXES.test(row.uploadedBy)) return true
    return false
}
