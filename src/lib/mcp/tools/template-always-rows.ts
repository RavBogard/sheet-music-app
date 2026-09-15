import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import type { SlotLiturgyRefs } from "@/lib/books/slot-liturgy"
import {
    alwaysRowFamilies,
    mergeAlwaysRowsWith,
    type AlwaysMergeAdapter,
    type AlwaysMergeNote,
} from "@/lib/templates/always-rows"
import { updateTemplate, type TemplateTrack } from "./templates"

/**
 * A-W3″, second half — `merge_always_rows_into_template`.
 *
 * The first half put Daniel's Always rows into the code templates. This puts
 * them into the FIRESTORE ones, which is where it counts: the four
 * `setlistTemplates` documents are overrides, and `getTemplate` prefers them
 * over the code defaults, so a template Daniel actually clones from never saw
 * the merge until now.
 *
 * STAGE, DIFF, COMMIT. `dryRun` defaults to true and returns the whole merged
 * track list plus a row-by-row account of what happened. A template is the one
 * place a wrong page lives for years without anyone noticing, so the default
 * posture is to show the work.
 *
 * WHAT IT PRESERVES. Everything. An Always moment the template already carries
 * as a song slot keeps its chart, its key, its vocal lead and its position —
 * it gains `liturgyRefs` and nothing else. Only a moment NO row named becomes
 * a new row, `fixed: true`, deletable per service like any other. That is the
 * narrowing Daniel ruled and the whole of it: rows are added for Always
 * moments, and for nothing else.
 */

const alwaysAdapter: AlwaysMergeAdapter<TemplateTrack> = {
    labelOf: (row) => (typeof row.title === "string" ? row.title : ""),
    typeOf: (row) => row.type,
    withRefs: (row, refs) => ({
        ...row,
        // Merge rather than replace: a template row may already carry the page
        // for a DIFFERENT book, and dropping it would un-bind the other book.
        liturgyRefs: { ...(row.liturgyRefs ?? {}), ...refs },
    }),
    make: (label, type, refs) => ({
        title: label,
        type,
        fixed: true,
        ...(refs ? { liturgyRefs: refs as SlotLiturgyRefs } : {}),
    }),
}

export interface MergeAlwaysRowsArgs {
    templateId: string
    /** `friday_night` or `shabbat_morning` — whose Always list to merge. */
    family: string
    dryRun?: boolean
}

export interface MergeAlwaysRowsResult {
    ok: true
    templateId: string
    family: string
    book: string | null
    dryRun: boolean
    rowsBefore: number
    rowsAfter: number
    inserted: number
    boundToExistingRow: number
    notes: AlwaysMergeNote[]
    /** The merged list, for the caller to read before committing. */
    tracks: TemplateTrack[]
    /** Present only on a real run. */
    changed?: boolean
    version?: number
}

export async function mergeAlwaysRowsIntoTemplate(
    uid: string,
    args: MergeAlwaysRowsArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<MergeAlwaysRowsResult | RichErrorEnvelope> {
    const templateId = args?.templateId?.trim()
    const family = args?.family?.trim()
    if (!templateId) {
        return richError(
            "invalid_argument",
            "templateId is required.",
            { templateId: templateId ?? null },
            "Pass a templateId from list_templates.",
        )
    }
    if (!family || !alwaysRowFamilies().includes(family)) {
        return richError(
            "unknown_family",
            `No Always-row list exists for family '${family ?? ""}'.`,
            { family: family ?? null, known: alwaysRowFamilies() },
            "Daniel confirmed Always rows for friday_night and shabbat_morning. A family with no list has nothing to merge — that is a ruling, not a gap.",
        )
    }

    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    const snap = await db.collection("setlistTemplates").doc(templateId).get()
    if (!snap.exists || rowOrg((snap.data() ?? {}).orgId) !== org) {
        return richError(
            "template_not_found",
            `Template '${templateId}' was not found.`,
            { templateId },
            "Verify the id via list_templates.",
        )
    }
    const before = (snap.data()?.tracks as TemplateTrack[] | undefined) ?? []

    const merged = mergeAlwaysRowsWith(before, family, alwaysAdapter)
    const dryRun = args.dryRun !== false

    const result: MergeAlwaysRowsResult = {
        ok: true,
        templateId,
        family,
        book: merged.book,
        dryRun,
        rowsBefore: before.length,
        rowsAfter: merged.rows.length,
        inserted: merged.notes.filter((n) => n.outcome === "inserted").length,
        boundToExistingRow: merged.notes.filter((n) => n.outcome === "bound-to-slot")
            .length,
        notes: merged.notes,
        tracks: merged.rows,
    }
    if (dryRun) return result

    const written = await updateTemplate(
        uid,
        { templateId, patch: { tracks: merged.rows } },
        org,
    )
    if (!("ok" in written) || written.ok !== true) return written
    return { ...result, changed: written.changed, version: written.version }
}
