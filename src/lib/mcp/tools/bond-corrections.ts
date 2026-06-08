import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"
import { searchLibrary } from "./library"
import { rowOrg } from "@/lib/mcp/org-context"
import type { SongRecord } from "@/lib/mcp/server-songs"

/**
 * W-01 Tasks 4 + 5 — flag / review / correct bonds.
 *
 * The propose-then-confirm loop (Tasks 1+2) lets an agent surface
 * confidence before commit; flagging closes the OTHER side of the loop —
 * what to do when a row was committed with low confidence and the rabbi
 * decides during review that the bond is wrong. The agent flags the row
 * during batch authoring; at end-of-session the agent calls
 * `review_flagged_bonds`, walks each with the rabbi, and for each
 * correction calls `record_bond_correction`. That last write is the
 * system's training signal — it updates per-songId counters that bias
 * future `search_library` ranking, and once 3 consistent picks land for
 * a (stem, contextKey) pair, the same write inline-aggregates a
 * `titleContextHints/{stem}_{contextKey}` doc that gives the preferred
 * songId a +0.5 boost in subsequent searches.
 *
 * The W-02 plan originally specified a Cloud Function trigger for the
 * aggregation step. The project has no Cloud Functions infrastructure
 * (no `functions/` dir, no firebase.json functions config), so the
 * aggregation runs inline inside the same Firestore transaction as the
 * counter write — same 3-pick threshold, same `titleContextHints` doc
 * shape, same read-side contract.
 *
 * Tools shipped in this module:
 *   - `flag_bond(setlistId, trackId, reason)`               — Task 4
 *   - `review_flagged_bonds(setlistId)`                     — Task 4
 *   - `record_bond_correction(setlistId, trackId, fromSongId, toSongId, reason?)` — Task 5
 *
 * Doc-id shape for the flags collection: `bond_flags/{setlistId}_{trackId}` —
 * composite natural key so a re-flag of the same row upserts cleanly. The
 * doc also carries `setlistId` as a queryable field so review can scope
 * by setlistId without depending on docId-prefix queries.
 */

// Cycle-2 REG-001b: every error returns the canonical rich envelope; no
// legacy {error: string} returns survive this file.

const ALTERNATIVES_PER_FLAG = 5
const CONTEXT_HINT_THRESHOLD = 3

// ─── flag_bond ──────────────────────────────────────────────────────────────

export interface FlagBondArgs {
    setlistId: string
    trackId: string
    reason: string
}

export interface FlagBondResult {
    ok: true
    flagId: string
    setlistId: string
    trackId: string
    reason: string
    flaggedAt: string
    flaggedBy: string
}

export async function flagBond(
    uid: string,
    args: FlagBondArgs,
): Promise<FlagBondResult | RichErrorEnvelope> {
    if (!args.setlistId?.trim())
        return richError("invalid_argument", "setlistId must be a non-empty string.", {
            field: "setlistId",
        })
    if (!args.trackId?.trim())
        return richError("invalid_argument", "trackId must be a non-empty string.", {
            field: "trackId",
        })
    if (!args.reason?.trim()) {
        return richError(
            "invalid_argument",
            "reason is required — a short rationale (e.g. 'generic title, only one search hit') keeps the batch-review pass useful for the rabbi.",
            { field: "reason" },
        )
    }

    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    // Confirm the track still exists on the named setlist — guards against
    // flagging a trackId that drifted away from the setlist between read and
    // flag. Cheap (single doc read).
    const trackSnap = await db.collection("tracks").doc(args.trackId).get()
    if (!trackSnap.exists) {
        return richError(
            "track_not_found",
            `Track '${args.trackId}' was not found.`,
            { trackId: args.trackId, setlistId: args.setlistId },
            "Call get_setlist to refresh state.",
        )
    }
    const trackSetlistId = (trackSnap.data() as { setlistId?: string })
        .setlistId
    if (trackSetlistId !== args.setlistId) {
        return richError(
            "track_setlist_mismatch",
            `Track '${args.trackId}' does not belong to setlist '${args.setlistId}'.`,
            {
                trackId: args.trackId,
                setlistId: args.setlistId,
                actualSetlistId: trackSetlistId ?? null,
            },
            "Call get_setlist on the correct setlist to refresh the track id.",
        )
    }

    const flagId = `${args.setlistId}_${args.trackId}`
    const flaggedAt = new Date().toISOString()
    await db
        .collection("bond_flags")
        .doc(flagId)
        .set({
            id: flagId,
            setlistId: args.setlistId,
            trackId: args.trackId,
            reason: args.reason,
            flaggedAt,
            flaggedBy: uid,
        })
    logger.info("[mcp] flag_bond", {
        setlistId: args.setlistId,
        trackId: args.trackId,
    })
    return {
        ok: true,
        flagId,
        setlistId: args.setlistId,
        trackId: args.trackId,
        reason: args.reason,
        flaggedAt,
        flaggedBy: uid,
    }
}

// ─── review_flagged_bonds ───────────────────────────────────────────────────

export interface ReviewFlaggedBondsArgs {
    setlistId: string
}

export interface FlaggedBondRow {
    flagId: string
    trackId: string
    reason: string
    flaggedAt: string
    flaggedBy: string
    track: {
        title: string
        key?: string
        songId?: string
        fileId?: string
    } | null
    alternatives: Array<{
        songId: string
        title: string
        key?: string
        titleSpecificity?: number
        siblingsInCatalog?: number
        bondCorrectionHistory?: {
            correctedTo: number
            correctedAwayFrom: number
        }
    }>
}

export interface ReviewFlaggedBondsResult {
    ok: true
    setlistId: string
    count: number
    rows: FlaggedBondRow[]
}

export async function reviewFlaggedBonds(
    uid: string,
    args: ReviewFlaggedBondsArgs,
): Promise<ReviewFlaggedBondsResult | RichErrorEnvelope> {
    if (!args.setlistId?.trim())
        return richError("invalid_argument", "setlistId must be a non-empty string.", {
            field: "setlistId",
        })

    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    const setlistSnap = await db
        .collection("setlists")
        .doc(args.setlistId)
        .get()
    if (!setlistSnap.exists)
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    const contextKey = readContextKey(setlistSnap.data() as Record<string, unknown>)
    // v11-02-02: scope the alternatives search to the setlist's tenant so a
    // BL setlist never surfaces CRC chart alternatives (and vice-versa).
    const setlistOrg = rowOrg(
        (setlistSnap.data() as Record<string, unknown>).orgId,
    )

    const flagsSnap = await db
        .collection("bond_flags")
        .where("setlistId", "==", args.setlistId)
        .get()
    if (flagsSnap.empty) {
        return { ok: true, setlistId: args.setlistId, count: 0, rows: [] }
    }

    // Fan-out to fetch the live track docs in parallel.
    const flagDocs = flagsSnap.docs.map((d) => ({
        flagId: d.id,
        data: d.data() as {
            trackId: string
            reason: string
            flaggedAt: string
            flaggedBy: string
        },
    }))
    const trackSnaps = await Promise.all(
        flagDocs.map((f) => db.collection("tracks").doc(f.data.trackId).get()),
    )

    // Build alternatives for each row from search_library, using the track's
    // current title as the query and the setlist's templateType as contextKey.
    // Sequential to keep search costs bounded (each call reads the whole
    // library_index — the existing tool isn't cheap), but the typical
    // weekly setlist flags <5 rows so the wall-clock cost is acceptable.
    const rows: FlaggedBondRow[] = []
    for (let i = 0; i < flagDocs.length; i++) {
        const flag = flagDocs[i]
        const trackSnap = trackSnaps[i]
        const track = trackSnap.exists
            ? (trackSnap.data() as Record<string, unknown>)
            : null
        const title = typeof track?.title === "string" ? track.title : ""
        const currentSongId =
            typeof track?.songId === "string" ? track.songId : undefined

        let alternatives: FlaggedBondRow["alternatives"] = []
        if (title) {
            try {
                const results = (await searchLibrary(
                    uid,
                    {
                        query: title,
                        limit: ALTERNATIVES_PER_FLAG + 1,
                        contextKey,
                    },
                    setlistOrg,
                )) as SongRecord[]
                alternatives = results
                    .filter((r) => r.id !== currentSongId)
                    .slice(0, ALTERNATIVES_PER_FLAG)
                    .map((r) => ({
                        songId: r.id,
                        title: r.title,
                        key: r.key,
                        titleSpecificity: r.titleSpecificity,
                        siblingsInCatalog: r.siblingsInCatalog,
                        bondCorrectionHistory: r.bondCorrectionHistory
                            ? {
                                  correctedTo: r.bondCorrectionHistory.correctedTo,
                                  correctedAwayFrom:
                                      r.bondCorrectionHistory.correctedAwayFrom,
                              }
                            : undefined,
                    }))
            } catch (err) {
                logger.warn("[mcp] review_flagged_bonds search failed", {
                    flagId: flag.flagId,
                    err,
                })
            }
        }

        rows.push({
            flagId: flag.flagId,
            trackId: flag.data.trackId,
            reason: flag.data.reason,
            flaggedAt: flag.data.flaggedAt,
            flaggedBy: flag.data.flaggedBy,
            track: track
                ? {
                      title,
                      key: typeof track.key === "string" ? track.key : undefined,
                      songId: currentSongId,
                      fileId:
                          typeof track.fileId === "string"
                              ? track.fileId
                              : undefined,
                  }
                : null,
            alternatives,
        })
    }

    return {
        ok: true,
        setlistId: args.setlistId,
        count: rows.length,
        rows,
    }
}

// ─── record_bond_correction ─────────────────────────────────────────────────

export interface RecordBondCorrectionArgs {
    setlistId: string
    trackId: string
    fromSongId: string
    toSongId: string
    reason?: string
}

export interface RecordBondCorrectionResult {
    ok: true
    correctionId: string
    setlistId: string
    trackId: string
    fromSongId: string
    toSongId: string
    contextKey?: string
    /** Cumulative correctedTo for `toSongId` AFTER this write. */
    correctedToAfter: number
    /** True iff this write tipped the (stem, contextKey) hint past the
     *  N=3 threshold and the titleContextHints doc was created/updated. */
    hintPromoted: boolean
    /** Doc id of the titleContextHints doc, when hintPromoted=true. */
    hintId?: string
}

export async function recordBondCorrection(
    uid: string,
    args: RecordBondCorrectionArgs,
): Promise<RecordBondCorrectionResult | RichErrorEnvelope> {
    if (!args.setlistId?.trim())
        return richError("invalid_argument", "setlistId must be a non-empty string.", {
            field: "setlistId",
        })
    if (!args.trackId?.trim())
        return richError("invalid_argument", "trackId must be a non-empty string.", {
            field: "trackId",
        })
    if (!args.fromSongId?.trim())
        return richError("invalid_argument", "fromSongId must be a non-empty string.", {
            field: "fromSongId",
        })
    if (!args.toSongId?.trim())
        return richError("invalid_argument", "toSongId must be a non-empty string.", {
            field: "toSongId",
        })
    if (args.fromSongId === args.toSongId) {
        return richError(
            "invalid_argument",
            "fromSongId and toSongId must differ — recording a correction back to the same songId is a no-op.",
            { fromSongId: args.fromSongId, toSongId: args.toSongId },
        )
    }

    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    const setlistRef = db.collection("setlists").doc(args.setlistId)
    const setlistSnap = await setlistRef.get()
    if (!setlistSnap.exists)
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    const setlistData = setlistSnap.data() as Record<string, unknown>
    const contextKey = readContextKey(setlistData)

    const correctionId = crypto.randomUUID()
    const correctedAt = new Date().toISOString()
    const flagRef = db
        .collection("bond_flags")
        .doc(`${args.setlistId}_${args.trackId}`)
    const correctionRef = db.collection("bond_corrections").doc(correctionId)
    const fromIndexRef = db.collection("library_index").doc(args.fromSongId)
    const toIndexRef = db.collection("library_index").doc(args.toSongId)

    // Pre-read the `to` library_index row so we can compute the post-write
    // correctedTo count + the toSongId's stem (needed for the hint doc id).
    // Same transaction re-reads it to guard against drift.
    const toIndexPreSnap = await toIndexRef.get()
    const toIndexPre = toIndexPreSnap.exists
        ? (toIndexPreSnap.data() as Record<string, unknown>)
        : null
    const toStem = typeof toIndexPre?.stem === "string" ? toIndexPre.stem : undefined

    const result = await db.runTransaction<{
        correctedToAfter: number
        hintPromoted: boolean
        hintId?: string
    }>(async (tx) => {
        // Re-read inside the tx so the increment lands atomically.
        const [toSnap, hintSnap] = await Promise.all([
            tx.get(toIndexRef),
            contextKey && toStem
                ? tx.get(
                      db
                          .collection("titleContextHints")
                          .doc(`${toStem}_${contextKey}`),
                  )
                : Promise.resolve(null),
        ])
        const toData = toSnap.exists
            ? (toSnap.data() as Record<string, unknown>)
            : {}
        const priorCorrectedTo =
            typeof (toData.bondCorrectionHistory as { correctedTo?: unknown })
                ?.correctedTo === "number"
                ? (
                      toData.bondCorrectionHistory as { correctedTo: number }
                  ).correctedTo
                : 0
        const correctedToAfter = priorCorrectedTo + 1

        // ── Write the audit-trail correction doc.
        tx.set(correctionRef, {
            id: correctionId,
            setlistId: args.setlistId,
            trackId: args.trackId,
            fromSongId: args.fromSongId,
            toSongId: args.toSongId,
            reason: args.reason ?? null,
            contextKey: contextKey ?? null,
            correctedAt,
            correctedBy: uid,
        })

        // ── Bump library_index counters on both rows. Increment is safe
        // even if the row was created without `bondCorrectionHistory` —
        // Firestore Increment treats missing as 0.
        tx.set(
            fromIndexRef,
            {
                bondCorrectionHistory: {
                    correctedAwayFrom: FieldValue.increment(1),
                    lastCorrectionAt: correctedAt,
                },
            },
            { merge: true },
        )
        tx.set(
            toIndexRef,
            {
                bondCorrectionHistory: {
                    correctedTo: FieldValue.increment(1),
                    lastCorrectionAt: correctedAt,
                },
            },
            { merge: true },
        )

        // ── Delete the open flag (one-shot — re-flag if it surfaces again).
        tx.delete(flagRef)

        // ── Inline aggregation into titleContextHints. The W-02 plan
        // originally specified a Cloud Function trigger for this step; the
        // project has no Functions infrastructure, so we run the
        // read-modify-write inside the same transaction. Aggregation
        // contract: when correctedTo for (stem, contextKey) hits
        // CONTEXT_HINT_THRESHOLD consistent picks, write the hint doc with
        // `preferredFileId: toSongId` + `picks: correctedToAfter`. Below
        // the threshold the hint doc isn't written — reads of the doc
        // gate on picks >= 3 anyway, so partial writes would just bloat
        // Firestore without changing read behavior.
        let hintPromoted = false
        let hintId: string | undefined
        if (
            contextKey &&
            toStem &&
            correctedToAfter >= CONTEXT_HINT_THRESHOLD &&
            hintSnap !== null
        ) {
            hintId = `${toStem}_${contextKey}`
            tx.set(
                db.collection("titleContextHints").doc(hintId),
                {
                    id: hintId,
                    stem: toStem,
                    contextKey,
                    preferredFileId: args.toSongId,
                    picks: correctedToAfter,
                    lastUpdatedAt: correctedAt,
                },
                { merge: true },
            )
            hintPromoted = true
        }

        return { correctedToAfter, hintPromoted, hintId }
    })

    logger.info("[mcp] record_bond_correction", {
        setlistId: args.setlistId,
        trackId: args.trackId,
        fromSongId: args.fromSongId,
        toSongId: args.toSongId,
        correctedToAfter: result.correctedToAfter,
        hintPromoted: result.hintPromoted,
    })
    return {
        ok: true,
        correctionId,
        setlistId: args.setlistId,
        trackId: args.trackId,
        fromSongId: args.fromSongId,
        toSongId: args.toSongId,
        contextKey,
        correctedToAfter: result.correctedToAfter,
        hintPromoted: result.hintPromoted,
        hintId: result.hintId,
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Derive the `contextKey` used by the search-side hint lookup. The
 * setlist's `templateType` (e.g. "shabbat-morning", "friday-evening") is
 * the natural grouping — Daniel's "wrong arrangement" calls cluster by
 * service type, not by date. Falls back to `serviceType` for legacy docs.
 */
function readContextKey(
    setlist: Record<string, unknown>,
): string | undefined {
    if (typeof setlist.templateType === "string" && setlist.templateType) {
        return setlist.templateType
    }
    if (typeof setlist.serviceType === "string" && setlist.serviceType) {
        return setlist.serviceType
    }
    return undefined
}
