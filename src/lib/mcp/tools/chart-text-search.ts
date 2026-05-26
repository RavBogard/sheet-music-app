import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import {
    richError,
    forbiddenRoleEnvelope,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { loadUploader } from "./uploader-roles"

/**
 * `search_chart_text` — F4 Tier-1 (Option A+ ratify 2026-05-26) +
 * F4 Tier-2 `f4-lyric-search-persistence-mod` (2026-05-26).
 *
 * Substring search across the PERSISTED text surfaces of the chart
 * library. Four scopes:
 *
 *  - `metadata` (default): `library_index/{id}.{title, nameLower}` plus
 *    `aiSuggestion.{suggested_title, suggested_lead, suggested_tags,
 *    concerns}`. Surfaces canonical titles, AI-proposed aliases, vocal-
 *    lead annotations, kebab-case tags, and AI prose concerns.
 *  - `chords`: `collectionGroup('chordData')` substring scan on
 *    `chords[].text` / `chords[].originalText`. Enables "find every
 *    chart that uses Bm7b5 somewhere" — a surface Daniel + David don't
 *    have today.
 *  - `lyrics`: substring scan on `library_index/{id}.searchableText` —
 *    the lowercased + whitespace-normalized chart body extracted at PCU
 *    write time (PDF via pdfjs, TXT verbatim, MusicXML via the
 *    `<lyric><text>` walker). Lets Daniel find a chart by remembered
 *    lyric text ("the chart with 'hineh ma tov'"). Rows without
 *    `searchableText` (image/audio/skipped/failed at extraction, or
 *    pre-backfill historical rows) skip cleanly. `backfill_searchable_text`
 *    heals historical rows.
 *  - `all`: union of all three.
 *
 * This tool also closes the silent-broken `/api/library/search-content`
 * HTTP endpoint — that route attempted the same `collectionGroup`
 * pattern but read three field names (`rawText`, `chords[].name`,
 * `sections[].label`) that NO writer in the codebase ever produces, so
 * it returned empty for any non-trivial query against production.
 *
 * Role gate: admin or band_leader. Mirrors the dispatch's intent that
 * full-text search is an authoring surface, not a public read.
 * `search_library` (title+key+bpm) remains role-ungated for the wider
 * member surface.
 */

/** Firestore read cap per scope — bounds latency + cost. */
export const SCAN_CAP = 1000

/** Default result limit when caller omits `limit`. */
export const DEFAULT_LIMIT = 20

/** Hard upper bound on result count — caller's `limit` is clamped. */
export const MAX_LIMIT = 100

/** Snippet context window: ±N characters around the match. */
export const SNIPPET_PADDING = 40

export type SearchScope = "metadata" | "chords" | "lyrics" | "all"

export interface SearchChartTextArgs {
    query: string
    limit?: number
    includeSnippets?: boolean
    scope?: SearchScope
}

export interface SearchChartTextMatch {
    /** library_index document id (also the fileId). */
    chartId: string
    /** Display title resolved from library_index. */
    title: string
    /** Which field produced the match — useful for UX context. */
    field:
        | "title"
        | "nameLower"
        | "aiSuggestion.suggested_title"
        | "aiSuggestion.suggested_lead"
        | "aiSuggestion.suggested_tags"
        | "aiSuggestion.concerns"
        | "chordData"
        | "searchableText"
    /** 1-indexed page number — populated only for `chordData` matches. */
    page?: number
    /** ±SNIPPET_PADDING chars around the match. Present when includeSnippets !== false. */
    snippet?: string
    /** Character offset of the match within `field` text. */
    matchPosition: number
}

export interface SearchChartTextResult {
    ok: true
    scope: SearchScope
    query: string
    results: SearchChartTextMatch[]
    /** Total docs scanned across all scopes touched by this call. */
    totalScanned: number
    /**
     * True if more matches likely exist beyond the returned set —
     * either because (a) the result limit truncated, or (b) the
     * underlying Firestore scan hit `SCAN_CAP`.
     */
    capped: boolean
}

export async function searchChartText(
    uid: string,
    args: SearchChartTextArgs,
): Promise<SearchChartTextResult | RichErrorEnvelope> {
    const query = (args.query ?? "").trim()
    if (!query) {
        return richError(
            "invalid_argument",
            "query is required and must be non-empty.",
            { field: "query" },
        )
    }

    const limit =
        args.limit && args.limit > 0
            ? Math.min(args.limit, MAX_LIMIT)
            : DEFAULT_LIMIT
    const scope: SearchScope = args.scope ?? "metadata"
    const includeSnippets = args.includeSnippets !== false

    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (roles.role !== "admin" && roles.role !== "band_leader") {
        return forbiddenRoleEnvelope({
            callerRole: roles.role ?? null,
            requiredRoles: ["admin", "band_leader"],
            message:
                "search_chart_text requires admin or band_leader role.",
            hint:
                "Use search_library for title-only catalog search (no role gate), or ask an admin to elevate your account.",
        })
    }

    const needle = query.toLowerCase()
    const matches = new Map<string, SearchChartTextMatch>()
    let totalScanned = 0
    let scanCapped = false
    let limitTruncated = false

    // ─── metadata + lyrics scopes (shared library_index scan) ───────
    //
    // Both scopes scan the same `library_index` collection — metadata
    // matches against title/nameLower/aiSuggestion.* fields; lyrics
    // matches against the `searchableText` body persisted at PCU write
    // time by the f4-lyric-search-persistence-mod lane. Unified into ONE
    // loop so the `all` scope doesn't pay for two full collection
    // scans, and so a chart matched in metadata isn't re-scanned for
    // lyrics (priority order: title > nameLower > aiSug > searchableText).
    const includeMetadata = scope === "metadata" || scope === "all"
    const includeLyrics = scope === "lyrics" || scope === "all"
    if (includeMetadata || includeLyrics) {
        try {
            const snap = await db
                .collection("library_index")
                .limit(SCAN_CAP)
                .get()
            totalScanned += snap.size
            if (snap.size >= SCAN_CAP) scanCapped = true

            for (const doc of snap.docs) {
                if (matches.size >= limit) {
                    limitTruncated = true
                    break
                }
                const data = doc.data() as Record<string, unknown>
                const title = resolveTitle(data, doc.id)
                const candidates: Array<{
                    field: SearchChartTextMatch["field"]
                    text: string
                }> = []
                if (includeMetadata) {
                    pushString(candidates, "title", data.title)
                    pushString(candidates, "nameLower", data.nameLower)
                    const aiSug = data.aiSuggestion as
                        | Record<string, unknown>
                        | undefined
                    if (aiSug && typeof aiSug === "object") {
                        pushString(
                            candidates,
                            "aiSuggestion.suggested_title",
                            aiSug.suggested_title,
                        )
                        pushString(
                            candidates,
                            "aiSuggestion.suggested_lead",
                            aiSug.suggested_lead,
                        )
                        pushStringArray(
                            candidates,
                            "aiSuggestion.suggested_tags",
                            aiSug.suggested_tags,
                        )
                        pushStringArray(
                            candidates,
                            "aiSuggestion.concerns",
                            aiSug.concerns,
                        )
                    }
                }
                if (includeLyrics) {
                    // searchableText is already lowercase + normalized at
                    // write time, so the indexOf below sees a clean haystack
                    // (no per-call toLowerCase() needed on the field).
                    pushString(
                        candidates,
                        "searchableText",
                        data.searchableText,
                    )
                }
                for (const c of candidates) {
                    const idx = c.text.toLowerCase().indexOf(needle)
                    if (idx >= 0) {
                        matches.set(doc.id, {
                            chartId: doc.id,
                            title,
                            field: c.field,
                            matchPosition: idx,
                            ...(includeSnippets
                                ? {
                                      snippet: buildSnippet(
                                          c.text,
                                          idx,
                                          needle.length,
                                      ),
                                  }
                                : {}),
                        })
                        break // one hit per chart per scope
                    }
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            logger.warn(`[search_chart_text] library_index scan failed: ${message}`)
            return richError(
                "internal_error",
                `Search failed: ${message}`,
                { scope, query },
            )
        }
    }

    // ─── chords scope ───────────────────────────────────────────────
    if ((scope === "chords" || scope === "all") && matches.size < limit) {
        try {
            const snap = await db
                .collectionGroup("chordData")
                .limit(SCAN_CAP)
                .get()
            totalScanned += snap.size
            if (snap.size >= SCAN_CAP) scanCapped = true

            // Collect candidate chord matches keyed by parent fileId so
            // we can batch-fetch parent titles after the loop (avoids
            // N+1 round-trips against library_index).
            const candidates: Array<{
                fileId: string
                page: number | undefined
                idx: number
                haystack: string
            }> = []
            for (const cdoc of snap.docs) {
                if (matches.size + candidates.length >= limit) {
                    limitTruncated = true
                    break
                }
                const fileId = cdoc.ref.parent.parent?.id
                if (!fileId) continue
                if (matches.has(fileId)) continue // already matched via metadata
                const data = cdoc.data() as Record<string, unknown>
                const chords = Array.isArray(data.chords) ? data.chords : []
                const haystack = chords
                    .map((c) => {
                        if (typeof c !== "object" || c === null) return ""
                        const cc = c as Record<string, unknown>
                        const text =
                            typeof cc.text === "string" ? cc.text : ""
                        const orig =
                            typeof cc.originalText === "string"
                                ? cc.originalText
                                : ""
                        return text === orig ? text : `${text} ${orig}`.trim()
                    })
                    .filter(Boolean)
                    .join(" ")
                const idx = haystack.toLowerCase().indexOf(needle)
                if (idx < 0) continue
                const parsedPage = parseInt(
                    cdoc.id.replace(/^page_/, ""),
                    10,
                )
                candidates.push({
                    fileId,
                    page: Number.isFinite(parsedPage)
                        ? parsedPage + 1 // 0-indexed → 1-indexed
                        : undefined,
                    idx,
                    haystack,
                })
            }

            // Resolve display titles in one batch — avoids the N+1 the
            // broken `/api/library/search-content` had.
            if (candidates.length > 0) {
                const uniqueIds = Array.from(
                    new Set(candidates.map((c) => c.fileId)),
                )
                const refs = uniqueIds.map((id) =>
                    db.collection("library_index").doc(id),
                )
                const docs = await db.getAll(...refs)
                const titleByFileId = new Map<string, string>()
                for (const d of docs) {
                    if (!d.exists) continue
                    titleByFileId.set(
                        d.id,
                        resolveTitle(
                            d.data() as Record<string, unknown>,
                            d.id,
                        ),
                    )
                }
                for (const c of candidates) {
                    if (matches.has(c.fileId)) continue
                    if (matches.size >= limit) {
                        limitTruncated = true
                        break
                    }
                    matches.set(c.fileId, {
                        chartId: c.fileId,
                        title: titleByFileId.get(c.fileId) ?? c.fileId,
                        field: "chordData",
                        ...(c.page !== undefined ? { page: c.page } : {}),
                        matchPosition: c.idx,
                        ...(includeSnippets
                            ? {
                                  snippet: buildSnippet(
                                      c.haystack,
                                      c.idx,
                                      needle.length,
                                  ),
                              }
                            : {}),
                    })
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            logger.warn(`[search_chart_text] chords scan failed: ${message}`)
            return richError(
                "internal_error",
                `Chord-symbol search failed: ${message}`,
                { scope, query },
            )
        }
    }

    return {
        ok: true,
        scope,
        query,
        results: Array.from(matches.values()),
        totalScanned,
        capped: scanCapped || limitTruncated,
    }
}

function resolveTitle(data: Record<string, unknown>, fallback: string): string {
    if (typeof data.title === "string" && data.title) return data.title
    if (typeof data.name === "string" && data.name) return data.name
    return fallback
}

function pushString(
    out: Array<{ field: SearchChartTextMatch["field"]; text: string }>,
    field: SearchChartTextMatch["field"],
    v: unknown,
): void {
    if (typeof v === "string" && v.length > 0) out.push({ field, text: v })
}

function pushStringArray(
    out: Array<{ field: SearchChartTextMatch["field"]; text: string }>,
    field: SearchChartTextMatch["field"],
    v: unknown,
): void {
    if (!Array.isArray(v)) return
    const joined = v
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .join(" ")
    if (joined) out.push({ field, text: joined })
}

function buildSnippet(text: string, matchIdx: number, matchLen: number): string {
    const start = Math.max(0, matchIdx - SNIPPET_PADDING)
    const end = Math.min(text.length, matchIdx + matchLen + SNIPPET_PADDING)
    const prefix = start > 0 ? "..." : ""
    const suffix = end < text.length ? "..." : ""
    return `${prefix}${text.slice(start, end)}${suffix}`
}
