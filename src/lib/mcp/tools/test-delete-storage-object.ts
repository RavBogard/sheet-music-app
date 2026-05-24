import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { fileExistsInStorage } from "@/lib/firebase-storage"
import { safelyDeleteLibraryObject } from "@/lib/library/safely-delete-library-object"
import { getStorage } from "firebase-admin/storage"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"

/**
 * `__test_delete_storage_object` — cycle-3 GAP-002 instrumentation MCP tool.
 *
 * Synthetic Storage-only delete used by cycle-N cowork probes to construct
 * the "Drive 200 + Storage 404 → health: needs_storage_sync" scenario
 * cycle-4 §7.B.1 needs to test substantively. Pre-GAP-002 the only
 * delete surface was `delete_chart`, which kills the library_index row
 * too — there was no way to produce the asymmetric state without manual
 * Firebase Console clicks.
 *
 * Why the underscore prefix: signals test-only surface. The tool is
 * NOT hidden from `tools/list` (operators should be able to see it
 * exists and what it does), but the underscore + the description's
 * explicit "Cycle-N cowork instrumentation only" warning make the
 * scope unmistakable.
 *
 * Hard guards (all must hold; refusal otherwise):
 *  1. fileId matches `/^upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`
 *     — Drive ids + any other synthetic id prefix → refused. Stops the
 *       tool from being weaponized against curated Drive bonds.
 *  2. library_index/{fileId} exists.
 *  3. library_index/{fileId}.isTest === true. SEC-004 (cycle-2 b2)
 *     stamps isTest on every test-fixture-owned row, so this gate
 *     prevents the tool from deleting Storage bytes of any real curated
 *     chart even if 1+2 are satisfied.
 *
 * On success: bucket file at the resolved Storage path is deleted.
 * The `library_index/{fileId}` row is UNTOUCHED (that's the point —
 * we want the row to keep claiming the fileId so the next
 * `verify_setlist_charts`/`get_chart_status` reads health from the
 * asymmetric state). Drive ref is irrelevant (upload-* ids have no
 * Drive backing).
 *
 * Role gate: admin only. band_leader is intentionally NOT trusted
 * for this tool — the destructive surface is admin-restricted even
 * inside the test namespace because mis-targeting an isTest:true row
 * still costs a re-upload to recover.
 *
 * F-05 N/A: there's no plan-vs-commit asymmetry — the operator's
 * intent is explicit ("create the synthetic-404 state"). No dryRun.
 */

const UPLOAD_UUID_RE =
    /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface TestDeleteStorageObjectArgs {
    fileId: string
}

export interface TestDeleteStorageObjectResult {
    ok: true
    fileId: string
    deletedPath: string
    libraryIndexUntouched: true
}

async function readCallerRole(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<string | null> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const r = snap.exists ? snap.data()?.role : undefined
        return typeof r === "string" ? r : null
    } catch (err) {
        logger.warn("[mcp] __test_delete_storage_object caller-role read failed", {
            uid,
            err,
        })
        return null
    }
}

export async function testDeleteStorageObject(
    callerUid: string,
    args: TestDeleteStorageObjectArgs,
): Promise<TestDeleteStorageObjectResult | RichErrorEnvelope> {
    if (!args.fileId?.trim())
        return richError(
            "invalid_argument",
            "fileId must be a non-empty string.",
            { field: "fileId" },
        )
    const fileId = args.fileId.trim()

    if (!UPLOAD_UUID_RE.test(fileId)) {
        return richError(
            "invalid_argument",
            "fileId must match the upload-<uuid> pattern (canonical Storage-backed ids only).",
            { field: "fileId" },
            "This tool refuses Drive ids and any non-upload synthetic id by design — it exists only to delete Storage bytes of test-fixture-owned rows. Mint a fresh test upload via upload_chart before calling.",
        )
    }

    initAdmin()
    const db = getFirestore()

    const callerRole = await readCallerRole(db, callerUid)
    if (callerRole !== "admin") {
        return richError(
            "forbidden_role",
            "Only admin callers may delete synthetic Storage objects.",
            {
                callerRole,
                requiredRoles: ["admin"],
            },
            "Ask an admin to run this tool, or call upload_chart and delete_chart for the normal lifecycle.",
        )
    }

    const rowSnap = await db.collection("library_index").doc(fileId).get()
    if (!rowSnap.exists) {
        return richError(
            "row_not_found",
            "library_index row not found for this fileId.",
            { fileId },
            "Confirm the fileId via list_library or search_library; the tool refuses if no row exists.",
        )
    }
    const rowData = rowSnap.data() as Record<string, unknown> | undefined
    if (rowData?.isTest !== true) {
        return richError(
            "not_test_row",
            "library_index row is not marked isTest:true — refusing destructive op on a non-test row.",
            { fileId, isTest: rowData?.isTest ?? false },
            "This tool refuses any row not stamped by create_test_account's test-fixture writes. If you intended to delete a real chart, use delete_chart.",
        )
    }

    // Probe Storage to find the resolved path (the row's `mimeType` field
    // may not match what's actually on disk — getCandidatePaths in
    // fileExistsInStorage iterates pdf/xml/audio/no-extension variants).
    // We probe + then delete by reading the storage bucket's actual file
    // list under the candidate paths.
    const mimeHint =
        typeof rowData?.mimeType === "string"
            ? (rowData.mimeType as string)
            : undefined

    const exists = await fileExistsInStorage(fileId, mimeHint)
    if (!exists.success) {
        return richError(
            "storage_delete_failed",
            "Storage existence probe failed before delete; aborting.",
            { fileId, reason: exists.reason },
            exists.message,
        )
    }
    if (!exists.data) {
        return richError(
            "storage_delete_failed",
            "No Storage object found at any candidate path for this fileId — already deleted or never uploaded.",
            { fileId },
            "The library_index row exists with isTest:true but no Storage object backs it — call upload_chart first or inspect /api/admin/library-review for the fixture state.",
        )
    }

    // Re-discover the exact path that exists. fileExistsInStorage
    // returns boolean; we have to iterate candidate paths to know
    // which one to delete. Inline the iteration to keep the public
    // firebase-storage helper module unchanged.
    const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    const bucket = getStorage().bucket(bucketName)

    const candidatePaths = mimeHint
        ? [getCanonicalPath(fileId, mimeHint)]
        : [
              getCanonicalPath(fileId),
              getCanonicalPath(fileId, "application/pdf"),
              getCanonicalPath(fileId, "application/xml"),
              getCanonicalPath(fileId, "audio/mpeg"),
          ]

    let resolvedPath: string | null = null
    for (const path of candidatePaths) {
        const [present] = await bucket.file(path).exists()
        if (present) {
            resolvedPath = path
            break
        }
    }

    if (!resolvedPath) {
        // Should be unreachable given `exists.data === true` above, but
        // belt + suspenders so an admin doesn't see a silent no-op.
        return richError(
            "storage_delete_failed",
            "Storage object exists check passed but path resolution failed — bucket scan returned no match.",
            { fileId, candidatePaths },
        )
    }

    try {
        // force:true — the row's isTest:true gate above proves we're
        // operating on a test fixture, but routing through the bond-aware
        // helper gives us a uniform audit row + consistent path-resolution.
        // The helper's bond check would normally find no live bonds on a
        // test row; force is belt-and-braces, not a real bypass.
        await safelyDeleteLibraryObject(fileId, {
            reason: "test-fixture:__test_delete_storage_object",
            force: true,
            callerUid,
            exactPath: resolvedPath,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error("[mcp] __test_delete_storage_object delete failed", {
            fileId,
            resolvedPath,
            err: message,
        })
        return richError(
            "storage_delete_failed",
            "Storage delete threw — bucket may be misconfigured or the object was concurrently deleted.",
            { fileId, resolvedPath },
            message,
        )
    }

    logger.info("[mcp] __test_delete_storage_object", {
        callerUid,
        fileId,
        resolvedPath,
    })

    return {
        ok: true,
        fileId,
        deletedPath: resolvedPath,
        libraryIndexUntouched: true,
    }
}

/**
 * Canonical path builder mirroring `getStoragePath` in
 * `@/lib/firebase-storage` (which isn't exported). Kept inline so a
 * future refactor of the storage helper's path convention only needs to
 * sync this one call site for the test surface. Cycle-3 GAP-002.
 */
function getCanonicalPath(fileId: string, mimeType?: string): string {
    let ext = mimeType?.includes("pdf")
        ? ".pdf"
        : mimeType?.includes("xml")
          ? ".xml"
          : mimeType?.includes("audio")
            ? ".mp3"
            : ""
    if (ext && fileId.toLowerCase().endsWith(ext)) {
        ext = ""
    }
    return `library/${fileId}${ext}`
}
