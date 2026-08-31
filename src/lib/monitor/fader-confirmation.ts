/**
 * Fader confirmation state machine (iPad consumer plane — Monitor Overhaul
 * Phase 3, the North Star). PURE, framework-free logic so it can be unit-tested
 * exhaustively, mirroring P1-C's `state-freshness.ts` / `is-mixer-offline`
 * extracted-pure pattern. The `FaderStrip` / `VerticalFaderStrip` components
 * drive it from a `useReducer`.
 *
 * ## Why a machine (DEFECT-REGISTER C-2 / C-3 / C-12)
 *
 * Pre-P3 each fader carried an ad-hoc `isPending` boolean plus a crude 2s
 * "safety" `setTimeout` that HARD-SNAPPED the knob back to the prop value
 * (C-3). Worse, the parent does an *optimistic store write* on every move, so
 * the `value` prop flips to the just-sent value immediately — the old
 * `Math.abs(value - pending) < 0.01` check therefore "confirmed" against the
 * fader's OWN optimistic echo, not against the desk (C-2 false-confirm).
 *
 * Phase 1 made `monitor-live/state` reflect the *authoritative* desk value
 * (query-after-command, ~300ms) and self-advance. So confirmation must key off
 * a real authoritative snapshot, NOT the optimistic echo. We distinguish the
 * two with a monotonic **snapshot sequence** (`seq` = the store's
 * `snapshotCount`, bumped only by `setSnapshot`, never by the optimistic
 * `updateBusFader`). An `external` event whose `seq` did not advance is an
 * optimistic echo and is ignored for confirmation.
 *
 * ## Phases
 * - `idle`     — showing the authoritative value; tracks every authoritative update.
 * - `dragging` — user has a finger down; incoming snapshots are SUPPRESSED so a
 *                cross-device push never yanks the knob out from under them (C-12).
 * - `pending`  — finger released, optimistic value sent, awaiting the desk. The
 *                knob holds the optimistic value (no movement) until either a
 *                snapshot reflects it (→ confirmed) or the timeout elapses (→ reverted).
 *
 * `confirmed` / `reverted` are momentary OUTCOMES surfaced on `state.outcome`
 * (for a brief check / undo cue) — both land back in `idle` showing the
 * authoritative value. A revert is NOT a hard snap: the component eases the
 * `displayValue` change via a CSS transition.
 */

/**
 * R2 — musician-facing wording for the bridge's own rejection reasons.
 *
 * The bridge writes engineering strings ("unauthorized", "bridge-standby",
 * "superseded by a newer command for the same target"). A musician mid-service
 * needs to know one thing: is this me, is this the system, or is this nothing?
 * Matching is substring-based because the X32-error branch passes an arbitrary
 * `Error.message` straight through — anything unrecognized falls back to a plain
 * honest sentence rather than printing a stack-flavoured string onto a fader.
 */
export function humanizeRejection(reason: string | undefined): string {
    const r = (reason || "").toLowerCase()
    if (r.includes("unauthorized")) return "No permission for this bus"
    if (r.includes("standby")) return "Bridge is restarting"
    if (r.includes("superseded")) return "Superseded"
    if (r.includes("unknown or malformed")) return "Mixer didn't understand that"
    if (r.includes("stale")) return "Took too long — try again"
    return "The mixer refused that"
}

export type FaderPhase = "idle" | "dragging" | "pending"
export type FaderOutcome = "confirmed" | "reverted" | "rejected" | null

export interface FaderMachineState {
    phase: FaderPhase
    /** Value currently shown on the knob (0..1). */
    displayValue: number
    /** Optimistic value the user sent; null unless pending. */
    optimisticValue: number | null
    /** Epoch ms the optimistic value was sent; null unless pending. */
    sentAt: number | null
    /** Last authoritative snapshot sequence we have reconciled against. */
    lastSeq: number
    /** Momentary reconciliation result for the UI cue; cleared via `clear_outcome`. */
    outcome: FaderOutcome
    /**
     * R2: why the desk refused this move, in words a musician can act on
     * ("Not your bus" / "Bridge restarting"). Set only alongside
     * `outcome: "rejected"`; null otherwise.
     */
    rejectionReason: string | null
}

export interface FaderConfig {
    /** Authoritative within this band of the optimistic value ⇒ confirmed. */
    tolerance: number
    /** Pending longer than this with no confirming reflection ⇒ reverted. */
    confirmTimeoutMs: number
}

/**
 * X32 faders quantize, and Firestore values can round-trip with tiny float
 * drift, so confirmation uses a small tolerance band rather than exact match.
 * 0.02 (≈2%) comfortably absorbs quantization while staying far below a genuine
 * "the desk landed somewhere else" disagreement.
 */
export const FADER_CONFIRM_TOLERANCE = 0.02

/**
 * Start ~ P1-A's 300ms query-after-command confirm + generous margin for
 * Firestore propagation jitter. Tunable. Matches the prior 2s feel, but now the
 * knob EASES to the authoritative value on timeout instead of hard-snapping.
 */
export const FADER_CONFIRM_TIMEOUT_MS = 2000

export const DEFAULT_FADER_CONFIG: FaderConfig = {
    tolerance: FADER_CONFIRM_TOLERANCE,
    confirmTimeoutMs: FADER_CONFIRM_TIMEOUT_MS,
}

export type FaderEvent =
    | { type: "drag_start" }
    | { type: "drag_move"; value: number }
    | { type: "commit"; value: number; now: number }
    | { type: "external"; value: number; seq: number; now: number }
    | { type: "tick"; value: number; now: number }
    /**
     * R2: the bridge wrote a `rejected` ack for this fader's command. The desk
     * never moved, so `value` (the store's rolled-back authoritative value) is
     * the truth RIGHT NOW — no need to sit out the 2s timeout.
     */
    | { type: "rejected"; value: number; reason: string }
    | { type: "clear_outcome" }

/** Initial machine state showing `value`, anchored to authoritative sequence `seq`. */
export function initFaderState(value: number, seq = 0): FaderMachineState {
    return {
        phase: "idle",
        displayValue: value,
        optimisticValue: null,
        sentAt: null,
        lastSeq: seq,
        outcome: null,
        rejectionReason: null,
    }
}

/** Pure transition. `config` defaults to the shipped tolerance/timeout. */
export function faderReducer(
    state: FaderMachineState,
    event: FaderEvent,
    config: FaderConfig = DEFAULT_FADER_CONFIG,
): FaderMachineState {
    switch (event.type) {
        case "drag_start":
            // Begin a drag; clear any lingering outcome cue.
            return { ...state, phase: "dragging", outcome: null, rejectionReason: null }

        case "drag_move":
            return { ...state, phase: "dragging", displayValue: event.value }

        case "commit":
            // Finger up (or a reset tap): hold the optimistic value and start
            // waiting for the desk to reflect it.
            return {
                ...state,
                phase: "pending",
                displayValue: event.value,
                optimisticValue: event.value,
                sentAt: event.now,
                outcome: null,
                rejectionReason: null,
            }

        case "external": {
            // An authoritative-candidate update arrived.
            if (state.phase === "idle") {
                // Always track the authoritative value when idle. (No optimistic
                // writes occur in idle, so a value change here is always real.)
                return { ...state, displayValue: event.value, lastSeq: event.seq }
            }

            if (state.phase === "dragging") {
                // C-12 drag-suppression: never move the knob under an active drag.
                // Record the sequence so a stale echo can't reconcile post-release.
                return { ...state, lastSeq: event.seq }
            }

            // phase === "pending"
            if (event.seq === state.lastSeq) {
                // No new authoritative snapshot — this is our own optimistic echo
                // (the parent's store write). Ignore it for confirmation (C-2).
                return state
            }

            // A genuinely new authoritative snapshot.
            if (
                state.optimisticValue != null &&
                Math.abs(event.value - state.optimisticValue) <= config.tolerance
            ) {
                // The desk reflected our move ⇒ confirmed.
                return {
                    ...state,
                    phase: "idle",
                    displayValue: event.value,
                    optimisticValue: null,
                    sentAt: null,
                    lastSeq: event.seq,
                    outcome: "confirmed",
                }
            }

            if (state.sentAt != null && event.now - state.sentAt >= config.confirmTimeoutMs) {
                // Timed out without a confirming reflection (or the desk settled
                // elsewhere) ⇒ revert to authoritative (eased, not snapped).
                return {
                    ...state,
                    phase: "idle",
                    displayValue: event.value,
                    optimisticValue: null,
                    sentAt: null,
                    lastSeq: event.seq,
                    outcome: "reverted",
                }
            }

            // Still within the window and not yet matched: keep showing optimistic.
            return { ...state, lastSeq: event.seq }
        }

        case "rejected": {
            // R2: an authoritative "no". Before this, every rejection class
            // (unauthorized / bridge-standby / superseded / malformed) was
            // indistinguishable from ordinary latency — the knob span for 2s and
            // eased back wordlessly. A rejection is terminal information, so it
            // reverts IMMEDIATELY and carries its reason to the cue.
            //
            // Ignored while `dragging`: the musician still has a finger on the
            // knob, and yanking it mid-drag is the very thing C-12 exists to
            // prevent. The ack for their eventual release will speak for itself.
            if (state.phase === "dragging") return state
            return {
                ...state,
                phase: "idle",
                displayValue: event.value,
                optimisticValue: null,
                sentAt: null,
                outcome: "rejected",
                rejectionReason: event.reason,
            }
        }

        case "tick": {
            // Wall-clock check so a timeout fires even when NO new snapshot
            // arrives. Never confirms (the `value` here may be our optimistic
            // echo, not authoritative — only `external` can confirm).
            if (
                state.phase === "pending" &&
                state.sentAt != null &&
                event.now - state.sentAt >= config.confirmTimeoutMs
            ) {
                return {
                    ...state,
                    phase: "idle",
                    displayValue: event.value,
                    optimisticValue: null,
                    sentAt: null,
                    outcome: "reverted",
                }
            }
            return state
        }

        case "clear_outcome":
            return state.outcome === null && state.rejectionReason === null
                ? state
                : { ...state, outcome: null, rejectionReason: null }

        default:
            return state
    }
}
