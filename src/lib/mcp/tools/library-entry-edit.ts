import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { isPlatformOwner, readTenantRole } from "@/lib/org/access"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { writeAccess } from "@/lib/library/visibility-server"
import { recomputeRowVisibilitySafe } from "@/lib/library/visibility-job"
import { notOwnerError } from "@/lib/mcp/not-owner"
import {
    applyLibraryEntryEdit,
    type EditPayload,
} from "@/lib/library/library-entry-edit"
import { logger } from "@/lib/logger"
import { KNOWN_COLLECTIONS } from "@/lib/library/collections"

/**
 * `edit_library_entry` — operator edit of any `library_index` row.
 *
 * Auth: admin or band_leader in the caller's tenant (v11.5-01-03 H9);
 * `collection` stays admin-only. A band leader or tenant admin may only edit
 * a row its own tenant owns; a row another tenant owns and shares is refused
 * with `not_owner`; a row it cannot see reads as `row_not_found`. Only the
 * platform owner is unscoped.
 *
 * Write contract: F-05 — `dryRun` defaults true and returns the planned
 * patch; a real run without `force: true` returns the rich `force_required`
 * envelope; `dryRun: false, force: true` writes.
 *
 * This was the shared handler of `edit_enrichment` and its alias
 * `edit_library_entry` in `library-review.ts`; the AI review tools that lived
 * beside it are gone. Schema and response are unchanged.
 */

const ALLOWED_COLLECTIONS = KNOWN_COLLECTIONS
const ALLOWED_EDIT_FIELDS = new Set([
    "title",
    "collection",
    "key",
    "bpm",
    "leadMusician",
    "tags",
    "setting",
    "part",
])

interface EditorGateOk {
    ok: true
    db: FirebaseFirestore.Firestore
    role: string
}

async function assertLibraryEditor(
    uid: string,
    org: OrgId,
): Promise<EditorGateOk | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const role = await readTenantRole(db, uid, org)
    if (role === "admin" || role === "band_leader") {
        return { ok: true, db, role }
    }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin", "band_leader"],
        message: "Editing a library entry requires an admin or band leader account.",
        hint: "Ask an admin to elevate your account, or use the read-only library tools.",
    })
}

function hintFor(code: string): string {
    switch (code) {
        case "row_not_found":
            return "Pass a fileId from `list_library`, `search_library` or `get_song`."
        case "invalid_field":
            return "Adjust the `edits` payload to match the field constraints (title non-empty; collection ∈ core/supplemental/uploads/nava; bpm > 0 or null; tags string[])."
        default:
            return "Re-read the row with `get_song`, then retry."
    }
}

function requireRowId(rowId: unknown): RichErrorEnvelope | null {
    if (typeof rowId !== "string" || !rowId.trim()) {
        return richError(
            "invalid_argument",
            "rowId is required.",
            { rowId: rowId ?? null },
            "Pass a library_index id (the fileId from `list_library` or `search_library`).",
        )
    }
    return null
}

export interface EditLibraryEntryArgs {
    rowId: string
    edits: EditPayload
    dryRun?: boolean
    force?: boolean
}

export interface EditLibraryEntrySuccess {
    ok: true
    rowId: string
    /** Always 'human_curated' after an edit. */
    status: string
    dryRun: boolean
    plannedStatus: string
    plannedPatch?: Record<string, unknown>
}

export async function editLibraryEntry(
    uid: string,
    args: EditLibraryEntryArgs,
    org?: string,
): Promise<EditLibraryEntrySuccess | RichErrorEnvelope> {
    const gate = await assertLibraryEditor(uid, org ?? DEFAULT_ORG_ID)
    if (!gate.ok) return gate
    const bad = requireRowId(args?.rowId)
    if (bad) return bad

    const edits = (args?.edits ?? {}) as EditPayload
    const editValidation = validateEditPayload(edits)
    if (editValidation) return editValidation

    // v11.5-01-03 (H9): `collection` placement stays admin-only. Band leaders may
    // edit tags/title/key/bpm/leadMusician, but moving a chart between collections
    // is a curation-authority decision reserved for admins.
    if (gate.role !== "admin" && edits.collection !== undefined) {
        return richError(
            "forbidden_field",
            "collection is an admin-only field.",
            { field: "collection", callerRole: gate.role },
            "Band leaders may edit tags/title/key/bpm/leadMusician; ask an admin to change a chart's collection.",
        )
    }

    // v11.5-01-03 (H9): cross-tenant write wall. Mirrors update_song
    // (song-metadata.ts): a row belonging to another tenant is reported as
    // row_not_found so we never reveal it exists. Legacy rows with no orgId
    // resolve via rowOrg(undefined) → DEFAULT_ORG_ID (crc).
    //
    // Phase 5: a row another tenant OWNS and SHARES with the caller's tenant
    // (visible, not owned) is refused with `not_owner` for EVERY role, admins
    // included — writes stay OWNS.
    const orgWall = async (
        data: FirebaseFirestore.DocumentData | undefined,
    ): Promise<RichErrorEnvelope | null> => {
        if (org === undefined) return null
        const access = await writeAccess(data, org, args.rowId, gate.db)
        if (access.kind === "not_owner") return notOwnerError(access, args.rowId)
        // Phase 5 (security): only the PLATFORM OWNER is unscoped.
        if (await isPlatformOwner(uid, gate.db)) return null
        if (rowOrg(data?.orgId) !== org) {
            return richError(
                "row_not_found",
                `library_index row "${args.rowId}" not found.`,
                { rowId: args.rowId },
                hintFor("row_not_found"),
            )
        }
        return null
    }

    const readRowWithWall = async (): Promise<RichErrorEnvelope | null> => {
        const snap = await gate.db.collection("library_index").doc(args.rowId).get()
        if (!snap.exists) {
            return richError(
                "row_not_found",
                `library_index row "${args.rowId}" not found.`,
                { rowId: args.rowId },
                hintFor("row_not_found"),
            )
        }
        return orgWall(snap.data())
    }

    const plannedStatus = "human_curated"
    const plannedPatch = { ...edits } as Record<string, unknown>

    const refused = await readRowWithWall()
    if (refused) return refused

    if (args.dryRun !== false) {
        return {
            ok: true,
            rowId: String(args.rowId ?? ""),
            status: plannedStatus,
            plannedStatus,
            plannedPatch,
            dryRun: true,
        }
    }

    if (args.force !== true) {
        // Cycle-3 REG-003: real-run without force → rich force_required.
        return richError(
            "force_required",
            "Pass force:true to commit library-review writes.",
            {
                rowId: String(args.rowId ?? ""),
                dryRunPlan: { plannedStatus, plannedPatch },
            },
            "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
        )
    }

    // Re-check the wall at commit: commit may run without a prior dryRun
    // in the same request, so the tenancy check must not rely on dryRun.
    const refusedAtCommit = await readRowWithWall()
    if (refusedAtCommit) return refusedAtCommit

    const result = await applyLibraryEntryEdit(gate.db, args.rowId, edits, uid)
    if (!result.ok) {
        return richError(
            result.code,
            result.message,
            { rowId: args.rowId, edits },
            hintFor(result.code),
        )
    }
    logger.info("[mcp] edit_library_entry committed", {
        uid,
        rowId: args.rowId,
        fields: Object.keys(edits),
    })
    // Phase 5: a row moved between collections takes the new
    // collection's visibility (collectionId, visibleToOrgs, Storage).
    if (edits.collection !== undefined) await recomputeRowVisibilitySafe(args.rowId, { db: gate.db })
    return {
        ok: true,
        rowId: args.rowId,
        status: "human_curated",
        plannedStatus,
        plannedPatch,
        dryRun: false,
    }
}

function validateEditPayload(edits: EditPayload): RichErrorEnvelope | null {
    if (!edits || typeof edits !== "object") {
        return richError(
            "invalid_argument",
            "edits must be an object.",
            { edits: edits ?? null },
            hintFor("invalid_field"),
        )
    }
    const keys = Object.keys(edits)
    if (keys.length === 0) {
        return richError(
            "invalid_argument",
            "edits must include at least one field.",
            { edits },
            "Pass any subset of: title, collection, key, bpm, leadMusician, tags.",
        )
    }
    for (const k of keys) {
        if (!ALLOWED_EDIT_FIELDS.has(k)) {
            return richError(
                "invalid_field",
                `Unknown edit field "${k}".`,
                { field: k, allowed: [...ALLOWED_EDIT_FIELDS] },
                "Drop the unknown field and retry. The helper rejects unknown fields at write time too.",
            )
        }
    }
    if (edits.title !== undefined) {
        if (typeof edits.title !== "string" || !edits.title.trim()) {
            return richError(
                "invalid_field",
                "title cannot be empty when supplied.",
                { field: "title" },
                hintFor("invalid_field"),
            )
        }
    }
    if (edits.collection !== undefined) {
        if (!ALLOWED_COLLECTIONS.includes(edits.collection)) {
            return richError(
                "invalid_field",
                `collection must be one of: ${ALLOWED_COLLECTIONS.join(", ")}`,
                { field: "collection", allowed: [...ALLOWED_COLLECTIONS] },
                hintFor("invalid_field"),
            )
        }
    }
    if (edits.bpm !== undefined) {
        if (
            edits.bpm !== null &&
            !(typeof edits.bpm === "number" && edits.bpm > 0)
        ) {
            return richError(
                "invalid_field",
                "bpm must be a positive number or null.",
                { field: "bpm" },
                hintFor("invalid_field"),
            )
        }
    }
    for (const field of ["setting", "part"] as const) {
        const v = edits[field]
        if (v !== undefined && v !== null && typeof v !== "string") {
            return richError(
                "invalid_field",
                `${field} must be a string or null.`,
                { field },
                hintFor("invalid_field"),
            )
        }
    }
    if (edits.tags !== undefined) {
        if (
            !Array.isArray(edits.tags) ||
            edits.tags.some((t) => typeof t !== "string")
        ) {
            return richError(
                "invalid_field",
                "tags must be an array of strings.",
                { field: "tags" },
                hintFor("invalid_field"),
            )
        }
    }
    if (edits.key !== undefined && typeof edits.key !== "string") {
        return richError(
            "invalid_field",
            "key must be a string.",
            { field: "key" },
            hintFor("invalid_field"),
        )
    }
    if (
        edits.leadMusician !== undefined &&
        typeof edits.leadMusician !== "string"
    ) {
        return richError(
            "invalid_field",
            "leadMusician must be a string.",
            { field: "leadMusician" },
            hintFor("invalid_field"),
        )
    }
    return null
}
