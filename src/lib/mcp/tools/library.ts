import { getAllSongs, getSongById, type SongRecord } from "@/lib/mcp/server-songs"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { bareStem } from "@/lib/mcp/title-specificity"

/**
 * Shared "is this row a chart-bytes artifact?" predicate. Used by both
 * list_library (to hide non-charts from the default browse) and
 * search_library (cycle-1 F-007/F-024 — agent searches were returning
 * `.mp3`, `.xlsx`, and `.DS_Store` rows alongside real charts).
 *
 * Accepts a loose shape so callers can pass either a LibraryIndexEntry
 * (mimeType + name both present) or a partial-join SongRecord (name only,
 * via fileName) and the predicate degrades gracefully.
 */
function isNonChartArtifactShape(rec: {
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
    // Filename-extension backstop for the search_library path where
    // mimeType isn't always joined (and for songs/* rows whose Drive sync
    // dropped the mime). Covers the cowork-observed cases (.mp3, .xlsx)
    // plus close cousins.
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

/**
 * MCP read tools for the song library. Plain async functions wrapping the
 * Admin-SDK songs reader. `uid` is threaded for a consistent contract with the
 * write tools to come; library reads are not user-scoped today.
 */

export interface SearchLibraryArgs {
    query: string
    key?: string
    bpmMin?: number
    bpmMax?: number
    limit?: number
    /** If true, include rows with `status: 'orphaned'`. Default false. L-001. */
    includeOrphaned?: boolean
    /**
     * If true, include non-chart artifacts (audio, spreadsheets, folders,
     * dotfiles) that list_library also hides by default. Cycle-1 F-007 /
     * F-024 — cowork agents were seeing `.mp3`, `.xlsx`, and `.DS_Store`
     * rows in search results. Default false.
     */
    includeNonCharts?: boolean
    /**
     * Context key for hint lookup — typically a setlist's templateType
     * (e.g. "friday-evening", "shabbat-morning"). When supplied, the
     * tool consults titleContextHints and surfaces the rabbi-preferred
     * entry for each (stem, contextKey) at result position 0 with a
     * +0.5 ranking boost. W-02 learning-loop output.
     */
    contextKey?: string
}

/**
 * Subset of library_index fields surfaced via the W-02 join in
 * search_library / list_library. Single source of truth for the
 * trust-calibration data; songs/{id} does NOT denormalize these.
 */
interface LibraryW02Fields {
    stem?: string
    titleSpecificity?: number
    siblingsInCatalog?: number
    composer?: string
    arranger?: string
    notationSource?: string
    lastUsedInSetlist?: { setlistId: string; eventDate: string }
    bondCorrectionHistory?: {
        correctedTo: number
        correctedAwayFrom: number
        lastCorrectionAt?: string
    }
    /** Cycle-1 F-007/F-024: surfaced so search_library can filter out
     *  non-chart artifacts (audio, spreadsheets, folders) via the same
     *  predicate list_library already uses. */
    mimeType?: string
    /** Cycle-1 F-007: surfaced so the dotfile / extension backstop in
     *  isNonChartArtifactShape can match against the library_index name
     *  when the songs/{id} title was cleaned (extension stripped). */
    name?: string
}

/**
 * Bulk-read library_index W-02 fields keyed by fileId. Used by
 * searchLibrary to join with the songs catalog. Per-row siblingsInCatalog
 * is computed post-fetch from the stem distribution rather than stored,
 * so adding/removing siblings post-upload doesn't require write churn
 * — the count stays accurate at read time as long as orphans are
 * filtered the same way.
 */
async function loadLibraryW02Map(): Promise<Map<string, LibraryW02Fields>> {
    try {
        initAdmin()
        const db = getFirestore()
        const snap = await db.collection("library_index").get()
        const map = new Map<string, LibraryW02Fields>()
        const stemCounts = new Map<string, number>()
        // First pass — count siblings per stem (excluding orphans).
        for (const d of snap.docs) {
            const data = d.data()
            if (data.status === "orphaned") continue
            const stem = typeof data.stem === "string" ? data.stem : undefined
            if (!stem) continue
            stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1)
        }
        // Second pass — attach W-02 fields + computed siblingsInCatalog.
        for (const d of snap.docs) {
            const data = d.data()
            const stem = typeof data.stem === "string" ? data.stem : undefined
            const siblingsInCatalog = stem
                ? stemCounts.get(stem)
                : undefined
            const bch = data.bondCorrectionHistory as
                | Record<string, unknown>
                | undefined
            map.set(d.id, {
                stem,
                titleSpecificity:
                    typeof data.titleSpecificity === "number"
                        ? data.titleSpecificity
                        : undefined,
                siblingsInCatalog,
                composer: typeof data.composer === "string" ? data.composer : undefined,
                arranger: typeof data.arranger === "string" ? data.arranger : undefined,
                notationSource:
                    typeof data.notationSource === "string"
                        ? data.notationSource
                        : undefined,
                lastUsedInSetlist:
                    data.lastUsedInSetlist &&
                    typeof data.lastUsedInSetlist === "object"
                        ? (data.lastUsedInSetlist as {
                              setlistId: string
                              eventDate: string
                          })
                        : undefined,
                bondCorrectionHistory: bch
                    ? {
                          correctedTo:
                              typeof bch.correctedTo === "number"
                                  ? bch.correctedTo
                                  : 0,
                          correctedAwayFrom:
                              typeof bch.correctedAwayFrom === "number"
                                  ? bch.correctedAwayFrom
                                  : 0,
                          lastCorrectionAt:
                              typeof bch.lastCorrectionAt === "string"
                                  ? bch.lastCorrectionAt
                                  : undefined,
                      }
                    : undefined,
                mimeType:
                    typeof data.mimeType === "string" ? data.mimeType : undefined,
                name: typeof data.name === "string" ? data.name : undefined,
            })
        }
        return map
    } catch (err) {
        logger.warn("[mcp] library_index join read failed (W-02 fields will be undefined):", err)
        return new Map()
    }
}

/**
 * Look up the rabbi-preferred fileId for a (normalized-stem, contextKey)
 * pair. Returns undefined if no hint exists or the hint hasn't reached
 * the 3-pick threshold yet. Reads from titleContextHints; written by the
 * aggregateContextHints Cloud Function.
 */
async function loadContextHint(
    stem: string,
    contextKey: string,
): Promise<string | undefined> {
    try {
        initAdmin()
        const db = getFirestore()
        const hintId = `${stem}_${contextKey}`
        const doc = await db.collection("titleContextHints").doc(hintId).get()
        if (!doc.exists) return undefined
        const data = doc.data() ?? {}
        const picks = typeof data.picks === "number" ? data.picks : 0
        if (picks < 3) return undefined
        return typeof data.preferredFileId === "string"
            ? data.preferredFileId
            : undefined
    } catch (err) {
        logger.warn("[mcp] context-hint lookup failed:", err)
        return undefined
    }
}

const RANK_BIAS_PER_CORRECTION = 0.05
const RANK_BIAS_CLAMP = 0.25
const CONTEXT_HINT_BOOST = 0.5

function rankBias(record: SongRecord): number {
    const bch = record.bondCorrectionHistory
    if (!bch) return 0
    const raw = (bch.correctedTo - bch.correctedAwayFrom) * RANK_BIAS_PER_CORRECTION
    return Math.min(RANK_BIAS_CLAMP, Math.max(-RANK_BIAS_CLAMP, raw))
}

/**
 * Compare two SongRecords for W-02 ranking. Higher rank wins position 0.
 * Tie-break: lastUsedInSetlist.eventDate desc, then title asc.
 */
function compareRanked(
    a: SongRecord & { _rank: number },
    b: SongRecord & { _rank: number },
): number {
    if (a._rank !== b._rank) return b._rank - a._rank
    const aDate = a.lastUsedInSetlist?.eventDate ?? ""
    const bDate = b.lastUsedInSetlist?.eventDate ?? ""
    if (aDate !== bDate) return bDate.localeCompare(aDate)
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
}

/**
 * Tokenizer normalization (L-003 from the 2026-05-16 Bar Mitzvah session):
 *  - lowercase
 *  - fold diacritics (so "Shabb`at" matches "Shabbat")
 *  - collapse runs of [_\s\-] to a single space
 * Matches both the indexed title and the query so an underscore-spaced
 * filename like "Shalom_rav" surfaces for query "Shalom Rav" / "shalom-rav".
 * Kept as a separate normalization from `normalizedName` (which strips all
 * non-alphanumerics for the dedup prefix-range query) — substring matching
 * works better when we preserve token boundaries.
 */
function normalizeForSearch(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[_\s\-]+/g, " ")
        .trim()
}

export async function searchLibrary(
    _uid: string,
    args: SearchLibraryArgs,
): Promise<SongRecord[]> {
    const [all, w02Map] = await Promise.all([getAllSongs(), loadLibraryW02Map()])
    const q = normalizeForSearch(args.query)
    const key = args.key?.trim().toLowerCase()
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 50) : 20

    // Filter pass — same predicate as before, then join W-02 fields.
    const matches: SongRecord[] = all
        .filter((s) => {
            if (s.status === "archived") return false
            // Cycle-1 F-019: `duplicate` is the status applied by the
            // dedupe_library_index pass to losing rows of a dupe group.
            // Always hidden from search — operators audit dupes via the
            // dedupe report or list_library, not search.
            if (s.status === "duplicate") return false
            if (!args.includeOrphaned && s.status === "orphaned") return false
            if (q && !normalizeForSearch(s.title).includes(q)) return false
            if (key && s.key?.toLowerCase() !== key) return false
            if (args.bpmMin !== undefined && (s.bpm === undefined || s.bpm < args.bpmMin)) {
                return false
            }
            if (args.bpmMax !== undefined && (s.bpm === undefined || s.bpm > args.bpmMax)) {
                return false
            }
            return true
        })
        .map((s) => {
            const w02 = w02Map.get(s.id)
            return w02 ? { ...s, ...w02 } : s
        })
        // Cycle-1 F-007/F-024: hide non-chart artifacts by default.
        // mimeType comes from the W-02 join when library_index has it;
        // the filename-extension / dotfile backstop in isNonChartArtifactShape
        // catches songs/* rows that lack a joined library_index entry.
        .filter((s) => {
            if (args.includeNonCharts) return true
            const merged = s as SongRecord & {
                mimeType?: string
                name?: string
            }
            const shape = {
                mimeType: merged.mimeType,
                // Prefer the library_index `name` (raw filename) when joined;
                // fall back to `fileName` (toSongRecord copies data.title here
                // verbatim, extension included); finally fall back to `title`.
                name: merged.name ?? s.fileName ?? s.title,
            }
            return !isNonChartArtifactShape(shape)
        })

    // Rank with bondCorrectionHistory bias + contextHint boost. Hint
    // lookup happens once per query (only if contextKey supplied and at
    // least one result has a stem) — keeps the read cost bounded.
    let preferredFileId: string | undefined
    if (args.contextKey) {
        // Derive the candidate stem from the query itself; falls back to
        // the first match's stem if the query doesn't normalize to a
        // catalog stem cleanly.
        const queryStem = bareStem(args.query)
        const stemForHint = queryStem || matches[0]?.stem
        if (stemForHint) {
            preferredFileId = await loadContextHint(stemForHint, args.contextKey)
        }
    }

    const ranked = matches.map((r) => ({
        ...r,
        _rank:
            rankBias(r) + (preferredFileId === r.id ? CONTEXT_HINT_BOOST : 0),
    }))
    ranked.sort(compareRanked)
    // Strip internal _rank AND the join-only classification fields
    // (`mimeType` / `name` come from the W-02 join purely so the
    // F-007/F-024 filter step above can run isNonChartArtifactShape;
    // they are NOT part of the SongRecord wire contract).
    return ranked.slice(0, limit).map((r) => {
        const merged = r as SongRecord & {
            _rank: number
            mimeType?: string
            name?: string
        }
        const {
            _rank: _r,
            mimeType: _m,
            name: _n,
            ...rest
        } = merged
        void _r
        void _m
        void _n
        return rest as SongRecord
    })
}

export interface GetSongArgs {
    id: string
}

export async function getSong(
    _uid: string,
    args: GetSongArgs,
): Promise<SongRecord | null> {
    return getSongById(args.id)
}

/* ─────────────────────────────────────────────────────────────────────────
 * list_library — browse the chart-file index (CF2-D)
 *
 * search_library covers targeted lookup ("find me Oseh Shalom"); browsing the
 * full catalog ("show me every core chart") was awkward without this. Reads
 * directly from `library_index`, which is the authoritative file-side store
 * (mimeType, collection, fileSize, uploadedAt) — `songs/{id}` only carries
 * the catalog-side metadata and doesn't know about the file shape.
 *
 * Default sort: alphabetical by name. A future `sort: 'newest'` extension is
 * straightforward, but Daniel's browse use case is "look at my catalog" —
 * alphabetical is the natural reading order.
 *
 * No role gate — same posture as `search_library`. Chart metadata is not
 * sensitive per [[feedback_chart_access_policy]].
 * ───────────────────────────────────────────────────────────────────────── */

export const LIST_LIBRARY_MAX_LIMIT = 200
export const LIST_LIBRARY_DEFAULT_LIMIT = 50

export interface ListLibraryArgs {
    collection?: "core" | "supplemental" | "uploads"
    limit?: number
    offset?: number
    includeNonCharts?: boolean
}

/**
 * Default browse hides rows that the in-app /library catalog also hides.
 * Negative-set definition (anything matching is NOT a chart):
 *  - Drive folders / shortcuts / native Workspace types (Docs, Sheets,
 *    Slides, Drawings, Forms, Sites) — none are bondable charts.
 *  - Office spreadsheet / wordprocessing types (.xlsx, .docx).
 *  - audio files (live under the separate "audio" tab).
 *  - octet-stream (unknown binary; never a renderable chart).
 *  - macOS junk like `.DS_Store` that leaked in via Drive sync.
 *
 * Pass `includeNonCharts: true` to see the raw library_index (e.g. for
 * an audit). Applied to BOTH the default browse and collection-filtered
 * queries — v3 NOTE-4 + v4 V4-NOTE-1.
 */
function isNonChartArtifact(e: LibraryIndexEntry): boolean {
    return isNonChartArtifactShape({ mimeType: e.mimeType, name: e.name })
}

export interface LibraryIndexEntry {
    fileId: string
    name: string
    collection: string | null
    mimeType: string | null
    fileSize: number | null
    uploadedAt: string | null
    uploadedBy: string | null
    key: string | null
    bpm: number | null
    tags: string[]
    status: string
    // ─── W-02 trust-calibration fields ────────────────────────────────────
    stem?: string
    titleSpecificity?: number
    siblingsInCatalog?: number
    composer?: string
    arranger?: string
    notationSource?: string
    lastUsedInSetlist?: { setlistId: string; eventDate: string }
    bondCorrectionHistory?: {
        correctedTo: number
        correctedAwayFrom: number
        lastCorrectionAt?: string
    }
}

export interface ListLibraryResult {
    rows: LibraryIndexEntry[]
    total: number
    offset: number
    limit: number
}

function toLibraryEntry(
    id: string,
    data: Record<string, unknown>,
): LibraryIndexEntry {
    const name =
        (typeof data.name === "string" && data.name) ||
        (typeof data.title === "string" && data.title) ||
        id
    const uploadedAt =
        typeof data.uploadedAt === "string"
            ? data.uploadedAt
            : typeof data.modifiedTime === "string"
              ? data.modifiedTime
              : null
    const bch = data.bondCorrectionHistory as Record<string, unknown> | undefined
    return {
        fileId: id,
        name,
        collection: typeof data.collection === "string" ? data.collection : null,
        mimeType: typeof data.mimeType === "string" ? data.mimeType : null,
        fileSize: typeof data.fileSize === "number" ? data.fileSize : null,
        uploadedAt,
        uploadedBy: typeof data.uploadedBy === "string" ? data.uploadedBy : null,
        key: typeof data.key === "string" ? data.key : null,
        bpm: typeof data.bpm === "number" ? data.bpm : null,
        tags: Array.isArray(data.tags)
            ? data.tags.filter((t): t is string => typeof t === "string")
            : [],
        status: typeof data.status === "string" ? data.status : "active",
        // W-02 fields — read directly from library_index since this tool
        // already has the row in hand. siblingsInCatalog is NOT denormalized
        // on the doc; listLibrary computes it post-fetch from the stem
        // distribution (see attachSiblingCounts).
        stem: typeof data.stem === "string" ? data.stem : undefined,
        titleSpecificity:
            typeof data.titleSpecificity === "number"
                ? data.titleSpecificity
                : undefined,
        composer: typeof data.composer === "string" ? data.composer : undefined,
        arranger: typeof data.arranger === "string" ? data.arranger : undefined,
        notationSource:
            typeof data.notationSource === "string" ? data.notationSource : undefined,
        lastUsedInSetlist:
            data.lastUsedInSetlist && typeof data.lastUsedInSetlist === "object"
                ? (data.lastUsedInSetlist as {
                      setlistId: string
                      eventDate: string
                  })
                : undefined,
        bondCorrectionHistory: bch
            ? {
                  correctedTo: typeof bch.correctedTo === "number" ? bch.correctedTo : 0,
                  correctedAwayFrom:
                      typeof bch.correctedAwayFrom === "number" ? bch.correctedAwayFrom : 0,
                  lastCorrectionAt:
                      typeof bch.lastCorrectionAt === "string"
                          ? bch.lastCorrectionAt
                          : undefined,
              }
            : undefined,
    }
}

/**
 * Compute siblingsInCatalog per row from the full set (post stem
 * derivation). Mutates entries in place. Counts non-orphaned only.
 */
function attachSiblingCounts(entries: LibraryIndexEntry[]): void {
    const stemCounts = new Map<string, number>()
    for (const e of entries) {
        if (e.status === "orphaned" || !e.stem) continue
        stemCounts.set(e.stem, (stemCounts.get(e.stem) ?? 0) + 1)
    }
    for (const e of entries) {
        if (e.stem) e.siblingsInCatalog = stemCounts.get(e.stem) ?? 1
    }
}

export async function listLibrary(
    _uid: string,
    args: ListLibraryArgs,
): Promise<ListLibraryResult | { error: string }> {
    const limit =
        args.limit && args.limit > 0
            ? Math.min(args.limit, LIST_LIBRARY_MAX_LIMIT)
            : LIST_LIBRARY_DEFAULT_LIMIT
    const offset = args.offset && args.offset > 0 ? args.offset : 0

    try {
        initAdmin()
        const db = getFirestore()
        const snap = await db.collection("library_index").get()
        const all = snap.docs.map((d) => toLibraryEntry(d.id, d.data()))
        attachSiblingCounts(all)

        const chartLike = args.includeNonCharts
            ? all
            : all.filter((e) => !isNonChartArtifact(e))

        // "core" matches the UI semantics in SongChartsLibrary: the CRC
        // Charts tab is the negative-set complement of supplemental + uploads,
        // so any row with collection: null / unset / "core" surfaces there.
        // Historical library_index rows (the 101 CRC charts) carry
        // collection: null rather than "core", so strict-equality would hide
        // them from MCP under {collection: "core"} (CF2-D-1).
        const filtered = args.collection
            ? args.collection === "core"
                ? chartLike.filter(
                      (e) =>
                          e.collection !== "supplemental" &&
                          e.collection !== "uploads",
                  )
                : chartLike.filter((e) => e.collection === args.collection)
            : chartLike

        filtered.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        )

        return {
            rows: filtered.slice(offset, offset + limit),
            total: filtered.length,
            offset,
            limit,
        }
    } catch (err) {
        logger.warn("[mcp] list_library failed:", err)
        return { error: "Failed to read library index" }
    }
}

/* ─────────────────────────────────────────────────────────────────────────
 * dedupe_library_index — one-shot library_index hygiene (cycle-1 F-019, F-008)
 *
 * Stress-test cycle 1 surfaced two duplicate-row patterns in `library_index`:
 *  - F-019: leading-space typo on a Drive scan (`" Ana B_Koach.pdf"` and
 *    `"Ana B_Koach.pdf"` indexed as separate rows, different fileIds).
 *  - F-008: same display name with different fileIds (two
 *    `"Oseh shalom (camp)"` rows from a re-scan).
 *
 * Strategy: group rows by a normalized name key (NFKD + lowercase +
 * separator-collapse + non-alphanumeric strip). For each group with
 * >=2 rows, keep the canonical row (earliest `uploadedAt`, fileId asc
 * as tiebreak) and mark every loser `status: "duplicate"` in BOTH
 * `library_index/{id}` and (if present) `songs/{id}`. The search/list
 * surfaces filter `status === "duplicate"` out of default results;
 * operators audit via the dedupe report.
 *
 * Properties:
 *  - **One-shot:** function call performs one pass and returns. Not a
 *    background daemon. Not a re-sweep loop.
 *  - **Idempotent:** rows already at `status: "duplicate"` are skipped
 *    at grouping time, so a second pass returns `groupsFound: 0`.
 *  - **dryRun:** when true, returns the plan without any writes. F-05.
 *  - **Resilient to half-mirrors:** `songs/{id}` is written only if the
 *    doc already exists (no phantom-row creation).
 *
 * NOT registered as an MCP tool in this lane — `src/lib/mcp/tools/index.ts`
 * is do-not-touch for the cycle-1 search-hygiene bundle. Exported here for
 * a one-shot invocation (admin script, follow-up wiring commit, or test).
 * ───────────────────────────────────────────────────────────────────────── */

export interface DedupeLibraryIndexArgs {
    /** When true, do not write — return the plan only. F-05 standing rule. */
    dryRun?: boolean
}

export interface DedupeGroup {
    /** Normalized name key shared by every row in the group. */
    normalizedName: string
    /** Canonical surviving row. */
    kept: { fileId: string; name: string; uploadedAt: string | null }
    /** Losers that would be / were marked `status: "duplicate"`. */
    duplicates: Array<{ fileId: string; name: string; uploadedAt: string | null }>
}

export interface DedupeLibraryIndexResult {
    /** Active rows considered for grouping (excludes already-duplicate / archived). */
    scanned: number
    /** Number of dupe groups (groups with >=2 rows). */
    groupsFound: number
    /** Total loser rows marked. */
    duplicatesMarked: number
    /** Of the marked losers, how many had a matching `songs/{id}` mirror updated. */
    songsMirrored: number
    /** Per-group plan (for audit / dryRun). */
    groups: DedupeGroup[]
    dryRun: boolean
}

function dedupeNormalize(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[_\s\-]+/g, " ")
        .replace(/[^a-z0-9 ]/g, "")
        .trim()
}

export async function dedupeLibraryIndex(
    _uid: string,
    args: DedupeLibraryIndexArgs = {},
): Promise<DedupeLibraryIndexResult | { error: string }> {
    const dryRun = args.dryRun === true
    try {
        initAdmin()
        const db = getFirestore()
        const snap = await db.collection("library_index").get()

        // Collect dedupable candidates. Skip rows already marked
        // `duplicate` (idempotence) or `archived` (out of scope).
        interface Candidate {
            fileId: string
            name: string
            uploadedAt: string | null
        }
        const candidates: Candidate[] = []
        for (const d of snap.docs) {
            const data = d.data()
            const status = typeof data.status === "string" ? data.status : "active"
            if (status === "duplicate" || status === "archived") continue
            const rawName =
                (typeof data.name === "string" && data.name) ||
                (typeof data.title === "string" && data.title) ||
                ""
            if (!rawName) continue
            const uploadedAt =
                typeof data.uploadedAt === "string"
                    ? data.uploadedAt
                    : typeof data.modifiedTime === "string"
                      ? data.modifiedTime
                      : null
            candidates.push({ fileId: d.id, name: rawName, uploadedAt })
        }

        // Group by normalized key.
        const groups = new Map<string, Candidate[]>()
        for (const c of candidates) {
            const key = dedupeNormalize(c.name)
            // Refuse to group rows whose name normalizes to empty (e.g.
            // emoji-only or punctuation-only names). Too risky to collapse.
            if (!key) continue
            const bucket = groups.get(key) ?? []
            bucket.push(c)
            groups.set(key, bucket)
        }

        // Pick canonical + collect losers per group.
        const dupeGroups: DedupeGroup[] = []
        const losers: Candidate[] = []
        for (const [key, bucket] of groups) {
            if (bucket.length < 2) continue
            // Deterministic canonical: earliest uploadedAt wins; rows with
            // null uploadedAt sort to the end (so a metadata-stripped scan
            // artifact never beats a real timestamp). Tiebreak: fileId asc.
            bucket.sort((a, b) => {
                const aAt = a.uploadedAt ?? "￿"
                const bAt = b.uploadedAt ?? "￿"
                if (aAt !== bAt) return aAt.localeCompare(bAt)
                return a.fileId.localeCompare(b.fileId)
            })
            const [keep, ...rest] = bucket
            dupeGroups.push({
                normalizedName: key,
                kept: {
                    fileId: keep.fileId,
                    name: keep.name,
                    uploadedAt: keep.uploadedAt,
                },
                duplicates: rest.map((r) => ({
                    fileId: r.fileId,
                    name: r.name,
                    uploadedAt: r.uploadedAt,
                })),
            })
            losers.push(...rest)
        }

        let songsMirrored = 0
        if (!dryRun && losers.length > 0) {
            // Find which losers have a `songs/{id}` mirror so we don't
            // create phantom rows. .update() throws on missing docs;
            // .set({}, {merge:true}) creates them — avoid both.
            const songsSnaps = await Promise.all(
                losers.map((l) => db.collection("songs").doc(l.fileId).get()),
            )
            const songsToTag = new Set(
                songsSnaps.filter((s) => s.exists).map((s) => s.id),
            )
            songsMirrored = songsToTag.size

            const nowIso = new Date().toISOString()
            // Firestore caps batches at 500 writes. Stay under with headroom.
            const BATCH_MAX = 400
            interface Op {
                ref: FirebaseFirestore.DocumentReference
                data: Record<string, unknown>
            }
            const ops: Op[] = []
            for (const loser of losers) {
                ops.push({
                    ref: db.collection("library_index").doc(loser.fileId),
                    data: { status: "duplicate", dedupedAt: nowIso },
                })
                if (songsToTag.has(loser.fileId)) {
                    ops.push({
                        ref: db.collection("songs").doc(loser.fileId),
                        data: { status: "duplicate" },
                    })
                }
            }
            for (let i = 0; i < ops.length; i += BATCH_MAX) {
                const batch = db.batch()
                for (const { ref, data } of ops.slice(i, i + BATCH_MAX)) {
                    batch.update(ref, data)
                }
                await batch.commit()
            }
        }

        return {
            scanned: candidates.length,
            groupsFound: dupeGroups.length,
            duplicatesMarked: losers.length,
            songsMirrored,
            groups: dupeGroups,
            dryRun,
        }
    } catch (err) {
        logger.warn("[mcp] dedupe_library_index failed:", err)
        return { error: "Failed to run library_index dedupe" }
    }
}
