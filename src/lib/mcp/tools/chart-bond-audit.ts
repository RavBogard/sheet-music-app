import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"

/**
 * setlist-fixes Lane B (Bug 1 + Bug 4 + UX-7) — catch WRONG/STALE bonds before
 * they reach the band.
 *
 * `verify_setlist_charts` (library-verify.ts) checks only byte-HEALTH: is the
 * chart reachable? It never asks whether the reachable chart is the RIGHT song.
 * Daniel cloned May 2 → Shavuot Yizkor and the clone silently carried bad bonds
 * ("Barchu" bonded to "Ahava Raba.pdf", "Hallelujah Jam" to a "Tu Bishvat"
 * chart) — every one perfectly reachable, every one the wrong song. The manual
 * `flag_bond` / `review_flagged_bonds` loop (bond-corrections.ts) only helps
 * once the agent already SUSPECTS a row; there was no automatic detector.
 *
 * `review_chart_bonds(setlistId)` compares each bonded track's song TITLE
 * against the bonded chart's raw FILENAME (`library_index/{fileId}.name`, the
 * field sync-engine writes from the Drive/Storage file name — confirmed
 * library.ts:236,384-387 + sync-engine.ts:258) and flags rows where the two
 * share too little. Read-only — it reports; remediation stays with the existing
 * `swap_chart` / `record_bond_correction` tools.
 *
 * `auditBondedRows` is also reused by `clone_setlist` to surface a
 * `bondReviewCount` on every clone, and `detectOccasionTokens` powers the
 * clone's `staleMetadataCandidates` hint.
 *
 * Auth/rate-limit: read-only, no role gate, `api` tier with trusted-leader
 * bypass — mirrors `verify_setlist_charts`.
 */

/**
 * Below this Jaccard token-overlap ratio a (title, filename) pair is flagged as
 * a likely mismatch. Deliberately conservative: it must flag obvious cases
 * ("Barchu" vs "Ahava Raba" → overlap 0) while NEVER flagging legitimate
 * arranger/variant suffixes ("Hineh Ma Tov" vs "Hineh_Ma_Tov_Lev.pdf" →
 * overlap 0.75). A compact-substring rescue (below) additionally clears
 * separator-free filenames like "AdonOlam.pdf" before the ratio is consulted.
 */
const MISMATCH_OVERLAP_THRESHOLD = 0.34

/**
 * Lowercase + NFKD diacritic-fold + strip punctuation (apostrophes/quotes/parens
 * — Hebrew transliterations are full of them: "Sh'ma", "D'var", "(Frankel)") +
 * collapse [_\s-] runs to a single space + trim. A close cousin of library.ts's
 * private `normalizeForSearch` (:315-322), kept file-local so this lane never
 * edits library.ts — Lane D owns it.
 */
function normalize(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9_\s\-]/g, "")
        .replace(/[_\s\-]+/g, " ")
        .trim()
}

/** Strip a trailing file extension (`.pdf`, `.png`, `.musicxml`, …). */
function stripExtension(name: string): string {
    return name.replace(/\.[a-z0-9]{1,8}$/i, "")
}

export interface BondComparison {
    /** 0..1 Jaccard token overlap (1 when one compacted string contains the other). */
    overlapScore: number
    /** True iff overlapScore < {@link MISMATCH_OVERLAP_THRESHOLD}. */
    mismatch: boolean
}

/**
 * Compare a song title against a bonded chart filename. Returns a token-overlap
 * score + a conservative mismatch verdict. Never flags when either side is
 * empty (can't judge ⇒ never false-positive).
 */
export function compareTitleToFilename(
    title: string,
    chartFileName: string,
): BondComparison {
    const t = normalize(title)
    const f = normalize(stripExtension(chartFileName))
    if (!t || !f) return { overlapScore: 0, mismatch: false }

    // Compact-substring rescue: a separator-free filename ("AdonOlam.pdf") or a
    // filename that fully contains the title ("Shalom_Rav_Frankel.pdf" ⊇
    // "Shalom Rav") is a clean bond regardless of token count.
    const tCompact = t.replace(/ /g, "")
    const fCompact = f.replace(/ /g, "")
    if (fCompact.includes(tCompact) || tCompact.includes(fCompact)) {
        return { overlapScore: 1, mismatch: false }
    }

    const tTokens = new Set(t.split(" "))
    const fTokens = new Set(f.split(" "))
    let intersection = 0
    for (const tok of tTokens) if (fTokens.has(tok)) intersection++
    const union = new Set([...tTokens, ...fTokens]).size
    const overlapScore = union === 0 ? 0 : intersection / union
    return {
        overlapScore: Number(overlapScore.toFixed(3)),
        mismatch: overlapScore < MISMATCH_OVERLAP_THRESHOLD,
    }
}

export interface ChartBondAuditRow {
    trackId: string
    title: string
    fileId: string
    /** `library_index/{fileId}.name`, or null when the row has no catalog entry. */
    chartFileName: string | null
    overlapScore: number
    mismatch: boolean
}

export interface ChartBondAuditSummary {
    rows: ChartBondAuditRow[]
    mismatchCount: number
}

/**
 * Shared fan-out: for each bonded row, read `library_index/{fileId}.name` and
 * compare it to the track title. Rows whose fileId has no catalog entry get
 * `chartFileName: null` + `mismatch: false` (a missing catalog row is a
 * byte-health concern for `verify_setlist_charts`, not a wrong-song concern).
 * Reused by `review_chart_bonds` and `clone_setlist`.
 */
export async function auditBondedRows(
    db: FirebaseFirestore.Firestore,
    bonded: Array<{ trackId: string; title: string; fileId: string }>,
): Promise<ChartBondAuditSummary> {
    if (bonded.length === 0) return { rows: [], mismatchCount: 0 }

    const uniqueFileIds = [...new Set(bonded.map((b) => b.fileId))]
    const snaps = await Promise.all(
        uniqueFileIds.map((fid) =>
            db.collection("library_index").doc(fid).get(),
        ),
    )
    const nameByFileId = new Map<string, string | null>()
    uniqueFileIds.forEach((fid, i) => {
        const data = snaps[i].exists
            ? (snaps[i].data() as Record<string, unknown>)
            : null
        const name = data?.name
        nameByFileId.set(fid, typeof name === "string" && name ? name : null)
    })

    const rows: ChartBondAuditRow[] = bonded.map((b) => {
        const chartFileName = nameByFileId.get(b.fileId) ?? null
        const cmp = chartFileName
            ? compareTitleToFilename(b.title, chartFileName)
            : { overlapScore: 0, mismatch: false }
        return {
            trackId: b.trackId,
            title: b.title,
            fileId: b.fileId,
            chartFileName,
            overlapScore: cmp.overlapScore,
            mismatch: cmp.mismatch,
        }
    })
    return { rows, mismatchCount: rows.filter((r) => r.mismatch).length }
}

/**
 * FU-c12-4 — a single cloned row flagged as a likely title/filename mismatch,
 * carried on a clone response so the caller can target a `swap_chart` /
 * `review_chart_bonds` follow-up by `position` or `trackId` WITHOUT re-fetching
 * the clone + re-deriving the mismatch. `chartFileName` + `overlapScore` ARE the
 * structured "why" (lower overlap = worse). `mismatch:true` is implicit (every
 * entry is a flagged row), so it's dropped from the shape.
 */
export interface BondReviewRow {
    /** 0-based `order` of the row in the CLONED setlist (targets swap_chart/update_track). */
    position: number
    /** Fresh trackId in the CLONE (NOT the source id) — target follow-ups here. */
    trackId: string
    title: string
    fileId: string
    /** `library_index/{fileId}.name`, or null when the row has no catalog entry. */
    chartFileName: string | null
    /** 0..1 Jaccard token overlap between title and chart filename (lower = worse). */
    overlapScore: number
}

/**
 * Project a {@link ChartBondAuditSummary} down to just the mismatched rows,
 * enriched with each row's `position` (0-based `order`) in the cloned setlist.
 * Shared by `clone_setlist` and `clone_setlist_from_template` so the projection
 * lives in one place. `positionByTrackId` maps each CLONE-side trackId → order;
 * a trackId absent from the map resolves to -1 (defensive — shouldn't happen
 * since the map is built from the same newTrackIds the audit ran over).
 */
export function toBondReviewRows(
    audit: ChartBondAuditSummary,
    positionByTrackId: Map<string, number>,
): BondReviewRow[] {
    return audit.rows
        .filter((r) => r.mismatch)
        .map((r) => ({
            position: positionByTrackId.get(r.trackId) ?? -1,
            trackId: r.trackId,
            title: r.title,
            fileId: r.fileId,
            chartFileName: r.chartFileName,
            overlapScore: r.overlapScore,
        }))
}

// ─── occasion-token detection (clone staleMetadataCandidates) ────────────────

/**
 * Occasion-specific tokens that, when carried verbatim into a clone, are likely
 * STALE — they belonged to the source service's date, not the new one. Parsha
 * (Torah-portion) names + major holidays. Multi-word entries are matched as a
 * substring of the normalized text; single-word entries as a whole token (so
 * short parshiot like "bo"/"emor" don't substring-match inside other words).
 */
const OCCASION_TERMS: readonly string[] = [
    // Parshiot (Torah portions)
    "bereshit", "noach", "lech lecha", "vayera", "chayei sarah", "toldot",
    "vayetzei", "vayishlach", "vayeshev", "miketz", "vayigash", "vayechi",
    "shemot", "vaera", "bo", "beshalach", "yitro", "mishpatim", "terumah",
    "tetzaveh", "ki tisa", "vayakhel", "pekudei", "vayikra", "tzav", "shmini",
    "tazria", "metzora", "achrei mot", "kedoshim", "emor", "behar",
    "bechukotai", "bamidbar", "naso", "behaalotcha", "shlach", "korach",
    "chukat", "balak", "pinchas", "matot", "masei", "devarim", "vaetchanan",
    "eikev", "reeh", "shoftim", "ki teitzei", "ki tavo", "nitzavim",
    "vayelech", "haazinu", "vezot haberachah",
    // Holidays / liturgical occasions
    "rosh hashanah", "yom kippur", "kol nidre", "neilah", "sukkot",
    "shmini atzeret", "simchat torah", "chanukah", "hanukkah", "tu bishvat",
    "purim", "pesach", "passover", "shavuot", "tisha bav", "yom hashoah",
    "yom haatzmaut", "lag baomer", "selichot", "yizkor",
]

/** Gregorian month names — a date token in copied metadata is a staleness signal. */
const MONTH_TOKENS: readonly string[] = [
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
]

const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/
const PARSHA_KEYWORDS = new Set(["parashat", "parsha", "parashah", "parshat"])

/**
 * Return the occasion-specific tokens present in `text` (parsha/holiday names,
 * a "parashat" keyword, gregorian month names, or an ISO date). Empty array
 * when none — the caller treats a non-empty result as a stale-metadata hint.
 * The ISO-date check runs on the RAW text (normalize() would collapse the
 * dashes away).
 */
export function detectOccasionTokens(text: string): string[] {
    if (typeof text !== "string" || !text.trim()) return []
    const norm = normalize(text)
    const tokens = new Set(norm.split(" "))
    const hits = new Set<string>()

    for (const term of OCCASION_TERMS) {
        if (term.includes(" ")) {
            if (norm.includes(term)) hits.add(term)
        } else if (tokens.has(term)) {
            hits.add(term)
        }
    }
    for (const m of MONTH_TOKENS) if (tokens.has(m)) hits.add(m)
    for (const kw of PARSHA_KEYWORDS) if (tokens.has(kw)) hits.add("parashat")
    if (ISO_DATE_RE.test(text)) hits.add("<iso-date>")

    return [...hits]
}

// ─── review_chart_bonds tool ─────────────────────────────────────────────────

async function readLeaderRole(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<"admin" | "band_leader" | "other"> {
    const snap = await db.collection("users").doc(uid).get()
    const role = snap.exists
        ? (snap.data()?.role as string | undefined)
        : undefined
    if (role === "admin") return "admin"
    if (role === "band_leader") return "band_leader"
    return "other"
}

export interface ReviewChartBondsArgs {
    setlistId: string
}

export interface ReviewChartBondsResult {
    ok: true
    setlistId: string
    trackCount: number
    bondedCount: number
    mismatchCount: number
    rows: ChartBondAuditRow[]
}

export async function reviewChartBonds(
    uid: string,
    args: ReviewChartBondsArgs,
): Promise<ReviewChartBondsResult | RichErrorEnvelope> {
    if (!args.setlistId?.trim())
        return richError(
            "invalid_argument",
            "setlistId must be a non-empty string.",
            { field: "setlistId" },
        )

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited)
        return richError(
            "rate_limited",
            limited.error,
            undefined,
            "Retry after the cooldown window.",
        )

    const setlistDoc = await db.collection("setlists").doc(args.setlistId).get()
    if (!setlistDoc.exists)
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    const setlistData = setlistDoc.data() as Record<string, unknown>

    const tracks = await getTracksForSetlist(db, args.setlistId, setlistData)
    const bonded = tracks
        .map((t) => t as unknown as Record<string, unknown>)
        .filter((r) => typeof r.fileId === "string" && r.fileId)
        .map((r) => ({
            trackId: String(r.id ?? ""),
            title: typeof r.title === "string" ? r.title : "",
            fileId: r.fileId as string,
        }))

    const audit = await auditBondedRows(db, bonded)

    logger.info("[mcp] review_chart_bonds", {
        setlistId: args.setlistId,
        trackCount: tracks.length,
        bondedCount: bonded.length,
        mismatchCount: audit.mismatchCount,
    })

    return {
        ok: true,
        setlistId: args.setlistId,
        trackCount: tracks.length,
        bondedCount: bonded.length,
        mismatchCount: audit.mismatchCount,
        rows: audit.rows,
    }
}
