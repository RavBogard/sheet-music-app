import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    assertEditor,
    loadEditableSetlist,
} from "@/lib/mcp/server-tracks-write"
import {
    readLastModifiedAt,
    readVersion,
    staleVersionEnvelope,
    type StaleVersionEnvelope,
} from "@/lib/mcp/error-envelopes"
import { STOP_AND_ASK_THRESHOLD } from "@/lib/mcp/title-specificity"
import { logger } from "@/lib/logger"

/**
 * W-01 propose-then-confirm staging + commit lifecycle.
 *
 * Daniel's 2026-05-16 framing: Claude is now the primary backend for the
 * weekly setlist authoring flow. The agent should NOT silently commit a
 * 30-track Shabbat morning service in one turn — it should stage the
 * batch, surface per-proposal confidence (from W-02 specificity), let
 * the rabbi confirm, then atomically commit.
 *
 * This module ships W-01 Tasks 1 + 2:
 *  - `propose_setlist_changes(setlistId, proposals[], ttlSec?)` — writes
 *    `proposal_stages/{stageId}` with TTL, computes per-proposal
 *    confidence + flags, NO mutation to the setlist itself.
 *  - `commit_staged_changes(stageId, lastSeenVersion?)` — reads the
 *    stage, checks TTL + W-04 optimistic-concurrency, applies all
 *    proposals in one Firestore transaction, deletes the stage on
 *    success.
 *
 * Out of scope for this slice (deferred to follow-up W-01 tasks):
 *  - `preview_publish` (Task 3 — preview_publish wrapper)
 *  - `flag_bond` / `review_flagged_bonds` (Task 4)
 *  - `record_bond_correction` (Task 5)
 *  - AGENT-GUIDE.md + MCP server instructions injection (Task 6)
 *  - `reorder` action inside a proposal stage — callers use the
 *    dedicated `reorder_setlist` MCP tool for full permutations; mixing
 *    add+remove+reorder math inside one transaction is its own slice.
 */

type ToolError = { error: string }

const DEFAULT_TTL_SEC = 600 // 10 minutes — matches W-01 plan
const MAX_TTL_SEC = 3600 // 1 hour cap — stages aren't long-lived state
const MAX_PROPOSALS_PER_STAGE = 50

const TRACK_TYPES = [
    "song",
    "header",
    "reading",
    "prayer",
    "transition",
    "note",
] as const
type TrackType = (typeof TRACK_TYPES)[number]

export interface ProposalInput {
    action: "add" | "update" | "remove"
    /** Required for `update` and `remove`. */
    trackId?: string
    /** For `add`: 0-based insert index; omit to append at end. */
    position?: number
    /** Bond this row to a library song. The library is keyed by Drive id. */
    songId?: string
    title?: string
    key?: string
    leadMusician?: string
    referenceLink?: string
    notes?: string
    type?: TrackType
}

/** Per-proposal computed envelope returned in the stage response. */
export interface ProposalEnvelope extends ProposalInput {
    /**
     * "high" specificity >= 0.7; "medium" 0.5..0.7; "low" < 0.5 (the
     * `STOP_AND_ASK_THRESHOLD`). Non-bond proposals (remove, type-only
     * update, free-text add with no songId) default to "high" — no
     * bonding risk to assess.
     */
    confidence: "high" | "medium" | "low"
    /** Concerns the agent should consider surfacing before commit. */
    flags: string[]
    /** Human-readable rationale for the confidence + flags. */
    explanation: string
}

export interface ProposalSummary {
    high: number
    medium: number
    low: number
    flagged: number
}

export interface StageRecord {
    id: string
    setlistId: string
    /** Setlist's version at stage creation — drift detection for commit. */
    setlistVersionAtStage: number
    createdBy: string
    createdAt: string
    ttlExpiresAt: string
    proposals: ProposalEnvelope[]
    summary: ProposalSummary
}

export interface ProposeArgs {
    setlistId: string
    proposals: ProposalInput[]
    ttlSec?: number
}

export interface CommitArgs {
    stageId: string
    /** Setlist-level optimistic-concurrency gate (W-04). */
    lastSeenVersion?: number
}

// ─── propose_setlist_changes ────────────────────────────────────────────────

export async function proposeSetlistChanges(
    uid: string,
    args: ProposeArgs,
): Promise<StageRecord | ToolError> {
    if (!args.setlistId?.trim()) return { error: "setlistId is required" }
    if (!Array.isArray(args.proposals) || args.proposals.length === 0) {
        return { error: "proposals must include at least one entry" }
    }
    if (args.proposals.length > MAX_PROPOSALS_PER_STAGE) {
        return {
            error: `proposals exceeds max (${MAX_PROPOSALS_PER_STAGE}); split into multiple stages`,
        }
    }
    const ttlSec = clampTtl(args.ttlSec ?? DEFAULT_TTL_SEC)

    initAdmin()
    const db = getFirestore()

    const loaded = await loadEditableSetlist(db, args.setlistId, uid)
    if (!loaded.ok) return { error: loaded.error }
    const setlistData = loaded.data
    const setlistVersionAtStage = readVersion(setlistData)

    // Validate each proposal's shape. Bonding-risk evaluation comes after
    // the validation pass — no point computing confidence on a malformed
    // proposal.
    for (let i = 0; i < args.proposals.length; i++) {
        const err = validateProposalShape(args.proposals[i], i)
        if (err) return { error: err }
    }

    // Look up each unique songId once to derive per-proposal confidence
    // from W-02's `titleSpecificity` field on library_index. Missing
    // library_index rows yield a "no_library_record" flag — the row
    // still passes validation (the songs catalog may have it), but the
    // agent should surface uncertainty.
    const songIds = new Set<string>()
    for (const p of args.proposals) {
        if (typeof p.songId === "string" && p.songId.trim()) songIds.add(p.songId)
    }
    const libraryRows = new Map<string, Record<string, unknown> | null>()
    if (songIds.size > 0) {
        const snaps = await Promise.all(
            [...songIds].map((id) =>
                db.collection("library_index").doc(id).get(),
            ),
        )
        for (const snap of snaps) {
            libraryRows.set(snap.id, snap.exists ? (snap.data() ?? null) : null)
        }
    }

    // Build the envelope: confidence + flags + explanation per proposal.
    const envelopes: ProposalEnvelope[] = args.proposals.map((p) =>
        computeProposalEnvelope(p, libraryRows),
    )
    const summary = summarize(envelopes)

    const stageId = crypto.randomUUID()
    const now = new Date()
    const expires = new Date(now.getTime() + ttlSec * 1000)
    const stage: StageRecord = {
        id: stageId,
        setlistId: args.setlistId,
        setlistVersionAtStage,
        createdBy: uid,
        createdAt: now.toISOString(),
        ttlExpiresAt: expires.toISOString(),
        proposals: envelopes,
        summary,
    }

    await db.collection("proposal_stages").doc(stageId).set(stage)
    logger.info("[mcp] propose_setlist_changes staged", {
        stageId,
        setlistId: args.setlistId,
        proposalCount: envelopes.length,
        summary,
    })
    return stage
}

// ─── commit_staged_changes ──────────────────────────────────────────────────

export interface CommitResult {
    ok: true
    stageId: string
    setlistId: string
    appliedCount: number
    setlistVersion: number
    addedTrackIds: string[]
    updatedTrackIds: string[]
    removedTrackIds: string[]
}

export async function commitStagedChanges(
    uid: string,
    args: CommitArgs,
): Promise<CommitResult | ToolError | StaleVersionEnvelope> {
    if (!args.stageId?.trim()) return { error: "stageId is required" }

    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return { error: editor.error }

    const stageRef = db.collection("proposal_stages").doc(args.stageId)
    const stageSnap = await stageRef.get()
    if (!stageSnap.exists) {
        return { error: "Stage not found (already committed, expired, or never created)" }
    }
    const stage = stageSnap.data() as StageRecord
    const expiresMs = Date.parse(stage.ttlExpiresAt)
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
        // Best-effort cleanup of the expired doc; ignore failure (a Cloud
        // Function sweep covers it long-term anyway).
        stageRef.delete().catch(() => {})
        return {
            error: `stage_expired (expired at ${stage.ttlExpiresAt})`,
        }
    }

    const setlistRef = db.collection("setlists").doc(stage.setlistId)
    const tracksColl = db.collection("tracks")

    type TxResult =
        | {
              kind: "ok"
              setlistVersion: number
              addedTrackIds: string[]
              updatedTrackIds: string[]
              removedTrackIds: string[]
          }
        | { kind: "stale_version"; envelope: StaleVersionEnvelope }
        | { kind: "error"; error: string }

    const txResult = await db.runTransaction<TxResult>(async (tx) => {
        const setlistSnap = await tx.get(setlistRef)
        if (!setlistSnap.exists) {
            return { kind: "error", error: "Setlist not found" }
        }
        const setlistData = setlistSnap.data() as Record<string, unknown>

        // W-04 setlist-level optimistic-concurrency gate. Use caller's
        // lastSeenVersion if supplied; otherwise fall back to the version
        // captured at stage time (drift between stage and commit is the
        // exact race the gate exists for).
        const currentVersion = readVersion(setlistData)
        const gateVersion =
            args.lastSeenVersion !== undefined
                ? args.lastSeenVersion
                : stage.setlistVersionAtStage
        if (currentVersion !== gateVersion) {
            return {
                kind: "stale_version",
                envelope: staleVersionEnvelope({
                    resource: "setlist",
                    currentVersion,
                    lastSeenVersion: gateVersion,
                    lastModifiedBy: setlistData.lastModifiedBy as
                        | string
                        | undefined,
                    lastModifiedAt: readLastModifiedAt(setlistData),
                }),
            }
        }

        // Pull current track set for `update`/`remove` resolution + order
        // math. One snapshot read, sorted by `order`.
        const tracksSnap = await tx.get(
            tracksColl.where("setlistId", "==", stage.setlistId),
        )
        const existing = tracksSnap.docs
            .map((d) => ({
                id: d.id,
                data: d.data() as Record<string, unknown>,
                order:
                    typeof (d.data() as { order?: unknown }).order === "number"
                        ? ((d.data() as { order: number }).order as number)
                        : 0,
                fileId:
                    typeof (d.data() as { fileId?: unknown }).fileId === "string"
                        ? ((d.data() as { fileId: string }).fileId as string)
                        : undefined,
            }))
            .sort((a, b) => a.order - b.order)
        const byId = new Map(existing.map((t) => [t.id, t]))

        // Validate every proposal can resolve against the live track set
        // BEFORE any write. Atomic-or-nothing semantic.
        const addedTrackIds: string[] = []
        const updatedTrackIds: string[] = []
        const removedTrackIds = new Set<string>()
        for (const p of stage.proposals) {
            if (p.action === "update" || p.action === "remove") {
                if (!p.trackId || !byId.has(p.trackId)) {
                    return {
                        kind: "error",
                        error: `Proposal targets unknown trackId '${p.trackId}' (setlist may have drifted since stage was created — re-stage with current trackIds)`,
                    }
                }
            }
        }

        // Apply: build the post-commit ordered track list by walking
        // proposals in order, then re-pack `order` to contiguous
        // [0..n-1] (W-05 invariant-on-write contract).
        type SimRow =
            | {
                  kind: "existing"
                  id: string
                  fileId?: string
                  patch?: Record<string, unknown>
              }
            | {
                  kind: "new"
                  id: string
                  payload: Record<string, unknown>
                  fileId?: string
              }
        let working: SimRow[] = existing.map((t) => ({
            kind: "existing",
            id: t.id,
            fileId: t.fileId,
        }))
        for (const p of stage.proposals) {
            if (p.action === "remove") {
                working = working.filter((r) => r.id !== p.trackId)
                removedTrackIds.add(p.trackId!)
                continue
            }
            if (p.action === "update") {
                const idx = working.findIndex((r) => r.id === p.trackId)
                if (idx === -1) continue // defensive (caught above)
                const row = working[idx]
                if (row.kind !== "existing") continue
                const patch = buildFieldPatch(p)
                row.patch = { ...(row.patch ?? {}), ...patch }
                if (typeof patch.fileId === "string") row.fileId = patch.fileId
                updatedTrackIds.push(p.trackId!)
                continue
            }
            // action === "add"
            const newTrackId = crypto.randomUUID()
            const payload = buildNewTrackPayload(stage.setlistId, p, newTrackId)
            const insertAt =
                p.position === undefined ||
                p.position < 0 ||
                p.position > working.length
                    ? working.length
                    : p.position
            working.splice(insertAt, 0, {
                kind: "new",
                id: newTrackId,
                payload,
                fileId:
                    typeof payload.fileId === "string"
                        ? (payload.fileId as string)
                        : undefined,
            } as SimRow)
            addedTrackIds.push(newTrackId)
        }

        // Writes — issue all deletes, sets, updates inside the same tx.
        const nowIso = new Date().toISOString()
        for (const id of removedTrackIds) {
            tx.delete(tracksColl.doc(id))
        }
        working.forEach((row, i) => {
            if (row.kind === "new") {
                tx.set(tracksColl.doc(row.id), {
                    ...row.payload,
                    order: i,
                    updatedAt: FieldValue.serverTimestamp(),
                })
            } else {
                // F-014 (cycle-1 cowork): only write to existing rows that
                // ACTUALLY changed. Pre-fix the commit looped over every row
                // and bumped version + lastModifiedAt + (sometimes) order on
                // every track in the setlist, even ones not touched by any
                // proposal. That broke optimistic-concurrency for parallel
                // agents holding `lastSeenVersion` on untouched rows — every
                // unrelated commit invalidated their handle.
                const hasFieldEdits =
                    !!row.patch && Object.keys(row.patch).length > 0
                const before = byId.get(row.id)
                const orderChanged = !before || before.order !== i
                if (!hasFieldEdits && !orderChanged) return
                const patch: Record<string, unknown> = {
                    ...(row.patch ?? {}),
                    updatedAt: FieldValue.serverTimestamp(),
                    version: FieldValue.increment(1),
                    lastModifiedAt: nowIso,
                }
                if (orderChanged) patch.order = i
                tx.update(tracksColl.doc(row.id), patch)
            }
        })

        // Canonical fileIds[] from post-commit state — same shape as the
        // single-row write paths' re-bond reconcile.
        const canonical = new Set<string>()
        for (const row of working) {
            if (typeof row.fileId === "string" && row.fileId) {
                canonical.add(row.fileId)
            }
        }
        const setlistPatch: Record<string, unknown> = {
            trackCount: working.length,
            updatedAt: FieldValue.serverTimestamp(),
            version: FieldValue.increment(1),
            lastModifiedAt: nowIso,
            lastModifiedBy: uid,
            fileIds: [...canonical],
        }
        tx.update(setlistRef, setlistPatch)
        tx.delete(stageRef)

        return {
            kind: "ok",
            setlistVersion: currentVersion + 1,
            addedTrackIds,
            updatedTrackIds,
            removedTrackIds: [...removedTrackIds],
        }
    })

    if (txResult.kind === "stale_version") return txResult.envelope
    if (txResult.kind === "error") return { error: txResult.error }

    logger.info("[mcp] commit_staged_changes committed", {
        stageId: args.stageId,
        setlistId: stage.setlistId,
        appliedCount: stage.proposals.length,
        setlistVersion: txResult.setlistVersion,
    })
    return {
        ok: true,
        stageId: args.stageId,
        setlistId: stage.setlistId,
        appliedCount: stage.proposals.length,
        setlistVersion: txResult.setlistVersion,
        addedTrackIds: txResult.addedTrackIds,
        updatedTrackIds: txResult.updatedTrackIds,
        removedTrackIds: txResult.removedTrackIds,
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function clampTtl(ttlSec: number): number {
    if (!Number.isFinite(ttlSec) || ttlSec < 1) return DEFAULT_TTL_SEC
    return Math.min(MAX_TTL_SEC, Math.floor(ttlSec))
}

function validateProposalShape(p: ProposalInput, i: number): string | null {
    if (p.action !== "add" && p.action !== "update" && p.action !== "remove") {
        return `proposals[${i}].action must be one of add/update/remove (reorder uses the dedicated reorder_setlist tool, not staged proposals)`
    }
    if ((p.action === "update" || p.action === "remove") && !p.trackId) {
        return `proposals[${i}].trackId is required for action='${p.action}'`
    }
    if (p.action === "add") {
        if (!p.songId && (!p.title || !p.title.trim())) {
            return `proposals[${i}] add requires either a songId (to derive title from the library) or an explicit title for a free-text row`
        }
    }
    if (p.type !== undefined && !TRACK_TYPES.includes(p.type)) {
        return `proposals[${i}].type must be one of ${TRACK_TYPES.join(", ")}`
    }
    return null
}

function computeProposalEnvelope(
    p: ProposalInput,
    libraryRows: Map<string, Record<string, unknown> | null>,
): ProposalEnvelope {
    // Remove and non-bond updates carry no bonding risk → high confidence.
    if (p.action === "remove") {
        return {
            ...p,
            confidence: "high",
            flags: [],
            explanation: "removes a row — no bonding risk",
        }
    }
    if (!p.songId || !p.songId.trim()) {
        return {
            ...p,
            confidence: "high",
            flags: [],
            explanation:
                p.action === "add"
                    ? "free-text row (no song bond)"
                    : "field-only update — no bond change",
        }
    }
    const row = libraryRows.get(p.songId) ?? null
    if (!row) {
        return {
            ...p,
            confidence: "low",
            flags: ["no_library_record"],
            explanation: `songId '${p.songId}' has no library_index row — bond may be invalid`,
        }
    }
    const specificity =
        typeof row.titleSpecificity === "number"
            ? (row.titleSpecificity as number)
            : 0.5
    const flags: string[] = []
    if (row.status === "orphaned") flags.push("orphan_risk")
    if (specificity < STOP_AND_ASK_THRESHOLD) flags.push("generic_title")
    const confidence: ProposalEnvelope["confidence"] =
        specificity >= 0.7 ? "high" : specificity >= 0.5 ? "medium" : "low"
    const explanation =
        specificity >= 0.7
            ? `unambiguous title (specificity ${specificity})`
            : specificity >= 0.5
              ? `moderately specific (specificity ${specificity}); confirm if rare arrangement`
              : `generic / ambiguous (specificity ${specificity}); stop and ask before committing`
    return { ...p, confidence, flags, explanation }
}

function summarize(envelopes: ProposalEnvelope[]): ProposalSummary {
    const summary: ProposalSummary = {
        high: 0,
        medium: 0,
        low: 0,
        flagged: 0,
    }
    for (const e of envelopes) {
        summary[e.confidence]++
        if (e.flags.length > 0) summary.flagged++
    }
    return summary
}

function buildFieldPatch(p: ProposalInput): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (p.title !== undefined) out.title = p.title
    if (p.key !== undefined) out.key = p.key
    if (p.leadMusician !== undefined) out.leadMusician = p.leadMusician
    if (p.notes !== undefined) out.notes = p.notes
    if (p.type !== undefined) out.type = p.type
    if (p.referenceLink !== undefined) out.referenceLink = p.referenceLink
    if (p.songId !== undefined) {
        out.songId = p.songId
        // Library is keyed by Drive file id, so fileId follows songId.
        out.fileId = p.songId
    }
    return out
}

function buildNewTrackPayload(
    setlistId: string,
    p: ProposalInput,
    trackId: string,
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        id: trackId,
        setlistId,
        type: p.type ?? "song",
        title: p.title ?? "",
        version: 1,
        lastModifiedAt: new Date().toISOString(),
    }
    if (p.key !== undefined) payload.key = p.key
    if (p.leadMusician !== undefined) payload.leadMusician = p.leadMusician
    if (p.notes !== undefined) payload.notes = p.notes
    if (p.referenceLink !== undefined) payload.referenceLink = p.referenceLink
    if (p.songId !== undefined) {
        payload.songId = p.songId
        payload.fileId = p.songId
    }
    return payload
}
