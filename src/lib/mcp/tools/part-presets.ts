import "server-only"

import JSZip from "jszip"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { fetchFileById } from "@/lib/file-fetcher"
import { forbiddenRoleEnvelope, richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { readTenantRole } from "@/lib/org/access"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { visibleTo } from "@/lib/library/visibility"
import { logger } from "@/lib/logger"
import {
    hasVocalRangeName,
    matchPartIndices,
    normalizePartName,
    partPresetDocId,
    type PartPresetScope,
} from "@/lib/music/part-presets"

/**
 * PERF-15 — leader presets for which parts of a multi-part MusicXML chart an
 * iPad shows by default. `set_part_preset` writes (F-05: dryRun by default,
 * real write needs `dryRun:false, force:true`); `list_part_presets` reads.
 *
 * A preset's scope is a person (uid) or an instrument; it holds part-name
 * patterns, matched case-insensitively and loosely at view time. The preset
 * never picks a part nobody named: no match means the full score.
 * Tenant-scoped: the doc id and `orgId` carry the org, every read filters on it.
 */

type DB = FirebaseFirestore.Firestore

const COLLECTION = "part_presets"
const MAX_PATTERNS = 12
const MAX_PATTERN_LEN = 60
const MAX_PREVIEW_FILES = 25
const MAX_XML_BYTES = 25 * 1024 * 1024
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/
const FILE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const MAX_INSTRUMENT_LEN = 40

export interface SetPartPresetArgs {
    /** Exactly one of `uid` / `instrument`. */
    uid?: string
    instrument?: string
    /** Part-name patterns. At least one non-blank pattern unless `remove` is true. */
    patterns?: string[]
    /** Explicitly remove the preset for this scope (the only way to remove one). */
    remove?: boolean
    /** Charts to preview the preset against (dry run only reports; nothing is written either way). */
    fileIds?: string[]
    dryRun?: boolean
    force?: boolean
}

export interface PartPreviewRow {
    fileId: string
    chartName: string | null
    parts: string[]
    selected: string[]
    /** True when nothing matched, so the chart opens as the full score. */
    fullScore: boolean
    note?: string
    /** Set when a vocal-range word (Soprano/Alto/Tenor/Bass) is involved: check the match by hand. */
    check?: string
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

function decodeEntities(s: string): string {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&amp;/g, "&")
}

/** Part names from `<part-list>` of a MusicXML document, in score order. */
export function partNamesFromXml(xml: string): string[] {
    const out: string[] = []
    const list = /<part-list[\s\S]*?<\/part-list>/.exec(xml)?.[0] ?? ""
    for (const m of list.matchAll(/<score-part\b[\s\S]*?<\/score-part>/g)) {
        const name = /<part-name\b[^>]*>([\s\S]*?)<\/part-name>/.exec(m[0])?.[1]
        out.push(name ? decodeEntities(name).trim() : "")
    }
    return out
}

/** Part names from uncompressed MusicXML bytes or a compressed .mxl. */
export async function partNamesFromBytes(buf: Buffer): Promise<string[]> {
    if (buf.length > MAX_XML_BYTES) return []
    if (buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b) {
        const zip = await JSZip.loadAsync(buf)
        let rootPath: string | null = null
        const container = zip.file("META-INF/container.xml")
        if (container) {
            const c = await container.async("string")
            rootPath = /<rootfile\b[^>]*full-path="([^"]+)"/.exec(c)?.[1] ?? null
        }
        const entry =
            (rootPath ? zip.file(rootPath) : null) ??
            zip.file(/^(?!META-INF\/).*\.(xml|musicxml)$/i)[0] ??
            null
        return entry ? partNamesFromXml(await entry.async("string")) : []
    }
    return partNamesFromXml(buf.toString("utf8"))
}

async function leaderGate(db: DB, uid: string, org: OrgId): Promise<RichErrorEnvelope | null> {
    const role = await readTenantRole(db, uid, org)
    if (role === "admin" || role === "band_leader") return null
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin", "band_leader"],
        message: "Part presets are set by an admin or band leader.",
        hint: "Ask an admin or band leader to set the preset.",
    })
}

function cleanPatterns(raw: unknown): string[] | RichErrorEnvelope {
    if (!Array.isArray(raw)) {
        return richError("invalid_argument", "`patterns` must be a list of part names.", { field: "patterns" })
    }
    const seen = new Set<string>()
    const out: string[] = []
    for (const p of raw) {
        if (typeof p !== "string") {
            return richError("invalid_argument", "`patterns` must be a list of strings.", { field: "patterns" })
        }
        const s = str(p)
        if (!s) continue
        if (s.length > MAX_PATTERN_LEN) {
            return richError("invalid_argument", `A pattern is longer than ${MAX_PATTERN_LEN} characters.`, { field: "patterns" })
        }
        const key = normalizePartName(s)
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(s)
    }
    if (raw.length > 0 && out.length === 0) {
        return richError(
            "invalid_argument",
            "Every pattern is blank. Name at least one part, or pass `remove: true` to remove the preset.",
            { field: "patterns" },
        )
    }
    if (out.length > MAX_PATTERNS) {
        return richError("invalid_argument", `At most ${MAX_PATTERNS} patterns.`, { field: "patterns" })
    }
    return out
}

async function previewRows(
    db: DB,
    org: OrgId,
    fileIds: string[],
    patterns: string[],
): Promise<PartPreviewRow[]> {
    const rows: PartPreviewRow[] = []
    for (const fileId of fileIds) {
        const snap = await db.collection("library_index").doc(fileId).get()
        const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
        // A chart another tenant owns answers exactly like a missing one.
        if (!data || !visibleTo(data, org)) {
            rows.push({ fileId, chartName: null, parts: [], selected: [], fullScore: true, note: "chart_not_found" })
            continue
        }
        const chartName = str(data.name) ?? str(data.title)
        try {
            const fetched = await fetchFileById(fileId, str(data.mimeType) ?? undefined)
            const parts = fetched ? await partNamesFromBytes(fetched.buffer) : []
            if (parts.length < 2) {
                rows.push({
                    fileId,
                    chartName,
                    parts,
                    selected: [],
                    fullScore: true,
                    note: parts.length === 1 ? "single_part_no_picker" : "not_multipart_musicxml",
                })
                continue
            }
            const hit = matchPartIndices(parts, patterns)
            const selected = hit.map((i) => parts[i])
            const vocal = patterns.some(hasVocalRangeName) || selected.some(hasVocalRangeName)
            rows.push({
                fileId,
                chartName,
                parts,
                selected,
                fullScore: hit.length === 0,
                ...(vocal
                    ? { check: "A vocal-range name (Soprano, Alto, Tenor or Bass) is involved: confirm it picks the part you mean, not the instrument of the same name." }
                    : {}),
            })
        } catch (err) {
            logger.warn("[mcp] part preset preview failed", { fileId, err: err instanceof Error ? err.message : err })
            rows.push({ fileId, chartName, parts: [], selected: [], fullScore: true, note: "read_failed" })
        }
    }
    return rows
}

export async function setPartPresetTool(
    uid: string,
    args: SetPartPresetArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<Record<string, unknown> | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const denied = await leaderGate(db, uid, org)
    if (denied) return denied

    const targetUid = str(args.uid)
    const instrument = str(args.instrument)
    if ((targetUid ? 1 : 0) + (instrument ? 1 : 0) !== 1) {
        return richError(
            "invalid_argument",
            "Pass exactly one of `uid` (a person) or `instrument`.",
            { fields: ["uid", "instrument"] },
            "Use find_user to get a uid, or name an instrument such as 'bass'.",
        )
    }
    if (targetUid && !UID_RE.test(targetUid)) {
        return richError("invalid_argument", "`uid` has unexpected characters.", { field: "uid" }, "Use the uid from find_user.")
    }
    if (instrument && instrument.length > MAX_INSTRUMENT_LEN) {
        return richError("invalid_argument", `\`instrument\` is longer than ${MAX_INSTRUMENT_LEN} characters.`, { field: "instrument" })
    }
    const remove = args.remove === true
    let patterns: string[] = []
    if (remove) {
        if (Array.isArray(args.patterns) && args.patterns.length > 0) {
            return richError("invalid_argument", "Pass `remove: true` without `patterns`.", { fields: ["remove", "patterns"] })
        }
    } else {
        if (!Array.isArray(args.patterns) || args.patterns.length === 0) {
            return richError(
                "invalid_argument",
                "Pass at least one part name in `patterns`, or `remove: true` to remove the preset.",
                { field: "patterns" },
            )
        }
        const cleaned = cleanPatterns(args.patterns)
        if (!Array.isArray(cleaned)) return cleaned
        patterns = cleaned
    }

    const scope: PartPresetScope = targetUid
        ? { kind: "user", uid: targetUid }
        : { kind: "instrument", instrument: instrument as string }
    const docId = partPresetDocId(org, scope)

    try {
        const rawIds = args.fileIds ?? []
        if (!Array.isArray(rawIds) || rawIds.length > MAX_PREVIEW_FILES || rawIds.some((f) => typeof f !== "string" || !FILE_ID_RE.test(f))) {
            return richError(
                "invalid_argument",
                `\`fileIds\` must be at most ${MAX_PREVIEW_FILES} plain chart ids.`,
                { field: "fileIds" },
                "Use fileIds from search_library or list_library.",
            )
        }
        const fileIds = rawIds as string[]
        const ref = db.collection(COLLECTION).doc(docId)
        const prior = await ref.get()
        const priorData = prior.exists ? (prior.data() as Record<string, unknown>) : null
        // A same-id doc stamped for another org is never touched.
        if (priorData && priorData.orgId !== org) {
            return richError("preset_not_found", "No preset to change in this congregation.", { docId })
        }
        const preview = remove ? [] : await previewRows(db, org, fileIds, patterns)
        const plan = {
            scope,
            patterns,
            action: remove ? (priorData ? "remove" : "none") : priorData ? "replace" : "create",
            previous: priorData ? (priorData.patterns ?? null) : null,
            preview,
        }

        const dryRun = args.dryRun !== false
        if (dryRun) return { ok: true, dryRun: true, ...plan }
        if (args.force !== true) {
            return richError(
                "force_required",
                "Pass force:true to write the part preset.",
                { dryRunPlan: plan },
                "Re-call with `dryRun: false, force: true` to commit, or `dryRun: true` to inspect.",
            )
        }

        if (remove) {
            if (priorData) await ref.delete()
        } else {
            await ref.set({
                orgId: org,
                scope,
                patterns,
                updatedAt: new Date().toISOString(),
                updatedBy: uid,
            })
        }
        logger.info("[mcp] set_part_preset committed", { uid, org, docId, action: plan.action })
        return { ok: true, dryRun: false, ...plan }
    } catch (err) {
        logger.error("[mcp] set_part_preset failed", { err: err instanceof Error ? err.message : err })
        return richError("part_preset_failed", "Could not read or write the part preset.", {}, "Retry; nothing was written if this was a dry run.")
    }
}

export async function listPartPresetsTool(
    uid: string,
    args: { uid?: string; instrument?: string },
    org: OrgId = DEFAULT_ORG_ID,
): Promise<Record<string, unknown> | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const denied = await leaderGate(db, uid, org)
    if (denied) return denied
    return listPresetsForOrg(db, org, args)
}

/** Org-scoped read, split out so the tenant wall can be tested without auth. */
export async function listPresetsForOrg(
    db: DB,
    org: OrgId,
    filter: { uid?: string; instrument?: string } = {},
): Promise<{ ok: true; presets: Record<string, unknown>[] }> {
    const snap = await db.collection(COLLECTION).where("orgId", "==", org).get()
    const wantUid = str(filter.uid)
    const wantInstrument = str(filter.instrument)
    const presets: Record<string, unknown>[] = []
    snap.forEach((d) => {
        const data = d.data() as { orgId?: string; scope?: { kind?: string; uid?: string; instrument?: string }; patterns?: unknown; updatedAt?: unknown }
        // Belt and braces: the query filters on orgId, and so does this.
        if (data.orgId !== org || !data.scope) return
        if (wantUid && data.scope.uid !== wantUid) return
        if (wantInstrument && normalizePartName(data.scope.instrument ?? "") !== normalizePartName(wantInstrument)) return
        presets.push({ scope: data.scope, patterns: data.patterns ?? [], updatedAt: data.updatedAt ?? null })
    })
    return { ok: true, presets }
}
