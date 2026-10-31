import { computeSettingPartFields } from "@/lib/library/setting-part"

/**
 * Bet 2 — chart lineage, the pure half. A revised chart is a new
 * `library_index` row that carries the first version's fileId as `lineageId`
 * and the row it replaced as `supersedes`; the replaced row gets
 * `supersededBy`. The newest non-archived version of a lineage is its
 * current one. Nothing here touches Firestore.
 */

/** Hops followed along `supersededBy` before giving up (a guard against a cycle written by hand). */
export const MAX_LINEAGE_HOPS = 20

export interface LineageRow {
    supersededBy?: string | null
    status?: string | null
}

function isDead(row: LineageRow | undefined): boolean {
    return !!row && (row.status === "orphaned" || row.status === "archived")
}

/**
 * The lineage's current version for `fileId`: follow `supersededBy` to the
 * newest version, then take the newest one on that path that is not archived
 * or orphaned. A row with no newer version is its own current. When every
 * version on the path is dead, the newest one is returned (the caller's own
 * dead-chart rule then applies). Rows not in `lookup` end the walk.
 */
export function currentVersionOf(
    fileId: string,
    lookup: (id: string) => LineageRow | undefined,
): string {
    const path = [fileId]
    const seen = new Set(path)
    let cur = fileId
    for (let i = 0; i < MAX_LINEAGE_HOPS; i++) {
        const next = lookup(cur)?.supersededBy
        if (!next || seen.has(next) || !lookup(next)) break
        path.push(next)
        seen.add(next)
        cur = next
    }
    for (let i = path.length - 1; i >= 0; i--) {
        if (!isDead(lookup(path[i]))) return path[i]
    }
    return path[path.length - 1]
}

export interface LinkRow {
    id: string
    status?: unknown
    lineageId?: unknown
    supersedes?: unknown
    supersededBy?: unknown
}

function has(v: unknown): boolean {
    return typeof v === "string" && v.trim().length > 0
}

/**
 * Why `next` may not become the next version of `prev`, or null when it may.
 * `next` must be an active chart in no lineage yet, and not `prev` itself or
 * `prev`'s lineage root: that keeps every lineage a single chain, with no
 * cycle (A -> B -> A) and no merge of two lineages.
 */
export function linkRefusal(next: LinkRow, prev: LinkRow): string | null {
    if (next.id === prev.id) return "a chart cannot be a new version of itself"
    if (next.status !== "active") return "it is not an active chart"
    if (has(next.lineageId) || has(next.supersedes) || has(next.supersededBy)) return "it is already part of a version chain"
    if (prev.lineageId === next.id) return "it is an earlier version of that chart"
    return null
}

// ─── one key rule on a chart change (MCP-18) ───────────────────────────────

export interface ChartChangeKeyInput {
    /** The row's key before the change. */
    rowKey: string | null | undefined
    /** The written key of the chart the row had. */
    oldWrittenKey: string | null | undefined
    /** The written key of the chart the row gets. */
    newWrittenKey: string | null | undefined
    /** A key the author passed in this same call; it always wins. */
    explicitKey?: string | null
}

export interface ChartChangeKey {
    /** The row's key after the change. */
    key: string | null
    /** Why: the author passed it, the row's played key was the author's, or the new chart's written key. */
    source: "explicit" | "played" | "written" | "unchanged"
    keyChanged: { from: string | null; to: string | null } | null
}

function norm(k: string | null | undefined): string | null {
    return typeof k === "string" && k.trim() ? k.trim() : null
}

/**
 * On a chart change the row keeps its played key only when the author gave
 * one; otherwise it takes the new chart's written key. A row key that differs
 * from the old chart's written key is the author's (a played key). A row key
 * equal to it, or none, came from the chart, so the new chart's written key
 * replaces it. When the new chart has no written key on record, the row keeps
 * what it had rather than losing its key.
 */
export function chartChangeKey(input: ChartChangeKeyInput): ChartChangeKey {
    const from = norm(input.rowKey)
    let key: string | null
    let source: ChartChangeKey["source"]
    if (input.explicitKey !== undefined) {
        key = norm(input.explicitKey)
        source = "explicit"
    } else if (from !== null && from !== norm(input.oldWrittenKey)) {
        key = from
        source = "played"
    } else if (norm(input.newWrittenKey) !== null) {
        key = norm(input.newWrittenKey)
        source = "written"
    } else {
        key = from
        source = "unchanged"
    }
    return { key, source, keyChanged: key === from ? null : { from, to: key } }
}

// ─── back-fill: obvious siblings that are versions (MCP-10) ────────────────

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
/** Words and stamps that mark a newer copy of the same chart. */
const VERSION_MARKERS: RegExp[] = [
    /\(\s*updated(?:\s+pdf)?\s*\)/gi,
    /\bupdated\b/gi,
    /\bdraft\b/gi,
    /\bv\s?\d+\b/gi,
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
    new RegExp(String.raw`\b(?:${MONTHS})[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b`, "gi"),
]
const EXT_RE = /\.(pdf|musicxml|mxl|xml|txt|png|jpe?g|docx?)$/i

/** The title with every version marker removed. */
export function stripVersionMarkers(name: string): string {
    let s = name.replace(EXT_RE, "")
    for (const re of VERSION_MARKERS) s = s.replace(re, " ")
    return s
        .replace(/\(\s*\)/g, " ")
        .replace(/[\s_\-–—,]+$/g, "")
        .replace(/^[\s_\-–—,]+/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
}

/** True when the title carries a version marker. */
export function hasVersionMarker(name: string): boolean {
    const base = name.replace(EXT_RE, "").trim()
    return stripVersionMarkers(base).toLowerCase() !== base.replace(/\s{2,}/g, " ").toLowerCase()
}

export interface LineageCandidateRow {
    fileId: string
    name: string
    /** ISO upload time; the older row is the earlier version. */
    uploadedAt: string | null
    status: string | null
    partGroup: string | null
    lineageId: string | null
    supersedes: string | null
    supersededBy: string | null
}

export interface LineagePair {
    /** The earlier version. */
    from: { fileId: string; name: string; uploadedAt: string | null }
    /** The later version, which supersedes `from`. */
    to: { fileId: string; name: string; uploadedAt: string | null }
    /** The partGroup every version takes: the first version's own group. */
    partGroup: string
    /** The first version of the chain. */
    lineageId: string
}

export interface LineageProposal {
    pairs: LineagePair[]
    /** Groups left alone: two rows with one name, or a row with no upload time. */
    ambiguous: Array<{ partGroup: string; fileIds: string[]; reason: "same_name" | "no_upload_time" }>
}

/**
 * Propose lineage links for obvious siblings: active rows with no lineage yet
 * whose titles are the same chart once version markers ("v2", "updated",
 * "DRAFT", "(updated PDF)", a date) are removed, and differ only by those
 * markers. Rows chain oldest → newest by upload time. A group in which two
 * rows have the same title, or a row has no upload time, is reported, never
 * linked. Pure.
 */
export function proposeLineagePairs(rows: LineageCandidateRow[]): LineageProposal {
    const groups = new Map<string, LineageCandidateRow[]>()
    for (const r of rows) {
        if (r.status !== "active") continue
        if (r.lineageId || r.supersedes || r.supersededBy) continue
        if (!r.name.trim()) continue
        const stripped = stripVersionMarkers(r.name)
        if (!stripped) continue
        // One instrument copy per chain: "Barchu Eb v2" never follows "Barchu".
        const fields = computeSettingPartFields(stripped)
        if (!fields.partGroup) continue
        const group = `${fields.partGroup}|${fields.part ?? ""}`
        const list = groups.get(group)
        if (list) list.push(r)
        else groups.set(group, [r])
    }
    const pairs: LineagePair[] = []
    const ambiguous: LineageProposal["ambiguous"] = []
    for (const [group, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (list.length < 2) continue
        if (!list.some((r) => hasVersionMarker(r.name))) continue
        const names = new Set(list.map((r) => r.name.replace(EXT_RE, "").trim().toLowerCase()))
        if (names.size !== list.length) {
            ambiguous.push({ partGroup: group, fileIds: list.map((r) => r.fileId).sort(), reason: "same_name" })
            continue
        }
        if (list.some((r) => !r.uploadedAt || Number.isNaN(Date.parse(r.uploadedAt)))) {
            ambiguous.push({ partGroup: group, fileIds: list.map((r) => r.fileId).sort(), reason: "no_upload_time" })
            continue
        }
        const ordered = [...list].sort(
            (a, b) => Date.parse(a.uploadedAt!) - Date.parse(b.uploadedAt!) || a.fileId.localeCompare(b.fileId),
        )
        const root = ordered[0]
        const partGroup = root.partGroup ?? group.split("|")[0]
        for (let i = 1; i < ordered.length; i++) {
            const a = ordered[i - 1]
            const b = ordered[i]
            pairs.push({
                from: { fileId: a.fileId, name: a.name, uploadedAt: a.uploadedAt },
                to: { fileId: b.fileId, name: b.name, uploadedAt: b.uploadedAt },
                partGroup,
                lineageId: root.fileId,
            })
        }
    }
    return { pairs, ambiguous }
}
