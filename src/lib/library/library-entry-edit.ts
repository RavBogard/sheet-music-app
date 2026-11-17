/**
 * Operator edit of one `library_index` row — the write behind the
 * `edit_library_entry` MCP tool.
 *
 * Applies caller-supplied edits (title, collection, key, bpm, leadMusician,
 * tags, setting, part) to the row. A title edit recomputes all the W-02 name
 * fields and stamps `humanRenamedAt`. The row is stamped
 * `enrichmentStatus: 'human_curated'` with reviewedAt/reviewedBy: that marker
 * is what keeps `backfill_library_keys` from overwriting a row a person
 * curated.
 *
 * This used to be `editEnrichment` in `review-queue.ts`, alongside the AI
 * enrichment review actions. The AI enrichment layer is gone; this edit path
 * is the part people still use.
 *
 * Reads + writes go through the Admin SDK because `firestore.rules` blocks
 * browser access to `library_index`.
 */

import "server-only"
import type { Firestore } from "firebase-admin/firestore"

import { normalizeChartTitle } from "@/lib/library/normalize-chart-title"
import { recomputeIndexNameFields } from "@/lib/library/recompute-index-name-fields"
import { partGroupFor, settingPartWriteFields } from "@/lib/library/setting-part"
import { bareStem } from "@/lib/mcp/title-specificity"
import { KNOWN_COLLECTIONS } from "@/lib/library/collections"

const ALLOWED_COLLECTIONS = KNOWN_COLLECTIONS
export type LibraryCollection = (typeof ALLOWED_COLLECTIONS)[number]

export interface EditPayload {
    title?: string
    /** Library collection. Only an operator sets it here. */
    collection?: LibraryCollection
    key?: string
    bpm?: number | null
    leadMusician?: string
    tags?: string[]
    /** Setlist memory: whose setting this chart is ("Friedman", "trad"); null clears. */
    setting?: string | null
    /** Setlist memory: instrument part ("Bb", "Tenor Saxophone"); null clears. */
    part?: string | null
}

export type EditResult =
    | { ok: true; rowId: string; status: "human_curated" }
    | {
          ok: false
          code: "row_not_found" | "invalid_field"
          message: string
      }

export async function applyLibraryEntryEdit(
    db: Firestore,
    rowId: string,
    edits: EditPayload,
    actorUid: string,
): Promise<EditResult> {
    const ref = db.collection("library_index").doc(rowId)
    const snap = await ref.get()
    if (!snap.exists) {
        return {
            ok: false,
            code: "row_not_found",
            message: `library_index row "${rowId}" not found.`,
        }
    }

    const data = snap.data() ?? {}
    const update: Record<string, unknown> = {
        enrichmentStatus: "human_curated",
        enrichmentReviewedAt: new Date().toISOString(),
        enrichmentReviewedBy: actorUid,
    }
    if (edits.title !== undefined) {
        // C4-007: route operator edits through `normalizeChartTitle` so
        // a stray leading space or NBSP run cannot fork the dedupe bucket.
        const t = normalizeChartTitle(edits.title)
        if (!t) {
            return {
                ok: false,
                code: "invalid_field",
                message: "title cannot be empty when supplied.",
            }
        }
        // F-7 W-02 recompute: write all four derivatives off the new title +
        // sibling count under the new stem (excluding self and orphans).
        const newStem = bareStem(t)
        const siblingSnap = newStem
            ? await db
                  .collection("library_index")
                  .where("stem", "==", newStem)
                  .select("stem", "name", "status")
                  .get()
            : null
        const existingSiblings = siblingSnap
            ? siblingSnap.docs.filter(
                  (d) =>
                      d.id !== rowId &&
                      (d.data().status as string | undefined) !==
                          "orphaned",
              )
            : []
        const siblingsInCatalog = existingSiblings.length + 1
        const w02 = recomputeIndexNameFields(t, siblingsInCatalog)
        update.name = t
        update.nameLower = w02.nameLower
        update.normalizedName = w02.normalizedName
        update.stem = w02.stem
        update.titleSpecificity = w02.titleSpecificity
        Object.assign(update, settingPartWriteFields(t, data))
        update.humanRenamedAt = new Date().toISOString()
    }
    if (edits.collection !== undefined) {
        if (!ALLOWED_COLLECTIONS.includes(edits.collection)) {
            return {
                ok: false,
                code: "invalid_field",
                message: `collection must be one of: ${ALLOWED_COLLECTIONS.join(", ")}`,
            }
        }
        update.collection = edits.collection
    }
    if (edits.key !== undefined) {
        update.key = edits.key
    }
    if (edits.bpm !== undefined) {
        if (edits.bpm === null) {
            update.bpm = null
        } else if (typeof edits.bpm === "number" && edits.bpm > 0) {
            update.bpm = edits.bpm
        } else {
            return {
                ok: false,
                code: "invalid_field",
                message: "bpm must be a positive number or null.",
            }
        }
    }
    if (edits.leadMusician !== undefined) {
        update.leadMusician = edits.leadMusician
    }
    if (edits.setting !== undefined || edits.part !== undefined) {
        // A person's own setting/part: recorded as human so no back-fill or
        // rename recompute ever overwrites it. partGroup follows the title.
        const title =
            typeof update.name === "string"
                ? update.name
                : (typeof data.name === "string" && data.name) ||
                  (typeof data.title === "string" && data.title) ||
                  rowId
        if (edits.setting !== undefined) {
            update.setting = edits.setting === null ? null : edits.setting.trim() || null
        }
        if (edits.part !== undefined) {
            update.part = edits.part === null ? null : edits.part.trim() || null
        }
        update.partGroup = partGroupFor(title)
        update.settingSource = "human"
    }
    if (edits.tags !== undefined) {
        if (!Array.isArray(edits.tags) || edits.tags.some((t) => typeof t !== "string")) {
            return {
                ok: false,
                code: "invalid_field",
                message: "tags must be an array of strings.",
            }
        }
        update.tags = edits.tags
    }

    await ref.update(update)
    return { ok: true, rowId, status: "human_curated" }
}
