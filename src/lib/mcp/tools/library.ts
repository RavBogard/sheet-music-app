import { getAllSongs, getSongById, type SongRecord } from "@/lib/mcp/server-songs"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getStorage } from "firebase-admin/storage"
import { getChartHealth } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"
import { bareStem } from "@/lib/mcp/title-specificity"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import {
    EMPTY_ENRICHMENT_PROJECTION,
    loadEnrichmentProjection,
    loadRetryQueueIds,
    projectionFromLibraryIndexData,
    type EnrichmentProjection,
} from "@/lib/library/enrichment-projection"
import type { HygieneCoverage } from "./reconcile-library"
// v11.5-04-02: `isNonChartArtifactShape` moved to the firebase-admin-free
// `@/lib/library/junk-filter` (single source of truth shared with the browser
// surfaces). Imported here for the existing internal callers + re-exported so
// reconcile-library and any other importer keep their `from "./library"` path.
import { isNonChartArtifactShape } from "@/lib/library/junk-filter"
import { libraryDisplayName } from "@/lib/library/display-name"

export { isNonChartArtifactShape }
/**
 * Google-Apps mime predicate. Used by `dedupeLibraryIndex` to demote
 * Google-Doc/Sheet/Slide/Drawing rows in the per-group canonical-row
 * picker so that a real-bytes PDF beats a never-rendered Google-Doc
 * when both share a normalized name (groups-7/9 trap surfaced by Daniel
 * 2026-05-27 — earlier Google-Doc upload was winning canonical over the
 * later PDF re-upload, silently marking the renderable bytes
 * `duplicate`). Narrower than `isNonChartArtifactShape` by design: the
 * picker only sees rows that survived `archive_nonchart_artifacts` and
 * the dedupe-status filter — audio/.xlsx/.docx etc. should not appear in
 * a dedup group at all; we don't want to demote those at the picker
 * (they'd indicate an upstream bug to surface, not a tiebreak to
 * silently apply).
 */
export function isGoogleAppsMime(mime: string | null | undefined): boolean {
    if (!mime) return false
    return mime.toLowerCase().startsWith("application/vnd.google-apps.")
}

/**
 * L1-W4 (2026-09-02) — the rendering-format class of a library row.
 *
 * A PDF chart and a scraped chord-chart text file of the same song share a
 * normalized name but are NOT two uploads of one thing: they are two
 * renderings, and both are wanted. Grouping them collapses a real artifact,
 * and no canonical-pick tiebreak can help — whichever wins, the other is
 * marked `duplicate` and leaves the browse.
 *
 * Caught in production: `Three Little Birds` had a 44,377-byte
 * `application/pdf` (uploaded by David, human-curated hours earlier) and a
 * 763-byte `text/plain` chart. They grouped, the text row won canonical on
 * an earlier `uploadedAt`, and the PDF was marked `duplicate` and hidden
 * from the browse, search and Perform. `BATCH-L3-ARRANGEMENTS-2026-09-02.md`
 * had already read the pair and called it "the PDF and the text chart …
 * not a duplicate".
 *
 * This is NOT the "upstream skip is the bug, not the picker tiebreak"
 * case the picker doc names. Both rows are legitimate charts that belong
 * in the library; nothing slipped past `archive_nonchart_artifacts`. The
 * grouping key is what was wrong, so the key is what changes: dedupe
 * compares like with like, and cross-format pairs never form a group.
 */
export function chartFormatClass(mime: string | null | undefined): string {
    if (isGoogleAppsMime(mime)) return "gapps"
    const m = (mime ?? "").toLowerCase()
    if (m === "text/plain") return "text"
    return "score"
}

/**
 * W1 (R-0903-live-cw-2 §7) — the bucket-key separator, spelled as an escape.
 *
 * The three sites that build and parse this key (the exact-pass bucket key,
 * its `indexOf` parse, and the fuzzy-cluster key) carried this byte RAW in
 * the source. One raw NUL makes the whole file binary to `grep`, so
 * `grep -rn "chartFormatClass" src/` answered `binary file matches` and
 * printed no lines — the sites a reader most needs were unreachable by the
 * tool they would use to find them.
 *
 * The byte is UNCHANGED. U+0000 is still the separator and every emitted key
 * string stays byte-identical; only the spelling in the source moved from a
 * literal to an escape behind one name, so the writer and the parser cannot
 * diverge. It stays U+0000 deliberately: it cannot occur in a normalized
 * name or in a `chartFormatClass` value, so no name can forge a boundary.
 */
export const FORMAT_CLASS_SEP = "\u0000"

/**
 * L1-W2 (R-0901-live-cw-2 §5, plan review) — canonical-pick status rank.
 *
 * `active` is the only status the browse shows. Every other status is
 * hidden, so a non-active row taken as canonical does not merely keep the
 * wrong row — it empties the group: the canonical stays hidden by its own
 * status and every loser is hidden by the `duplicate` mark that dedupe
 * just wrote. The song leaves the library browse entirely.
 *
 * That was unreachable while archived rows were filtered out of the scan.
 * R-0901-live-cw-1 §3 put them in, and the first plan taken afterwards had
 * 4 groups in exactly that shape (`Shema (major)`, `Avinu Malkeinu_trad_
 * Choir_Em`, `Oseh shalom (S&P)`, `V_shamru_(trad)` — measured live at
 * `ca7fca91ce`, 2026-09-02). So the rank is a consequence of that ruling,
 * not a pre-existing bug it exposed.
 *
 * Deliberately coarse: active vs everything-else, rather than a full status
 * ordering. The question the picker asks is "can this row be the library's
 * visible face", and that is binary. It also covers `orphaned` for free
 * (0 such rows live today, but dedupe has never skipped them).
 */
export function canonicalStatusRank(status: string | null | undefined): number {
    return status === "active" ? 0 : 1
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
     * C9I2-001: by default search hides rows whose chart bytes are dead —
     * `missing` (404 in both Storage and Drive) or `shortcut_unresolved`
     * (an unembeddable Google Drive shortcut). These are `active`-status
     * catalog rows that would silently bind to a broken chart. Set true to
     * surface them anyway, flagged with `chartHealth.bindable: false`, e.g.
     * while triaging library hygiene or to re-bond a shortcut to its target.
     * Default false.
     */
    includeUnbindable?: boolean
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
    /** R-0901-live-cw-4 §5: `library_index.title` — the browse's own fallback
     *  when a row carries no `name`. Joined so search_library resolves the
     *  displayed name through exactly the precedence `toLibraryEntry` uses. */
    indexTitle?: string
    /** Cycle-3 AI-001: enrichment projection joined alongside W-02 so the
     *  single library_index scan in loadLibraryW02Map serves both feature
     *  groups. Always populated (defaults to EMPTY_ENRICHMENT_PROJECTION
     *  when the row pre-dates NEW-3 enrichment). */
    enrichment?: EnrichmentProjection
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
        // Cycle-3 AI-001: parallel fetch of library_index + the in-flight
        // AI retry queue so the enrichment projection rides on the same
        // join pass W-02 already pays for. Both reads fail-soft inside the
        // outer try/catch — a retry-queue read failure degrades to
        // `retryQueued: false` (the projection rolls forward); a
        // library_index failure aborts the whole map (existing behavior).
        const [snap, retryIds] = await Promise.all([
            db.collection("library_index").get(),
            loadRetryQueueIds(db).catch((err) => {
                logger.warn(
                    "[mcp] aiEnrichmentRetryQueue ids fetch failed (retryQueued will read false):",
                    err,
                )
                return new Set<string>()
            }),
        ])
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
        // Second pass — attach W-02 fields + computed siblingsInCatalog
        // + AI-001 enrichment projection.
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
                indexTitle:
                    typeof data.title === "string" ? data.title : undefined,
                enrichment: projectionFromLibraryIndexData(
                    data,
                    retryIds.has(d.id),
                ),
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
    org: OrgId = DEFAULT_ORG_ID,
): Promise<SongRecord[]> {
    const [all, w02Map] = await Promise.all([getAllSongs(), loadLibraryW02Map()])
    const q = normalizeForSearch(args.query)
    const key = args.key?.trim().toLowerCase()
    const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 50) : 20

    // Filter pass — same predicate as before, then join W-02 fields.
    const matches: SongRecord[] = all
        .filter((s) => {
            // v11-02-02: tenant isolation — only the caller's org's songs.
            if (rowOrg(s.orgId) !== org) return false
            if (s.status === "archived") return false
            // Cycle-1 F-019: `duplicate` is the status applied by the
            // dedupe_library_index pass to losing rows of a dupe group.
            // Always hidden from search — operators audit dupes via the
            // dedupe report or list_library, not search.
            if (s.status === "duplicate") return false
            if (!args.includeOrphaned && s.status === "orphaned") return false
            // Lane D (Bug 3): per-token AND-match instead of one contiguous
            // substring. Every whitespace token of the normalized query must
            // appear somewhere in the normalized title, so word-order, dropped/
            // extra words, and "title + composer" queries all hit (e.g.
            // "weisenberg eitz chayim" finds "Eitz chayim - Weisenberg"). A
            // single-token query is identical to the old `.includes` test, so
            // this is a strict superset — nothing that matched before stops.
            // (Typos like "weisberg" vs "weisenberg" still miss; Levenshtein
            // is a deliberately-deferred future lane.)
            if (q) {
                // R-0901-live-cw-4 §5: `edit_library_entry` renames
                // `library_index` and never mirrors into `songs/{id}`, so
                // `s.title` can be a name Daniel can no longer see anywhere.
                // Match the name the BROWSE shows (same `name ?? title`
                // precedence as `toLibraryEntry`), and keep the songs title as
                // an alternate so a row findable by its old name today stays
                // findable — a strict superset, nothing that matched stops.
                const w02q = w02Map.get(s.id)
                const searchable = [w02q?.name ?? w02q?.indexTitle, s.title]
                const toks = q.split(" ")
                const hit = searchable.some(
                    (cand) =>
                        typeof cand === "string" &&
                        cand.length > 0 &&
                        (() => {
                            const t = normalizeForSearch(cand)
                            return toks.every((tok) => t.includes(tok))
                        })(),
                )
                if (!hit) return false
            }
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
            if (!w02) {
                // Row has no library_index — surface empty enrichment so the
                // wire shape is consistent (callers can rely on the four
                // AI-001 fields always being present).
                return { ...s, ...EMPTY_ENRICHMENT_PROJECTION }
            }
            // Promote enrichment projection onto the row's top-level so it
            // rides alongside the W-02 fields. The W-02 sub-object also
            // carries `mimeType` / `name` for the non-chart-artifact filter
            // below — those get stripped in the final mapper.
            const { enrichment, ...rest } = w02
            return {
                ...s,
                ...rest,
                ...(enrichment ?? EMPTY_ENRICHMENT_PROJECTION),
            }
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
    const sliced = ranked.slice(0, limit)

    // C9I2-001: probe live chart-byte health for the bounded result set so
    // the agent never silently binds (or surfaces as "clean") a dead chart.
    // Reuses the existing getChartHealth machinery (Storage probe → Drive
    // metadata fallback → shortcut detection) — same path verify_setlist_charts
    // uses. The W-02-joined `mimeType` is passed so a library_index row whose
    // canonical mime is a Drive shortcut is caught even when Storage holds a
    // stale shortcut blob (BUG-002). Bounded to `limit` (≤50) rows so the
    // probe cost stays comparable to the full-catalog read this tool already
    // pays. Definitively-dead rows (missing / shortcut_unresolved) are dropped
    // by default; `unreachable` (transient blip) and `needs_storage_sync`
    // (serves via Drive fallback) stay — same not-punish-a-blip posture as
    // verify_setlist_charts' orphan marking.
    const healthProbes = await Promise.all(
        sliced.map((r) => {
            const m = r as SongRecord & { mimeType?: string }
            return getChartHealth(r.id, m.mimeType).catch(() => ({
                status: "unreachable" as const,
                error: "health probe failed",
            }))
        }),
    )

    // Strip internal _rank AND the join-only classification fields
    // (`mimeType` / `name` come from the W-02 join purely so the
    // F-007/F-024 filter step above can run isNonChartArtifactShape;
    // they are NOT part of the SongRecord wire contract).
    const out: SongRecord[] = []
    sliced.forEach((r, i) => {
        const health = healthProbes[i]
        const bindable =
            health.status === "ok" ||
            health.status === "needs_storage_sync" ||
            health.status === "unreachable"
        // Default: drop definitively-dead rows. includeUnbindable surfaces
        // them flagged so hygiene/re-bond flows can still find them.
        if (!bindable && !args.includeUnbindable) return

        const merged = r as SongRecord & {
            _rank: number
            mimeType?: string
            name?: string
            indexTitle?: string
        }
        const {
            _rank: _r,
            mimeType: _m,
            name: _n,
            indexTitle: _it,
            ...rest
        } = merged
        void _r
        void _m
        void _n
        void _it
        const row = rest as SongRecord
        // R-0901-live-cw-4 §5: render the name the browse shows. Matching on
        // the current name and then returning the stale one is the same defect
        // wearing a different face.
        // R-0902-live-cw-1 §2: same shared display path as list_library, so
        // the two surfaces cannot drift again. The filter above matched on the
        // RAW name, so `Hashkivenu.pdf` still finds the row.
        const displayName = libraryDisplayName(merged.name ?? merged.indexTitle)
        if (displayName) row.title = displayName
        // Only annotate non-ok rows — keeps the healthy-row wire shape lean.
        if (health.status !== "ok") {
            row.chartHealth = {
                status: health.status,
                bindable,
                reason:
                    "reason" in health && typeof health.reason === "string"
                        ? health.reason
                        : "error" in health && typeof health.error === "string"
                          ? health.error
                          : undefined,
            }
        }
        out.push(row)
    })
    return out
}

export interface GetSongArgs {
    id: string
}

export async function getSong(
    _uid: string,
    args: GetSongArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<SongRecord | null> {
    const song = await getSongById(args.id)
    if (!song) return null
    // v11-02-02: cross-tenant hard wall — return not-found for another org's
    // song rather than leak its metadata.
    if (rowOrg(song.orgId) !== org) return null
    // Cycle-3 AI-001: project enrichment fields off the matching library_index
    // row so single-song reads carry the same AI state the bulk read tools
    // surface. Fail-soft — a library_index miss returns an empty projection
    // (pre-NEW-3 uploads / catalog-only rows) without bubbling the failure.
    let projection: EnrichmentProjection = EMPTY_ENRICHMENT_PROJECTION
    try {
        initAdmin()
        projection = await loadEnrichmentProjection(getFirestore(), args.id)
    } catch (err) {
        logger.warn(
            `[mcp] get_song enrichment projection load failed for ${args.id}:`,
            err,
        )
    }
    return { ...song, ...projection }
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
    collection?: "core" | "supplemental" | "uploads" | "nava"
    limit?: number
    offset?: number
    includeNonCharts?: boolean
    /**
     * If true, include rows with `status` ∈ {`duplicate`, `orphaned`,
     * `archived`} that the
     * default browse and the in-app /library catalog hide. Defaults to false.
     * Cycle-2 DATA-004: aligns list_library's default to the UI's hidden-set so
     * caller-side counts match (e.g. `/library` "CRC Charts (162)" vs MCP 185).
     */
    includeNonChartHealthy?: boolean
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
    // ─── AI-001 enrichment projection (cycle-3) ───────────────────────────
    // Always populated — pre-NEW-3 rows surface the empty projection so the
    // wire shape is consistent.
    enrichmentStatus: EnrichmentProjection["enrichmentStatus"]
    enrichmentConfidence: EnrichmentProjection["enrichmentConfidence"]
    aiSuggestion: EnrichmentProjection["aiSuggestion"]
    retryQueued: EnrichmentProjection["retryQueued"]
    // Cowork #9 — last AI enrichment run timestamp (age/lag signal).
    enrichmentRanAt: EnrichmentProjection["enrichmentRanAt"]
}

/**
 * Cowork #9 (cowork-2026-05-22) — enrichment backlog summary surfaced on
 * list_library so a curator can see at a glance how many rows are still
 * unenriched (no collection / key / bpm filled in by the AI pass yet) instead
 * of guessing core-vs-supplemental from filenames. Computed over the same
 * `filtered` set that `total` reflects, so the counts match the rows the
 * caller is browsing.
 */
export interface EnrichmentCoverage {
    /** Row counts keyed by enrichmentStatus. `unenriched` = status is null
     *  (pre-NEW-3 rows enrichment never touched). */
    byStatus: {
        pending: number
        review_pending: number
        enriched: number
        failed: number
        human_curated: number
        human_rejected: number
        unenriched: number
    }
    /**
     * Rows that still need enrichment attention: `pending` + `review_pending`
     * + `failed` + `unenriched`. The single number a curator watches as the
     * backlog. (`enriched` / `human_curated` / `human_rejected` are settled.)
     */
    pendingEnrichmentCount: number
}

export interface ListLibraryResult {
    rows: LibraryIndexEntry[]
    total: number
    offset: number
    limit: number
    /** Cycle-3 DATA-002 — uniform hygiene scan coverage. */
    coverage: HygieneCoverage
    /** Cowork #9 — enrichment backlog summary over the `total` set. */
    enrichmentCoverage: EnrichmentCoverage
}

/**
 * Pure enrichment-backlog tally over a set of library rows. Extracted so the
 * count logic is unit-testable without the emulator. `enrichmentStatus: null`
 * (the empty projection) counts as `unenriched`.
 */
export function computeEnrichmentCoverage(
    rows: Array<{ enrichmentStatus: EnrichmentProjection["enrichmentStatus"] }>,
): EnrichmentCoverage {
    const byStatus = {
        pending: 0,
        review_pending: 0,
        enriched: 0,
        failed: 0,
        human_curated: 0,
        human_rejected: 0,
        unenriched: 0,
    }
    for (const r of rows) {
        const s = r.enrichmentStatus
        if (s === null || s === undefined) byStatus.unenriched++
        else byStatus[s]++
    }
    const pendingEnrichmentCount =
        byStatus.pending +
        byStatus.review_pending +
        byStatus.failed +
        byStatus.unenriched
    return { byStatus, pendingEnrichmentCount }
}

function toLibraryEntry(
    id: string,
    data: Record<string, unknown>,
    retryQueued: boolean,
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
    const enrichment = projectionFromLibraryIndexData(data, retryQueued)
    return {
        fileId: id,
        // R-0902-live-cw-1 §2: the extension is packaging. Display-side only —
        // `mimeType` below still carries the real file type, and every filter
        // in this module reads the raw `data.name`.
        name: libraryDisplayName(name),
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
        // ─── AI-001 enrichment projection ────────────────────────────────
        ...enrichment,
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
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ListLibraryResult | RichErrorEnvelope> {
    const limit =
        args.limit && args.limit > 0
            ? Math.min(args.limit, LIST_LIBRARY_MAX_LIMIT)
            : LIST_LIBRARY_DEFAULT_LIMIT
    const offset = args.offset && args.offset > 0 ? args.offset : 0

    try {
        initAdmin()
        const db = getFirestore()
        // Cycle-3 AI-001: parallel pull of library_index + the in-flight AI
        // retry queue so the projection rides on a single round-trip
        // alongside the existing scan. retry-queue read fails-soft: a fetch
        // miss collapses to `retryQueued: false` on every row but keeps the
        // catalog browse working.
        const [snap, retryIds] = await Promise.all([
            db.collection("library_index").get(),
            loadRetryQueueIds(db).catch((err) => {
                logger.warn(
                    "[mcp] list_library retryQueue ids fetch failed (retryQueued will read false):",
                    err,
                )
                return new Set<string>()
            }),
        ])
        const all = snap.docs
            // v11-02-02: tenant isolation — only the caller's org's library rows.
            .filter((d) => rowOrg(d.data().orgId) === org)
            .map((d) => toLibraryEntry(d.id, d.data(), retryIds.has(d.id)))
        attachSiblingCounts(all)

        // Cycle-3 DATA-002 — capture each filter pass's filteredOut so the
        // surfaced `total` field matches a real catalog count Daniel can
        // correlate against the other hygiene tools.
        const filteredOut: HygieneCoverage["filteredOut"] = {
            byStatus: {},
            byCollection: {},
            byOther: {},
        }

        const chartLike = args.includeNonCharts
            ? all
            : all.filter((e) => {
                  if (isNonChartArtifact(e)) {
                      filteredOut.byOther.non_chart =
                          (filteredOut.byOther.non_chart ?? 0) + 1
                      return false
                  }
                  return true
              })

        // L1-W2 (R-0901-live-cw-1 3, Daniel's call): `archived` now leaves the
        // browse AND enters the hygiene scan. Before this wave the two sides
        // disagreed - the browse hid only `duplicate` + `orphaned` while
        // dedupe_library / reconcile_library filtered `archived` OUT of their
        // scan, so 20 archived rows sat in the catalog Daniel browses and no
        // hygiene tool could reach them (measured live 2026-09-01: 20 archived,
        // 17 with an active row of the same name, 12 byte-identical by
        // fileSize). Both sides move together; `includeNonChartHealthy: true`
        // stays the audit escape hatch and now surfaces `archived` too, so
        // nothing becomes unreachable by any tool.
        //
        // Cycle-2 DATA-004: align list_library's default with the in-app
        // /library catalog, which hides rows that the dedupe pass has marked
        // `status: "duplicate"` and Drive-side `status: "orphaned"` rows. Same
        // hidden-set as search_library so the surfaced count matches the UI's.
        // Opt-in via `includeNonChartHealthy: true` for audit/reconciliation.
        const chartHealthy = args.includeNonChartHealthy
            ? chartLike
            : chartLike.filter((e) => {
                  if (
                      e.status === "duplicate" ||
                      e.status === "orphaned" ||
                      e.status === "archived"
                  ) {
                      filteredOut.byStatus[e.status] =
                          (filteredOut.byStatus[e.status] ?? 0) + 1
                      return false
                  }
                  return true
              })

        // "core" matches the UI semantics in SongChartsLibrary: the CRC
        // Charts tab is the negative-set complement of supplemental + nava +
        // uploads,
        // so any row with collection: null / unset / "core" surfaces there.
        // Historical library_index rows (the 101 CRC charts) carry
        // collection: null rather than "core", so strict-equality would hide
        // them from MCP under {collection: "core"} (CF2-D-1).
        const filtered = args.collection
            ? args.collection === "core"
                ? chartHealthy.filter((e) => {
                      if (
                          e.collection === "supplemental" ||
                          e.collection === "uploads" ||
                          e.collection === "nava"
                      ) {
                          filteredOut.byCollection[e.collection] =
                              (filteredOut.byCollection[e.collection] ?? 0) + 1
                          return false
                      }
                      return true
                  })
                : chartHealthy.filter((e) => {
                      if (e.collection !== args.collection) {
                          const key = e.collection ?? "(none)"
                          filteredOut.byCollection[key] =
                              (filteredOut.byCollection[key] ?? 0) + 1
                          return false
                      }
                      return true
                  })
            : chartHealthy

        filtered.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        )

        return {
            rows: filtered.slice(offset, offset + limit),
            total: filtered.length,
            offset,
            limit,
            coverage: {
                total: all.length,
                eligible: chartLike.length,
                scanned: filtered.length,
                filteredOut,
            },
            // Cowork #9 — backlog over the same `filtered` set `total` reflects.
            enrichmentCoverage: computeEnrichmentCoverage(filtered),
        }
    } catch (err) {
        logger.warn("[mcp] list_library failed:", err)
        return richError(
            "internal_error",
            "Failed to read library index.",
            { tool: "list_library" },
            "Retry; if the failure persists check the Firestore project / IAM.",
        )
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
    /**
     * Cycle-3 MCP-001 (Daniel-ratified 2026-05-18T18:45Z, decisions.md
     * item 5) — required for real writes. dryRun + force omitted on a
     * real-run path returns the plan with `refused: true` and no writes.
     * Matches the F-05 standing rule already enforced on every other
     * hygiene tool (reconcile_library / backfill_library_index /
     * backfill_setlist_test_flag).
     */
    force?: boolean
    /**
     * Cycle-3 MCP-001 — optional per-call similarity threshold. When
     * provided (any value in [0,1]), an additional fuzzy-similarity
     * grouping pass runs on top of the default exact-normalized-name
     * grouping. Rows whose normalized-name Levenshtein similarity
     * exceeds the threshold get clustered into the same dedupe group.
     * 0.85 is the standing rule's strict default ([[feedback_dedup_force_override]]);
     * lower values (e.g. 0.84) find more clusters and are intended for
     * cycle-4 §7.B.4 boundary probes only. PER-CALL TUNING ONLY — the
     * persisted dedup threshold elsewhere in the codebase is unchanged.
     * Omitting forceScore preserves the historical exact-normalize-only
     * behavior so existing callers see no surprise grouping.
     */
    forceScore?: number
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
    /**
     * F-005: planned loser count — how many rows WOULD be marked `duplicate`.
     * Populated on every path (dryRun, refused, and committed) so the caller
     * always sees the plan size without inferring it from `groups`.
     */
    wouldMark: number
    /**
     * F-005: loser rows ACTUALLY marked `duplicate` this call. 0 on dryRun
     * and on a refused real-run (no `force`); equals `wouldMark` on a
     * committed real-run. Replaces the old `duplicatesMarked`, which reported
     * the plan size even when nothing was written (refused/dryRun) — actively
     * misleading the caller into thinking dedupe had happened.
     */
    committed: number
    /** Of the committed losers, how many had a matching `songs/{id}` mirror updated. */
    songsMirrored: number
    /** Per-group plan (for audit / dryRun). */
    groups: DedupeGroup[]
    dryRun: boolean
    /** Cycle-3 MCP-001 — true when force omitted on a real-run; no writes happened. */
    refused?: boolean
    /** Cycle-3 MCP-001 — the threshold actually applied for this call (default 0.85). */
    threshold: number
    /** Cycle-3 DATA-002 — uniform hygiene scan coverage. */
    coverage: HygieneCoverage
}

/**
 * L1-W1 — the extensions `dedupe_library` treats as PACKAGING.
 *
 * This is `STRIPPABLE_EXTENSION_RE` MINUS the audio tokens (`mp3`/`m4a`/`wav`),
 * and the divergence is the point rather than drift. The shared set exists for
 * STEM IDENTITY — `Adon Olam.mp3` and `Adon Olam.pdf` are the same *song*, so
 * folding the extension is right when you are asking "what prayer is this?".
 * Dedupe asks a different question — "is this the same ARTIFACT?" — and a
 * recording is not a duplicate of a lead sheet.
 *
 * Measured on the live catalog 2026-09-01: stripping audio too produced 95
 * groups of which FIVE mixed a recording with a chart, and in three of them the
 * canonical picker kept the recording and would have marked a real chart
 * `duplicate` on a force-run — `Adon Olam.mp3` over two `Adon Olam` charts,
 * `Mizmor Shiru L'adonai .mp3` over `Mizmor Shiru Ladonai.pdf`, `Sim Shalom.mp3`
 * over `Sim_shalom.pdf`. Excluding audio gives 91 groups and ZERO mixed groups.
 *
 * The picker's own contract says the same thing from the other side: it demotes
 * only Google-Apps mimes, and its comment states that when a non-chart artifact
 * reaches it, "the upstream skip is the bug to fix, not the picker tiebreak".
 * This IS that upstream fix.
 *
 * Pinned against the shared set by test, so adding a token there cannot quietly
 * change what dedupe considers packaging.
 */
export const DEDUPE_STRIPPABLE_EXTENSION_RE =
    /.(pdf|musicxml|xml|mxl|jpg|png|webp)$/i

/**
 * Exact-grouping key for `dedupe_library`. Distinct from f010's persisted
 * `normalizedName` (`recompute-index-name-fields.ts`) BY DESIGN:
 *
 *  - NFKD + combining-mark strip **folds accents** (`Café → cafe`), so an
 *    accented re-upload dedupes against its unaccented twin. f010 uses NFKC
 *    and keeps accents (it feeds the persisted field + fuzzy Levenshtein,
 *    where folding is undesirable).
 *  - Separators collapse to a single space and word-spaces are KEPT, so the
 *    optional Levenshtein pass (`nameSimilarity`) scores on word-aware text.
 *    f010 strips spaces entirely.
 *
 * C10I2-001: the char-class keeps **Unicode** letters/numbers (`\p{L}\p{N}`),
 * not ASCII-only (`a-z0-9`). The prior ASCII-only class erased every
 * Hebrew/Arabic/CJK letter, so two distinct native-script titles sharing a
 * Latin substring (e.g. `"c10 אדון עולם"` and `"c10 אבינו מלכנו"`) both
 * collapsed to `"c10"` and were falsely grouped as duplicates. Keeping the
 * Unicode classes makes native scripts survive as distinct keys. This is
 * behavior-preserving for the all-Latin catalog: `a-z0-9` ⊂ `\p{L}\p{N}`,
 * and accent folding is unaffected (combining marks are stripped at the
 * NFKD step above, before this regex). Emoji/punctuation-only titles still
 * normalize to `""` (symbols are `\p{S}`, not `\p{L}`/`\p{N}`) and remain
 * safely excluded from grouping by the empty-key guard.
 *
 * L1-W1 (R-0901-live-cw-1 4): the TRAILING media extension is stripped
 * before the punctuation pass, using `DEDUPE_STRIPPABLE_EXTENSION_RE` — the
 * shared `STRIPPABLE_EXTENSION_RE` minus audio. See that constant for why the
 * two sets differ and for the three live charts the audio tokens would have
 * buried behind an .mp3.
 *
 * Why it matters: the dominant duplication shape in this library is a Drive
 * row named `X.pdf` beside an upload row named `X`. Keeping the extension
 * made those two distinct keys (`achot ketanapdf` vs `achot ketana`), so the
 * exact pass could not see the pattern at all - measured on the live surface
 * 2026-09-01, the exact pass returned 8 groups where extension-stripping
 * returns 79 over the same 908-row eligible set.
 *
 * ORDER MATTERS: the strip runs AFTER separator collapse (so `Ana B_Koach.pdf`
 * is `ana b koach.pdf` by this point) and BEFORE the punctuation pass, which
 * would otherwise delete the `.` the regex anchors on.
 *
 * NOT stripped: `.txt` / `.doc` / `.docx`. They are absent from the shared
 * pinned set, and widening it is a separate question - 11 live rows carry a
 * `.doc`/`.docx` name over genuinely PDF bytes, so the extension there is a
 * naming defect, not packaging. Returned to the desk, not decided here.
 */
export function dedupeNormalize(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[_\s\-]+/g, " ")
        .replace(DEDUPE_STRIPPABLE_EXTENSION_RE, "")
        .replace(/[^\p{L}\p{N} ]/gu, "")
        .trim()
}

/**
 * Cycle-3 MCP-001 — Levenshtein-distance similarity score in [0, 1] over
 * dedupe-normalized names. Reused from processChartUpload's H-3 dedup
 * (line 397-405). Higher = more similar. 1.0 = identical post-normalize.
 */
function nameSimilarity(a: string, b: string): number {
    if (a === b) return 1
    const max = Math.max(a.length, b.length)
    if (max === 0) return 1
    // Simple Levenshtein (Wagner-Fischer). Bounded by max here so the dedup
    // loop stays O(N²·max) — acceptable for catalog-sized N (<1000).
    const m = a.length
    const n = b.length
    const dp: number[] = new Array(n + 1)
    for (let j = 0; j <= n; j++) dp[j] = j
    for (let i = 1; i <= m; i++) {
        let prev = dp[0]
        dp[0] = i
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j]
            dp[j] = Math.min(
                dp[j] + 1,
                dp[j - 1] + 1,
                prev + (a[i - 1] === b[j - 1] ? 0 : 1),
            )
            prev = tmp
        }
    }
    return 1 - dp[n] / max
}

/**
 * Cycle-3 MCP-001 — single-link clustering of remaining (post-exact-grouping)
 * candidates by `nameSimilarity > threshold`. Returns a Map keyed by the
 * canonical key of the cluster (= lowest fileId in the cluster), valued by
 * the candidates in that cluster. Only clusters with >=2 candidates land
 * in the result. Runs in O(N²) over candidates — fine at catalog size.
 */
interface SimilarityCandidate {
    fileId: string
    name: string
    normalizedKey: string
    uploadedAt: string | null
    // mimeType is captured so the fuzzy-cluster canonical pick can apply
    // the same Google-Apps demotion as the exact-group sort. See
    // `dedupeLibraryIndex` per-group sort comment.
    mimeType: string | null
    // L1-W2: and the same status rank, so the two passes cannot disagree
    // about what may be canonical.
    status: string
}
function clusterBySimilarity(
    candidates: SimilarityCandidate[],
    threshold: number,
): Map<string, SimilarityCandidate[]> {
    // Disjoint-set / union-find over candidate indices.
    const parent = candidates.map((_, i) => i)
    const find = (x: number): number => {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]]
            x = parent[x]
        }
        return x
    }
    const union = (a: number, b: number) => {
        const ra = find(a)
        const rb = find(b)
        if (ra !== rb) parent[ra] = rb
    }
    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            if (
                nameSimilarity(
                    candidates[i].normalizedKey,
                    candidates[j].normalizedKey,
                ) > threshold
            ) {
                union(i, j)
            }
        }
    }
    const buckets = new Map<number, SimilarityCandidate[]>()
    for (let i = 0; i < candidates.length; i++) {
        const r = find(i)
        const bucket = buckets.get(r) ?? []
        bucket.push(candidates[i])
        buckets.set(r, bucket)
    }
    const out = new Map<string, SimilarityCandidate[]>()
    for (const bucket of buckets.values()) {
        if (bucket.length < 2) continue
        bucket.sort((a, b) => a.fileId.localeCompare(b.fileId))
        out.set(bucket[0].fileId, bucket)
    }
    return out
}

/**
 * Cycle-1 F-019 / F-008 + Cycle-3 MCP-001 — admin-gated library_index
 * dedupe. Groups library_index rows by normalized name (exact pass) and
 * optionally by Levenshtein similarity above `forceScore` (fuzzy pass),
 * picks one canonical per group, and (on `force:true`) marks the rest
 * `status:"duplicate"` in both `library_index` and any matching
 * `songs/{id}` mirror.
 *
 * Canonical-pick policy (applies identically to exact + fuzzy groups):
 *   1. `active` BEFORE any other status (`canonicalStatusRank`). Age
 *      decides only WITHIN a status. Without this the picker can hand
 *      canonical to a row the browse hides and mark the visible one
 *      `duplicate`, which removes the song from the browse altogether
 *      rather than merely picking the wrong survivor.
 *   2. Non-Google-Apps mime BEFORE Google-Apps. A file-bytes row
 *      (PDF/image/MusicXML) wins canonical over a Google-Doc with the
 *      same normalized name even when the Google-Doc has the earlier
 *      `uploadedAt`. Closes the groups-7/9 trap where Daniel's
 *      `dedupe_library({force:true})` would silently mark a renderable
 *      PDF `duplicate` and keep an un-renderable Google-Doc as the
 *      survivor. Behavior-preserving for any group containing zero
 *      Google-Apps rows (the demotion only flips an outcome when a
 *      mixed-mime group exists).
 *   3. Earliest `uploadedAt` — null sorts to the end so a
 *      metadata-stripped scan artifact never beats a real timestamp.
 *   4. `fileId` ASC tiebreak — fully deterministic.
 *
 * Non-chart artifacts (audio / .xlsx / .docx / folders / dotfiles)
 * should never reach the picker — they are filtered upstream by
 * `archive_nonchart_artifacts` + list/search hides. The picker
 * deliberately demotes ONLY Google-Apps (`isGoogleAppsMime`), not all
 * `isNonChartArtifactShape`-positive rows: if those slip through, the
 * upstream skip is the bug to fix, not the picker tiebreak.
 *
 * L1-W4: that reasoning holds only for rows that should not be in the
 * group. It does NOT cover a PDF and a text chart of the same song —
 * both are legitimate charts, and no tiebreak here can keep both
 * visible. That case is handled before the picker runs, by the grouping
 * key. See `chartFormatClass`.
 *
 * Dedup threshold (0.85 strict) and force-override semantics are not
 * touched by this picker; see `[[feedback_dedup_force_override]]`.
 */
export async function dedupeLibraryIndex(
    uid: string,
    args: DedupeLibraryIndexArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<DedupeLibraryIndexResult | RichErrorEnvelope> {
    const dryRun = args.dryRun === true
    const force = args.force === true
    // forceScore opt-in: any number triggers similarity grouping; omit to
    // preserve historical exact-normalize-only behavior. Standing-rule
    // strict default per [[feedback_dedup_force_override]] when caller
    // opts in without specifying a value (e.g. `forceScore: 0.85`).
    const similarityThreshold: number | null =
        typeof args.forceScore === "number" &&
        args.forceScore >= 0 &&
        args.forceScore <= 1
            ? args.forceScore
            : null
    try {
        initAdmin()
        const db = getFirestore()

        // C9I5-001 admin gate. Dry-run + real-run both require admin — this
        // tool mutates library_index (marks rows `duplicate`) and mirrors into
        // songs/{id}; it is exclusively a maintenance affordance, never a
        // read-anywhere browse path. Mirrors backfill_library_index's gate so
        // the whole admin-hygiene family is uniform.
        const userSnap = await db.collection("users").doc(uid).get()
        const role = userSnap.exists
            ? (userSnap.data()?.role as string | undefined)
            : undefined
        if (role !== "admin") {
            return richError(
                "forbidden_role",
                "dedupe_library is admin-only.",
                {
                    callerRole: role ?? null,
                    requiredRoles: ["admin"],
                },
                "Ask an admin to elevate your account, or call a tool your role is allowed to use.",
            )
        }

        const snap = await db.collection("library_index").get()

        // v11-02-02 tenant isolation — L1-W3, Daniel's call 2026-09-01.
        // The hygiene tools scanned the RAW collection while list_library
        // filtered by rowOrg, which is exactly why they reported 943 against
        // the browse's 891: the 52-row gap was another tenant's rows, and a
        // force-run would have written to them (7 of the 8 groups in the live
        // plan on 2026-09-01 were entirely another org's charts). Scoped here
        // so all four hygiene tools' `coverage` agrees with the browse — which
        // is what cycle-3 DATA-002 built that uniform field for.
        const orgDocs = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)

        // Collect dedupable candidates. Skip rows already marked
        // `duplicate` (idempotence) only.
        //
        // L1-W2: `archived` is NO LONGER skipped. It was excluded as "out of
        // scope", but the browse did not hide it, so archived rows were visible
        // to Daniel and invisible to every hygiene tool at the same time. They
        // are in scope now; the browse hides them instead.
        //
        // mimeType is captured for the per-group canonical-pick sort:
        // Google-Apps rows (Docs/Sheets/Slides) are demoted vs file-bytes
        // rows so a later PDF re-upload wins canonical over an earlier
        // Google-Doc upload (groups-7/9 trap). See `isGoogleAppsMime`.
        interface Candidate {
            fileId: string
            name: string
            uploadedAt: string | null
            mimeType: string | null
            // L1-W2: carried for the canonical-pick status rank. It was
            // read for the skip above and then dropped, which is why the
            // picker could not see it.
            status: string
        }
        const candidates: Candidate[] = []
        const filteredByStatus: Record<string, number> = {}
        const filteredByOther: Record<string, number> = {}
        for (const d of orgDocs) {
            const data = d.data()
            const status = typeof data.status === "string" ? data.status : "active"
            if (status === "duplicate") {
                filteredByStatus[status] = (filteredByStatus[status] ?? 0) + 1
                continue
            }
            const rawName =
                (typeof data.name === "string" && data.name) ||
                (typeof data.title === "string" && data.title) ||
                ""
            if (!rawName) {
                filteredByOther.empty_name =
                    (filteredByOther.empty_name ?? 0) + 1
                continue
            }
            const uploadedAt =
                typeof data.uploadedAt === "string"
                    ? data.uploadedAt
                    : typeof data.modifiedTime === "string"
                      ? data.modifiedTime
                      : null
            const mimeType =
                typeof data.mimeType === "string" ? data.mimeType : null
            candidates.push({
                fileId: d.id,
                name: rawName,
                uploadedAt,
                mimeType,
                status,
            })
        }

        // Group by normalized key.
        const groups = new Map<string, Candidate[]>()
        for (const c of candidates) {
            const key = dedupeNormalize(c.name)
            // Refuse to group rows whose name normalizes to empty (e.g.
            // emoji-only or punctuation-only names). Too risky to collapse.
            if (!key) {
                filteredByOther.empty_normalized_key =
                    (filteredByOther.empty_normalized_key ?? 0) + 1
                continue
            }
            // L1-W4: like compares with like. A PDF and a text chart of
            // the same song are two renderings, not two uploads, so they
            // must never share a bucket. See `chartFormatClass`.
            const bucketKey = `${key}${FORMAT_CLASS_SEP}${chartFormatClass(c.mimeType)}`
            const bucket = groups.get(bucketKey) ?? []
            bucket.push(c)
            groups.set(bucketKey, bucket)
        }

        // Pick canonical + collect losers per group.
        const dupeGroups: DedupeGroup[] = []
        const losers: Candidate[] = []
        const exactGroupedIds = new Set<string>()
        for (const [bucketKey, bucket] of groups) {
            if (bucket.length < 2) continue
            // Strip the L1-W4 format-class suffix for reporting; the group
            // is still identified to the operator by its normalized name.
            const key = bucketKey.slice(0, bucketKey.indexOf(FORMAT_CLASS_SEP))
            // Deterministic canonical pick. Sort priority:
            //   (a) `active` BEFORE any other status. A hidden row taken
            //       as canonical empties the group: it stays hidden by its
            //       own status while every loser is hidden by the mark
            //       this run writes. See `canonicalStatusRank`.
            //   (b) non-Google-Apps mime BEFORE Google-Apps — a real-bytes
            //       PDF wins canonical over a Google-Doc with the same
            //       normalized name (groups-7/9 trap: a Google-Doc upload
            //       could otherwise out-rank a later PDF re-upload by
            //       uploadedAt alone and silently mark the renderable
            //       bytes `duplicate`). Behavior-preserving for groups
            //       containing zero Google-Apps rows.
            //   (c) earliest uploadedAt — rows with null uploadedAt sort
            //       to the end (a metadata-stripped scan artifact never
            //       beats a real timestamp).
            //   (d) tiebreak: fileId asc.
            bucket.sort((a, b) => {
                const aLive = canonicalStatusRank(a.status)
                const bLive = canonicalStatusRank(b.status)
                if (aLive !== bLive) return aLive - bLive
                const aGoogle = isGoogleAppsMime(a.mimeType) ? 1 : 0
                const bGoogle = isGoogleAppsMime(b.mimeType) ? 1 : 0
                if (aGoogle !== bGoogle) return aGoogle - bGoogle
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
            for (const c of bucket) exactGroupedIds.add(c.fileId)
            losers.push(...rest)
        }

        // Cycle-3 MCP-001 — optional second pass: cluster the remaining
        // ungrouped candidates by name-similarity above `forceScore`.
        // Reuses the canonical-pick + loser collection rules. Rows already
        // grouped by exact-normalize stay in their exact group (a row
        // can only belong to one cluster).
        if (similarityThreshold !== null) {
            const remaining: SimilarityCandidate[] = []
            for (const c of candidates) {
                if (exactGroupedIds.has(c.fileId)) continue
                const key = dedupeNormalize(c.name)
                if (!key) continue
                remaining.push({
                    fileId: c.fileId,
                    name: c.name,
                    normalizedKey: key,
                    uploadedAt: c.uploadedAt,
                    mimeType: c.mimeType,
                    status: c.status,
                })
            }
            // L1-W4: the similarity pass gets the same like-with-like
            // guard as the exact pass — cluster inside one format class,
            // never across. A fuzzy match is a weaker signal than an exact
            // one, so crossing formats here would be strictly worse.
            const byFormat = new Map<string, SimilarityCandidate[]>()
            for (const c of remaining) {
                const cls = chartFormatClass(c.mimeType)
                const arr = byFormat.get(cls) ?? []
                arr.push(c)
                byFormat.set(cls, arr)
            }
            const fuzzyClusters = new Map<string, SimilarityCandidate[]>()
            for (const [cls, rows] of byFormat) {
                for (const [k, cluster] of clusterBySimilarity(
                    rows,
                    similarityThreshold,
                )) {
                    fuzzyClusters.set(`${cls}${FORMAT_CLASS_SEP}${k}`, cluster)
                }
            }
            for (const cluster of fuzzyClusters.values()) {
                if (cluster.length < 2) continue
                // Same sort priority as the exact-group bucket above:
                // (a) active-status first, (b) non-Google-Apps mime first,
                // (c) earliest uploadedAt, (d) fileId asc. Keeps the
                // canonical-pick policy uniform between exact-normalize
                // groups and similarity clusters.
                cluster.sort((a, b) => {
                    const aLive = canonicalStatusRank(a.status)
                    const bLive = canonicalStatusRank(b.status)
                    if (aLive !== bLive) return aLive - bLive
                    const aGoogle = isGoogleAppsMime(a.mimeType) ? 1 : 0
                    const bGoogle = isGoogleAppsMime(b.mimeType) ? 1 : 0
                    if (aGoogle !== bGoogle) return aGoogle - bGoogle
                    const aAt = a.uploadedAt ?? "￿"
                    const bAt = b.uploadedAt ?? "￿"
                    if (aAt !== bAt) return aAt.localeCompare(bAt)
                    return a.fileId.localeCompare(b.fileId)
                })
                const [keep, ...rest] = cluster
                dupeGroups.push({
                    normalizedName: keep.normalizedKey,
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
                losers.push(
                    ...rest.map((r) => ({
                        fileId: r.fileId,
                        name: r.name,
                        uploadedAt: r.uploadedAt,
                        mimeType: r.mimeType,
                        status: r.status,
                    })),
                )
            }
        }

        // F-05 refusal: real run without `force: true` returns the rich
        // force_required envelope (FU-1) carrying the plan in `dryRunPlan`,
        // no writes. Mirrors reconcile_library / backfill_library_index /
        // backfill_setlist_test_flag / library-review (REG-003 canonical shape).
        const coverage: HygieneCoverage = {
            total: orgDocs.length,
            eligible: candidates.length,
            scanned: candidates.length,
            filteredOut: {
                byStatus: filteredByStatus,
                byCollection: {},
                byOther: filteredByOther,
            },
        }
        const threshold = similarityThreshold ?? 0.85
        if (!dryRun && !force) {
            return richError(
                "force_required",
                "dedupe_library requires force:true to commit.",
                {
                    dryRunPlan: {
                        scanned: candidates.length,
                        groupsFound: dupeGroups.length,
                        wouldMark: losers.length,
                        committed: 0,
                        songsMirrored: 0,
                        groups: dupeGroups,
                        dryRun: false,
                        threshold,
                        coverage,
                    },
                },
                "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
            )
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
            wouldMark: losers.length,
            // F-005: on dryRun nothing is written; on a committed real-run
            // every loser is marked, so committed == wouldMark.
            committed: dryRun ? 0 : losers.length,
            songsMirrored,
            groups: dupeGroups,
            dryRun,
            threshold,
            coverage,
        }
    } catch (err) {
        logger.warn("[mcp] dedupe_library_index failed:", err)
        return richError(
            "internal_error",
            "Failed to run library_index dedupe.",
            { tool: "dedupe_library" },
            "Retry; if the failure persists check the Firestore project / IAM.",
        )
    }
}

/* ─────────────────────────────────────────────────────────────────────────
 * backfill_library_index — one-shot index-row hygiene (cycle-2 DATA-001)
 *
 * Cycle-2 cleanup found ~80% of `library_index` rows with `fileSize:null`
 * and a long tail of rows whose `name` carried leading/trailing whitespace
 * (which had already manifested as duplicate F-019 rows). Going forward,
 * the Drive sync now strips names + persists Drive `size` at write time
 * (sync-engine.ts), but the existing population needs a one-shot cleanup.
 *
 * Per-row decision rules:
 *  - **name:** if `name.trim() !== name`, propose write of the trimmed
 *    name + `nameLower = trimmed.toLowerCase()`. Empty after trim → leave
 *    untouched (no row should ever have a wholly-whitespace name; if
 *    one does, that's a deeper bug — surface in the report).
 *  - **fileSize:** if currently null/missing, try to hydrate. Probe
 *    Firebase Storage at the canonical `library/{fileId}` path and the
 *    `.pdf` / `.xml` / `.heic` / `.jpg` / `.png` extension variants
 *    (mirrors the existing download path's permissiveness). Use the
 *    first Storage object whose `getMetadata()` resolves with a numeric
 *    size. If no Storage object exists, leave `fileSize` null (the row
 *    is Drive-only and the Drive `size` field landed via the sync-engine
 *    write fix going forward — no need to fetch from Drive here, since
 *    the next sync tick will hydrate it).
 *
 * Defaults dryRun:true per [[feedback_dryrun_is_observability]] — the
 * caller MUST pass `force: true` to actually write. dryRun returns the
 * full report (which rows would change, before/after values) without
 * needing force.
 *
 * Admin-only at the registration layer (auth gate in index.ts).
 * ───────────────────────────────────────────────────────────────────────── */

export interface BackfillLibraryIndexArgs {
    /** When true (default), do not write — return the plan only. F-05. */
    dryRun?: boolean
    /** Required for writes. Refuses to write without `force: true`. */
    force?: boolean
}

export interface BackfillRowDelta {
    fileId: string
    /** Reason this row was selected — one row can have multiple deltas. */
    changes: Array<
        | { field: "name"; from: string; to: string }
        | { field: "nameLower"; from: string | null; to: string }
        | { field: "fileSize"; from: null; to: number; source: "storage" }
    >
}

export interface BackfillLibraryIndexResult {
    scanned: number
    rowsChanged: number
    namesNormalized: number
    fileSizesHydrated: number
    /** Rows that needed fileSize but no Storage object was found. */
    fileSizesUnresolved: number
    /** Per-row diff plan. Up to 500 rows (truncated in the report if larger). */
    deltas: BackfillRowDelta[]
    deltasTruncated: boolean
    dryRun: boolean
    /** Cycle-3 DATA-002 — uniform hygiene scan coverage. */
    coverage: HygieneCoverage
}

const STORAGE_PROBE_EXTENSIONS = ["", ".pdf", ".xml", ".heic", ".jpg", ".jpeg", ".png"]
const BACKFILL_STORAGE_PROBE_CONCURRENCY = 6
const BACKFILL_DELTA_REPORT_CAP = 500

async function probeStorageFileSize(
    bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>,
    fileId: string,
): Promise<number | null> {
    for (const ext of STORAGE_PROBE_EXTENSIONS) {
        const path = `library/${fileId}${ext}`
        try {
            const [meta] = await bucket.file(path).getMetadata()
            const sz = typeof meta.size === "string" ? Number.parseInt(meta.size, 10)
                : typeof meta.size === "number" ? meta.size
                : NaN
            if (Number.isFinite(sz) && sz > 0) return sz
        } catch {
            // 404 / not-found is expected for most extension probes; continue.
        }
    }
    return null
}

export async function backfillLibraryIndex(
    uid: string,
    args: BackfillLibraryIndexArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<BackfillLibraryIndexResult | RichErrorEnvelope> {
    // Default to dryRun. Caller must explicitly opt OUT of dryRun (via
    // dryRun:false) AND opt IN to writes (via force:true). Same posture
    // as dedupe_library_index.
    const dryRun = args.dryRun !== false
    const force = args.force === true

    try {
        initAdmin()
        const db = getFirestore()

        // Admin gate. Dry-run + real-run both require admin — this tool
        // exposes the entire library_index shape and is exclusively a
        // maintenance affordance, not a read-anywhere browse path.
        const userSnap = await db.collection("users").doc(uid).get()
        const role = userSnap.exists
            ? (userSnap.data()?.role as string | undefined)
            : undefined
        if (role !== "admin") {
            return richError(
                "forbidden_role",
                "backfill_library_index is admin-only.",
                {
                    callerRole: role ?? null,
                    requiredRoles: ["admin"],
                },
                "Ask an admin to elevate your account, or call a tool your role is allowed to use.",
            )
        }

        if (!dryRun && !force) {
            // Cycle-3 REG-003: real-run without force returns the rich
            // `force_required` envelope carrying the dry-run plan in
            // extras. F-05 standing rule preserved.
            // L1-W3: the org MUST ride along, or a non-crc caller hitting the
            // force_required branch gets a crc-scoped plan back in the envelope.
            const planOnly = await backfillLibraryIndex(
                uid,
                { dryRun: true },
                org,
            )
            if ("ok" in planOnly && planOnly.ok === false) return planOnly
            return richError(
                "force_required",
                "Pass force:true to commit backfill_library_index writes.",
                {
                    dryRunPlan: planOnly as BackfillLibraryIndexResult,
                },
                "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
            )
        }
        const bucketName =
            process.env.FIREBASE_STORAGE_BUCKET ||
            `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
        const bucket = getStorage().bucket(bucketName)

        const snap = await db.collection("library_index").get()

        // v11-02-02 tenant isolation — L1-W3, Daniel's call 2026-09-01.
        // The hygiene tools scanned the RAW collection while list_library
        // filtered by rowOrg, which is exactly why they reported 943 against
        // the browse's 891: the 52-row gap was another tenant's rows, and a
        // force-run would have written to them (7 of the 8 groups in the live
        // plan on 2026-09-01 were entirely another org's charts). Scoped here
        // so all four hygiene tools' `coverage` agrees with the browse — which
        // is what cycle-3 DATA-002 built that uniform field for.
        const orgDocs = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)

        interface Candidate {
            fileId: string
            rawName: string | null
            cleanName: string | null
            currentNameLower: string | null
            currentFileSize: number | null
            currentStatus: string
        }

        const candidates: Candidate[] = orgDocs.map((d) => {
            const data = d.data()
            const rawName =
                typeof data.name === "string"
                    ? data.name
                    : typeof data.title === "string"
                      ? data.title
                      : null
            const cleanName = rawName ? rawName.trim() : null
            return {
                fileId: d.id,
                rawName,
                cleanName: cleanName && cleanName.length > 0 ? cleanName : rawName,
                currentNameLower:
                    typeof data.nameLower === "string" ? data.nameLower : null,
                currentFileSize:
                    typeof data.fileSize === "number" ? data.fileSize : null,
                currentStatus:
                    typeof data.status === "string" ? data.status : "active",
            }
        })

        // Cycle-3 DATA-002 — coverage filteredOut tracks rows skipped from
        // fileSize hydration (orphaned + duplicate) AND rows skipped from
        // name normalization (empty rawName). The scan visits every row;
        // backfill only skips on specific deltas, not on whole-row inclusion,
        // so eligible === total here.
        const filteredByStatus: Record<string, number> = {}
        const filteredByOther: Record<string, number> = {}
        for (const c of candidates) {
            if (
                c.currentFileSize === null &&
                (c.currentStatus === "orphaned" ||
                    c.currentStatus === "duplicate")
            ) {
                filteredByStatus[c.currentStatus] =
                    (filteredByStatus[c.currentStatus] ?? 0) + 1
            }
            if (c.rawName === null) {
                filteredByOther.missing_name =
                    (filteredByOther.missing_name ?? 0) + 1
            }
        }

        // Compute name deltas in-memory; queue fileSize probes for rows
        // whose `fileSize` is null. Skip orphaned rows for fileSize
        // hydration — they have no Storage object by definition.
        const fileSizeQueue: Candidate[] = []
        const deltas: BackfillRowDelta[] = []
        let namesNormalized = 0

        for (const c of candidates) {
            const changes: BackfillRowDelta["changes"] = []
            if (
                c.rawName !== null &&
                c.cleanName !== null &&
                c.rawName !== c.cleanName &&
                c.cleanName.length > 0
            ) {
                changes.push({ field: "name", from: c.rawName, to: c.cleanName })
                const desiredLower = c.cleanName.toLowerCase()
                if (c.currentNameLower !== desiredLower) {
                    changes.push({
                        field: "nameLower",
                        from: c.currentNameLower,
                        to: desiredLower,
                    })
                }
                namesNormalized++
            }
            if (
                c.currentFileSize === null &&
                c.currentStatus !== "orphaned" &&
                c.currentStatus !== "duplicate"
            ) {
                fileSizeQueue.push(c)
            }
            if (changes.length > 0) {
                deltas.push({ fileId: c.fileId, changes })
            }
        }

        // Probe Storage for fileSize candidates. Bounded concurrency so
        // a 250-row run doesn't fan out to 250 GCS requests at once.
        let fileSizesHydrated = 0
        let fileSizesUnresolved = 0
        const sizeMap = new Map<string, number>()
        for (let i = 0; i < fileSizeQueue.length; i += BACKFILL_STORAGE_PROBE_CONCURRENCY) {
            const batch = fileSizeQueue.slice(i, i + BACKFILL_STORAGE_PROBE_CONCURRENCY)
            const results = await Promise.all(
                batch.map(async (c) => ({
                    fileId: c.fileId,
                    size: await probeStorageFileSize(bucket, c.fileId),
                })),
            )
            for (const { fileId, size } of results) {
                if (size !== null) {
                    sizeMap.set(fileId, size)
                    fileSizesHydrated++
                } else {
                    fileSizesUnresolved++
                }
            }
        }

        // Fold fileSize deltas into the report. Find-or-create the row
        // entry so a row with both name + size deltas reports one block.
        for (const c of fileSizeQueue) {
            const sz = sizeMap.get(c.fileId)
            if (sz === undefined) continue
            let row = deltas.find((d) => d.fileId === c.fileId)
            if (!row) {
                row = { fileId: c.fileId, changes: [] }
                deltas.push(row)
            }
            row.changes.push({
                field: "fileSize",
                from: null,
                to: sz,
                source: "storage",
            })
        }

        const rowsChanged = deltas.length

        const coverage: HygieneCoverage = {
            total: candidates.length,
            eligible: candidates.length,
            scanned: candidates.length,
            filteredOut: {
                byStatus: filteredByStatus,
                byCollection: {},
                byOther: filteredByOther,
            },
        }

        if (dryRun) {
            const reportDeltas = deltas.slice(0, BACKFILL_DELTA_REPORT_CAP)
            return {
                scanned: candidates.length,
                rowsChanged,
                namesNormalized,
                fileSizesHydrated,
                fileSizesUnresolved,
                deltas: reportDeltas,
                deltasTruncated: deltas.length > BACKFILL_DELTA_REPORT_CAP,
                dryRun: true,
                coverage,
            }
        }

        // Apply writes — batched, idempotent. Firestore caps at 500
        // writes per batch; one row may produce one write (we collapse
        // name + nameLower + fileSize into one update per fileId).
        const BATCH_MAX = 400
        const ops: Array<{
            ref: FirebaseFirestore.DocumentReference
            data: Record<string, unknown>
        }> = []
        for (const row of deltas) {
            const data: Record<string, unknown> = {}
            for (const change of row.changes) {
                if (change.field === "name") data.name = change.to
                else if (change.field === "nameLower") data.nameLower = change.to
                else if (change.field === "fileSize") data.fileSize = change.to
            }
            if (Object.keys(data).length > 0) {
                ops.push({
                    ref: db.collection("library_index").doc(row.fileId),
                    data,
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

        const reportDeltas = deltas.slice(0, BACKFILL_DELTA_REPORT_CAP)
        return {
            scanned: candidates.length,
            rowsChanged,
            namesNormalized,
            fileSizesHydrated,
            fileSizesUnresolved,
            deltas: reportDeltas,
            deltasTruncated: deltas.length > BACKFILL_DELTA_REPORT_CAP,
            dryRun: false,
            coverage,
        }
    } catch (err) {
        logger.warn("[mcp] backfill_library_index failed:", err)
        return richError(
            "server_error",
            "Failed to run library_index backfill.",
            { tool: "backfill_library_index" },
            "Retry; if the failure persists check Firestore + Storage IAM and the [mcp] logs.",
        )
    }
}
