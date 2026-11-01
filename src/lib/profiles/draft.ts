import { isSongType } from "@/lib/setlist-track-count"
import { SERVICE_TYPE_CATALOG } from "@/lib/templates/service-types"
import type { LibraryLite } from "@/lib/history/song-history"
import { settingOf, STALE_WEEKS, type FilledNote, type FilledReason } from "./readback"
import { cleanLabel, type Promotion, type SlotTier, type Tier } from "./tiers"

/**
 * Setlist memory, release 2 — a draft of one service from its profile. Pure.
 *
 * A song slot is filled only at tier `standard` or `usual`; every other song
 * slot is drafted open (no chart) with its label kept as the title, and
 * listed in `openIndexes`. Non-song rows (headers, readings…) copy as they
 * are. Each row keeps a template-shaped `track` so the setlist is written by
 * the same path clone_setlist_from_template uses.
 */

/** Drafts live this long; create_setlist_from_draft refuses an older one. */
export const DRAFT_TTL_MS = 30 * 60 * 1000

/** The template row fields a draft keeps for the setlist it becomes. */
const TRACK_FIELDS = [
    "type",
    "title",
    "key",
    "bpm",
    "leadMusician",
    "referenceLink",
    "notes",
    "songId",
    "fileId",
    "fileName",
    "performer",
    "description",
    "estimatedMinutes",
    "liturgyRef",
    "liturgyRefs",
    "momentId",
    "fixed",
] as const

/** Fields that belong to the chart; an open slot carries none of them. */
const CHART_FIELDS = ["fileId", "fileName", "songId", "key", "leadMusician", "bpm"] as const

export interface DraftRow {
    index: number
    label: string
    type: string
    slotKey: string | null
    fileId?: string
    chartName?: string
    key?: string | null
    /** The key the chart is written in, when known (filled rows). */
    writtenKey?: string | null
    leadMusician?: string | null
    /** Song rows only; null on headers and other non-song rows. */
    tier: Tier | null
    phrase: string | null
    promotion?: Promotion
    /** True when the row was filled from its tier (standard or usual). */
    filled: boolean
    /**
     * Open slots only (MCP-06): the exact chart this slot had last time (or at
     * another service). Recall, never a fill: a choice may say `useRecall`.
     */
    recall?: Recall
    /** MCP-14: the per-part charts of the slot, from the profile row. */
    parts?: Array<{ fileId: string; chartName: string; title: string }>
    /** Template-shaped row the setlist track is written from. */
    track: Record<string, unknown>
}

export interface Recall {
    fileId: string
    chartName: string
    key: string | null
    date: string | null
    /** The service it was played at (a catalog label). */
    service: string | null
}

export interface DraftProfileRow {
    index: number
    type: string
    title: string
    slotKey: string | null
    track: Record<string, unknown>
    tier?: SlotTier
    standing?: { leadMusician: string | null } | null
    /** The profile's service label, for a last_time recall. */
    service?: string | null
    /** The other service's label, for an other_service recall. */
    otherService?: string | null
}

/** True for a holiday service type: such a draft is special unless the author says otherwise. */
export function defaultSpecial(serviceType: string): boolean {
    return SERVICE_TYPE_CATALOG.some((e) => e.key === serviceType && e.category === "holiday")
}

function pickTrack(src: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const f of TRACK_FIELDS) {
        const v = src[f]
        if (v !== undefined && v !== null) out[f] = v
    }
    return out
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

/** Draft rows from a profile's rows and their live tiers. */
export function buildDraftRows(
    rows: DraftProfileRow[],
    /** The service day of an ISO event date (the tenant's zone); UTC day when absent. */
    dayOf: (iso: string) => string = (iso) => iso.slice(0, 10),
): DraftRow[] {
    return rows.map((r) => {
        const track = pickTrack(r.track)
        // A stored row may carry a file name for a title ("Sim_shalom.pdf"): say it clean.
        const label = cleanLabel(r.title) || r.title
        if (typeof track.title !== "string") track.title = label
        else track.title = cleanLabel(track.title) || track.title
        if (!isSongType(r.type)) {
            return { index: r.index, label, type: r.type, slotKey: r.slotKey, tier: null, phrase: null, filled: false, track }
        }
        track.type = "song"
        const tier = r.tier
        const fills = !!tier && (tier.tier === "standard" || tier.tier === "usual") && !!tier.fileId
        const sameChart = fills && str(r.track.fileId) === tier!.fileId
        for (const f of CHART_FIELDS) {
            // A filled row keeps the template's lead and song bond only when the
            // template row already names the same chart.
            if (fills && sameChart && (f === "leadMusician" || f === "songId" || f === "bpm")) continue
            delete track[f]
        }
        const row: DraftRow = {
            index: r.index,
            label,
            type: "song",
            slotKey: r.slotKey,
            tier: tier?.tier ?? "new",
            phrase: tier?.phrase ?? null,
            filled: fills,
            track,
        }
        if (tier?.promotion) row.promotion = tier.promotion
        const parts = Array.isArray(r.track.parts) ? (r.track.parts as DraftRow["parts"]) : undefined
        if (parts && parts.length > 1) row.parts = parts
        if (!fills) {
            if (tier && (tier.tier === "last_time" || tier.tier === "other_service") && tier.fileId && !tier.dead) {
                row.recall = {
                    fileId: tier.fileId,
                    chartName: tier.chartName ?? tier.fileId,
                    key: tier.key ?? null,
                    date: tier.lastDate ? dayOf(tier.lastDate) : null,
                    service: r.service ?? null,
                }
                if (tier.tier === "other_service") row.recall.service = r.otherService ?? null
            }
            return row
        }
        track.fileId = tier!.fileId
        if (tier!.chartName) track.fileName = tier!.chartName
        if (tier!.key) track.key = tier!.key
        if (tier!.tier === "standard" && r.standing?.leadMusician) track.leadMusician = r.standing.leadMusician
        row.fileId = tier!.fileId
        row.chartName = tier!.chartName
        row.key = tier!.key ?? null
        row.leadMusician = str(track.leadMusician)
        return row
    })
}

export interface DraftWarning {
    kind: "existing" | "dead_chart" | "key_mismatch"
    index: number | null
    text: string
}

function isMusicXmlChart(lib: LibraryLite): boolean {
    return /xml/i.test(lib.mimeType ?? "") || /\.(musicxml|mxl|xml)$/i.test(lib.name)
}

/**
 * Record each filled row's written key and list the warnings a draft carries:
 * `dead_chart` for a filled chart that is orphaned or archived, `key_mismatch`
 * when the played key differs from the key a non-MusicXML chart is written in.
 * Warnings only: nothing is changed or blocked.
 */
export function annotateCharts(rows: DraftRow[], library: Map<string, LibraryLite>): DraftWarning[] {
    const warnings: DraftWarning[] = []
    for (const r of rows) {
        if (!r.fileId) continue
        const lib = library.get(r.fileId)
        if (!lib) continue
        r.writtenKey = lib.key ?? null
        const name = cleanLabel(r.chartName ?? lib.name)
        if (lib.status === "orphaned" || lib.status === "archived") {
            warnings.push({ kind: "dead_chart", index: r.index, text: `${r.label}: ${name} is ${lib.status}, so it may not open. Pick another chart.` })
        }
        const played = r.key?.trim()
        const written = lib.key?.trim()
        if (played && written && played.toLowerCase() !== written.toLowerCase() && !isMusicXmlChart(lib)) {
            warnings.push({
                kind: "key_mismatch",
                index: r.index,
                text: `${r.label}: played in ${played}, but the chart is written in ${written}.`,
            })
        }
    }
    return warnings
}

export function openIndexesOf(rows: DraftRow[]): number[] {
    return rows.filter((r) => r.type === "song" && !r.filled).map((r) => r.index)
}

export interface DraftChoice {
    index: number
    /** MCP-06: use the open row's `recall` chart (and its key unless `key` is given). */
    useRecall?: boolean
    fileId?: string
    key?: string
    leadMusician?: string
    standing?: boolean
    quote?: string
}

export interface ChartInfo {
    name: string
    partGroup: string | null
}

export interface StandingRequest {
    index: number
    slotKey: string
    fileId: string
    chartName: string
    key: string | null
    partGroup: string | null
    leadMusician: string | null
    quote: string | null
}

export type ApplyChoicesResult =
    | { ok: true; rows: DraftRow[]; oneOff: string[]; standing: StandingRequest[] }
    | { ok: false; code: "invalid_argument" | "chart_not_found" | "no_chart" | "no_recall"; message: string; index: number }

/**
 * Apply the author's choices to the draft rows. A choice names a song row by
 * index; `fileId` must be a chart this tenant can see (`charts`). A choice
 * with `standing: true` is returned in `standing` to be remembered; any other
 * choice that changes the chart or key of a filled row is a one-off, listed
 * as `"{chart} in {key}"` (just `"{chart}"` when the key is not on record).
 */
export function applyChoices(
    rows: DraftRow[],
    choices: DraftChoice[],
    charts: Map<string, ChartInfo>,
): ApplyChoicesResult {
    const out = rows.map((r) => ({ ...r, track: { ...r.track } }))
    const oneOff: string[] = []
    const standing: StandingRequest[] = []
    for (const c of choices) {
        const row = Number.isInteger(c.index) ? out[c.index] : undefined
        if (!row || row.type !== "song") {
            return { ok: false, code: "invalid_argument", message: `Choice index ${c.index} is not a song row of the draft.`, index: c.index }
        }
        const before = { fileId: str(row.track.fileId), key: str(row.track.key) }
        let fileId = str(c.fileId)
        let recallKey: string | null = null
        if (c.useRecall === true && !fileId) {
            if (!row.recall) {
                return { ok: false, code: "no_recall", message: `Row ${c.index} has no earlier chart to reuse.`, index: c.index }
            }
            fileId = row.recall.fileId
            recallKey = row.recall.key
        }
        if (fileId) {
            const chart = charts.get(fileId)
            if (!chart) {
                return { ok: false, code: "chart_not_found", message: `Chart '${fileId}' is not in this library.`, index: c.index }
            }
            if (fileId !== before.fileId) {
                delete row.track.songId
                delete row.track.bpm
                // A different chart does not inherit the old chart's key.
                if (!str(c.key)) delete row.track.key
            }
            row.track.fileId = fileId
            row.track.fileName = chart.name
            row.fileId = fileId
            row.chartName = chart.name
        }
        const key = str(c.key) ?? recallKey
        if (key) row.track.key = key
        const lead = str(c.leadMusician)
        if (lead) row.track.leadMusician = lead
        row.key = str(row.track.key)
        row.leadMusician = str(row.track.leadMusician)

        const after = { fileId: str(row.track.fileId), key: str(row.track.key) }
        const chartName = row.chartName ?? str(row.track.fileName) ?? row.label
        if (c.standing === true) {
            if (!after.fileId) {
                return { ok: false, code: "no_chart", message: `Row ${c.index} has no chart, so there is nothing to keep.`, index: c.index }
            }
            standing.push({
                index: c.index,
                slotKey: row.slotKey ?? `song:${row.label}`,
                fileId: after.fileId,
                chartName,
                key: after.key,
                partGroup: charts.get(after.fileId)?.partGroup ?? null,
                leadMusician: row.leadMusician ?? null,
                quote: str(c.quote),
            })
        } else if (row.filled && (after.fileId !== before.fileId || after.key !== before.key)) {
            oneOff.push(after.key ? `${chartName} in ${after.key}` : chartName)
        }
    }
    return { ok: true, rows: out, oneOff, standing }
}

/**
 * MCP-04, "fill it but say it": why a filled row is worth hearing. The usual
 * is older than STALE_WEEKS before the service; the latest regular service
 * played something else; the key is not on record; or the profile was learned
 * from one service only. No reasons: the row stays folded.
 */
export function filledNoteFor(
    tier: SlotTier | undefined,
    serviceDate: string,
    learnedCount: number | null,
    /** The service day of an ISO date in the tenant's zone; UTC day when absent. */
    dayOf: (iso: string) => string = (iso) => iso.slice(0, 10),
): FilledNote | undefined {
    if (!tier || (tier.tier !== "usual" && tier.tier !== "standard") || !tier.fileId) return undefined
    const reasons: FilledReason[] = []
    if (tier.differsFromLast) {
        reasons.push({
            kind: "differs",
            date: dayOf(tier.differsFromLast.date),
            setting: settingOf(tier.differsFromLast.chartName, tier.differsFromLast.setting),
        })
    }
    if (tier.tier === "usual" && tier.lastDate) {
        const lastDay = dayOf(tier.lastDate)
        const age = Date.parse(`${serviceDate}T12:00:00Z`) - Date.parse(`${lastDay}T12:00:00Z`)
        if (age > STALE_WEEKS * 7 * 86_400_000) reasons.push({ kind: "stale", date: lastDay })
    }
    if (!tier.keyOnRecord) reasons.push({ kind: "no_key" })
    if (learnedCount === 1) reasons.push({ kind: "single" })
    return { tier: tier.tier, setting: settingOf(tier.chartName, tier.setting), key: tier.key ?? null, reasons }
}

/** The note read back when one-off changes were made to filled rows. */
export function oneOffNoteFor(changes: string[], noun: "week" | "show" = "week"): string | undefined {
    if (changes.length === 0) return undefined
    return `${changes.join(", ")} ${changes.length === 1 ? "is" : "are"} just for this ${noun}. Say "keep it" to make ${changes.length === 1 ? "it" : "them"} standard.`
}
