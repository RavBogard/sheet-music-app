/**
 * Cycle-3 REG-002 rich-error envelope foundation.
 *
 * The MCP + HTTP error wire shape across this app is:
 *
 *   {
 *     ok: false,
 *     error: {
 *       code: number,         // HTTP-like (400 / 401 / 403 / 404 / 409 / 429 / 500 ...)
 *       machine_code: string, // /^[a-z][a-z0-9_]*$/ — agent-parseable slug
 *       message: string,      // human-readable
 *       debug?: unknown       // optional diagnostic blob, redact at HTTP boundary
 *     },
 *     ...extras                // dryRunPlan, issues[], hint, fileId, setlistId, ...
 *   }
 *
 * The cycle-3 cowork sweep (HANDOFF-TO-SUPERVISOR.md → findings.jsonl
 * lines REG-002/REG-003/SEC-001) found that b1's rich-error sweep landed
 * a FLAT shape (`error: <string-slug>` with code+message peers) and the
 * REC-2 spec / standing rule #12 explicitly call for the rich-OBJECT
 * shape above. This module is the single source of truth for the new
 * shape; `error-envelopes.ts` re-exports + delegates to keep the
 * historical signature compatible while shifting the wire output.
 *
 * Signature preserved from b1: `richError(machine_code, message, extras?,
 * hint?)`. 200+ existing call-sites continue compiling unchanged — only
 * the wire shape shifts. `debug` is opt-in via the `extras.debug` key
 * (callers strip it in production via `redactInProduction` from
 * `@/lib/http/error-envelope` before passing the envelope through the
 * HTTP boundary; in MCP tool responses it lives in dev/test only).
 */

/**
 * Snake_case enforcement on machine codes. Asserted by
 * `mcp-error-code-regex.test.ts` against every `richError("...", ...)`
 * call site in `src/lib/mcp/tools/**` so prose can't slip back into the
 * machine slot. Human-readable text belongs in `message`.
 */
export const MACHINE_CODE_RE = /^[a-z][a-z0-9_]*$/

/**
 * HTTP-like code map for common machine codes. Unknown codes default to
 * 500 (per cycle-3 cowork's "unknown machine_code → generic server
 * error" recommendation; callers that need a specific code should pass
 * `extras.errorCode` to override). Keep this list narrow — adding a row
 * is cheap; using the wrong code is a soft contract bug.
 */
export const ERROR_CODE_MAP: Record<string, number> = {
    // 400 — request body / argument problems the caller can fix locally
    bad_request: 400,
    invalid_argument: 400,
    invalid_field: 400,
    invalid_state: 400,
    // Task 7 fix round 1 (liturgy outlines Phase 3): a client-correctable
    // input error, not a server fault. Without these rows codeFor() defaults
    // to 500 — which an LLM caller reads as "transient, retry" instead of
    // "your input is wrong, fix it or ask" — the opposite of this feature's
    // stop-and-ask design intent.
    unknown_book: 400,
    folio_out_of_range: 400,
    unknown_unit_id: 400,
    invalid_bus_index: 400,
    invalid_role: 400,
    validation_error: 400,
    no_bonded_songs: 400,
    no_valid_recipients: 400,
    no_charts: 400,
    reorder_failed: 400, // v11.2-03 (BUG-2): caller-supplied bad/incomplete orderedTrackIds set
    title_required: 400, // v11.2-03-02 (BUG-3): bulk/single add row has neither title nor resolvable songId
    no_changes: 400,
    empty_file: 400,
    empty_patch: 400,
    empty_setlist: 400,
    duplicate_chart: 400,
    publish_refused_unhealthy_charts: 400,
    bridge_mode_required: 400,
    // N1 of REFUSALS-AND-PAIRS (R-0904-live-cw-7 / -9). `dedupe_library`
    // refuses `forceScore` together with `force` — the fuzzy lane may plan,
    // never commit. That is a refused ARGUMENT COMBINATION the caller can fix
    // locally, not an authorization failure (there is no permission that
    // grants it) and not a conflict. Without this row `codeFor()` defaulted to
    // 500, so a deliberate, permanent refusal read to an LLM caller as
    // "transient, retry" — see the :56 comment above. Behaviour unchanged;
    // the row IS the fix.
    fuzzy_execution_refused: 400,
    payload_too_large: 413,

    // 401 — caller is unauthenticated
    unauthenticated: 401,
    invalid_bearer: 401,
    missing_bearer: 401,

    // 403 — caller is authenticated but lacks the required role / scope
    forbidden: 403,
    forbidden_role: 403,
    forbidden_assignment: 403,
    not_a_test_uid: 403,
    not_authorized: 403,
    monitor_access_denied: 403,

    // 404 — target does not exist
    not_found: 404,
    setlist_not_found: 404,
    track_not_found: 404,
    song_not_found: 404, // v11.2-03 (BUG-2): add_track/update_track/swap_chart/update_song unknown songId

    file_not_found: 404,
    row_not_found: 404,
    chart_not_found: 404,
    // B2 of GREEN-BASELINE (R-0904-live-cw-12). `undo_dedupe_group` throws
    // this when no `dedupeRuns/{runId}` exists (undo-dedupe.ts:314). A record
    // that does not exist is not a server fault — without a row here the
    // default at :161 made a plain not-found present as `500`, which an LLM
    // caller reads as "transient, retry". Same defect as N1's
    // `fuzzy_execution_refused`, one row away. Behaviour unchanged.
    run_not_found: 404,
    queue_doc_missing: 404,
    musician_not_found: 404,
    assignment_not_found: 404,
    user_not_found: 404,
    contact_not_found: 404, // v11.5-04-01 (M-11): missing/cross-org contact is a 404, not the default 500

    // 409 — caller's view of the world is out of date OR safety contract requires explicit force
    conflict: 409,
    stale_version: 409,
    already_exists: 409,
    force_required: 409,
    already_bonded: 409,
    idempotency_key_reused: 409,
    operation_in_progress: 409,
    // N2 of REFUSALS-AND-PAIRS. `mark_chart_status` refuses to hide a row
    // that live, in-tenant setlists still bond (`R-0903-live-cw-8`: a mark is
    // byte-identical AND UNBONDED). A conflict, not a bad argument: the
    // fileId is correct and the caller may re-issue it once the bonds move.
    mark_refused_row_is_bonded: 409,
    batch_rolled_back: 409, // v11.2-03-02 (BUG-3): atomic-batch collateral — a sibling row failed pre-validation

    // 422 — request is structurally valid but logically rejected
    unprocessable: 422,
    correction_stats_read_failed: 422,

    // 429 — rate-limited
    rate_limited: 429,

    // 500 — server-side bug / unexpected internal failure
    server_error: 500,
    custom_token_exchange_failed: 502,
    upstream_unavailable: 502,
    session_cookie_mint_failed: 500,
    user_enable_failed: 500,
    server_misconfigured: 500,
    server_not_ready: 503,

    // packet/storage failures
    packet_too_large: 413,
    storage_write_failed: 502,
    drive_fetch_failed: 502,
}

/**
 * Resolve a machine code to its HTTP-like status code. Unknown codes
 * default to 500 — adding a row to `ERROR_CODE_MAP` is the migration
 * path for any new machine_code that needs a non-500 code.
 *
 * Callers MAY override the code by passing `extras.errorCode: number`
 * to `richError()`; the helper extracts it and uses it as the `code`
 * value in the rich body.
 */
export function codeFor(machine_code: string): number {
    return ERROR_CODE_MAP[machine_code] ?? 500
}

/**
 * The body of every rich error envelope. `code` is the HTTP-like
 * numeric code (so a single error parser can branch on retry-vs-fix
 * semantics without a machine_code lookup table); `machine_code` is
 * the agent-parseable slug; `message` is the human prose. `debug` is
 * the optional diagnostic blob — production callers strip it at the
 * HTTP boundary via `redactInProduction` from `@/lib/http/error-envelope`.
 */
export interface RichErrorBody {
    code: number
    machine_code: string
    message: string
    debug?: unknown
}

/**
 * Full rich-error envelope. `error` is the body object; everything else
 * (hint, dryRunPlan, fileId, issues[], context fields, etc) is attached
 * at the top level by callers via `extras`. The TYPE exposes only
 * `ok: false` + `error` so a `Result | RichErrorEnvelope` union narrows
 * cleanly on the success branch: TypeScript can prove the success
 * shape's specific keys are NOT on the error branch. Runtime extras
 * still ship on the wire — they just need a cast (or a typed extras
 * shape) for the rare caller that wants to read them back.
 */
export interface RichErrorEnvelope {
    ok: false
    error: RichErrorBody
}

/**
 * Primary rich-error factory. Builds a `RichErrorEnvelope` from a
 * snake_case machine code + human message, with optional extras +
 * hint. Signature mirrors b1's flat-shape `richError` so the 200+
 * existing call-sites continue compiling — only the wire shape shifts.
 *
 * Extras keys handled specially:
 *  - `debug` (any type) → moves into `error.debug` on the body.
 *  - `errorCode` (number) → overrides `error.code` (use this when the
 *    machine_code isn't in `ERROR_CODE_MAP` and the call site knows
 *    the right HTTP-like code).
 *  - everything else spreads at the top level as agent-visible context.
 *
 * `hint`, when provided, is appended at the top level as a recovery
 * prose field — keeps existing call-site ergonomics.
 *
 * NOTE: the machine_code regex is NOT enforced at runtime here (so a
 * misshapen code throws a CI test failure, not a 500 in prod). The
 * `mcp-error-code-regex.test.ts` source-scan catches drift at PR time.
 */
export function richError<
    E extends Record<string, unknown> = Record<string, never>,
>(
    machine_code: string,
    message: string,
    extras?: E,
    hint?: string,
): RichErrorEnvelope & E & { hint?: string } {
    const { debug, errorCode, ...rest } = (extras ?? {}) as E & {
        debug?: unknown
        errorCode?: unknown
    }
    const code = typeof errorCode === "number" ? errorCode : codeFor(machine_code)
    const body: RichErrorBody = { code, machine_code, message }
    if (debug !== undefined) body.debug = debug
    const envelope: RichErrorEnvelope &
        Record<string, unknown> & { hint?: string } = {
        ok: false,
        error: body,
        ...rest,
    }
    if (hint) envelope.hint = hint
    return envelope as RichErrorEnvelope & E & { hint?: string }
}

/**
 * Type guard: returns `true` when `value` is the rich-error envelope
 * shape (ok: false, error is the body object). Callers that need to
 * branch on "this came from richError" use this; readers that just
 * want the machine_code do `(value as any).error?.machine_code`.
 */
export function isRichError(value: unknown): value is RichErrorEnvelope {
    if (!value || typeof value !== "object") return false
    const v = value as Record<string, unknown>
    if (v.ok !== false) return false
    const e = v.error
    if (!e || typeof e !== "object") return false
    const body = e as Record<string, unknown>
    return (
        typeof body.code === "number" &&
        typeof body.machine_code === "string" &&
        typeof body.message === "string"
    )
}

/**
 * Strip `error.debug` from a rich envelope in production. Use at the
 * HTTP boundary so internal diagnostics never reach the wire in prod
 * but stay visible in dev / test for triage. Mirrors the existing
 * `redactInProduction` helper in `@/lib/http/error-envelope` (which
 * strips top-level extras); this one strips the nested `debug` field
 * specifically.
 *
 * Idempotent — calling on an envelope without `debug` is a no-op.
 */
export function stripDebugInProduction(envelope: RichErrorEnvelope): RichErrorEnvelope {
    if (process.env.NODE_ENV !== "production") return envelope
    if (envelope.error.debug === undefined) return envelope
    const { debug: _debug, ...bodyRest } = envelope.error
    return {
        ...envelope,
        error: bodyRest as RichErrorBody,
    }
}

/**
 * Lift a legacy flat-shape error (`{ok:false, error:'prose', message?,
 * ...extras, hint?}` or `{error:'prose', ...}` with no ok field) to
 * the rich envelope shape. Used by `tools/index.ts:normalizeErrorEnvelope`
 * as wire-level defense-in-depth so any emit path that bypasses
 * `richError()` still ships the canonical shape on the wire.
 *
 * Heuristics:
 *  - If input has `error` field that's already an object with
 *    `machine_code`, treat it as already-rich and return as-is.
 *  - If input has `error: <string>`, use that as the machine_code;
 *    promote `message` (or fall back to the string itself); spread
 *    every other key (minus `ok`/`error`/`message`/`hint`) as extras;
 *    preserve `hint` if present.
 *  - If input doesn't look like an error at all, return unchanged.
 */
export function liftLegacyErrorEnvelope(value: unknown): unknown {
    if (!value || typeof value !== "object") return value
    const obj = value as Record<string, unknown>

    // Already a rich envelope? passthrough.
    if (isRichError(obj)) return obj

    // Has explicit ok: true / undefined? leave success shapes alone.
    if (obj.ok !== false && !("error" in obj)) return obj

    // Error field must be a string for the lift to apply.
    const errorStr = obj.error
    if (typeof errorStr !== "string") return obj

    const {
        ok: _ok,
        error: _error,
        message: rawMessage,
        hint: rawHint,
        ...rest
    } = obj

    const message =
        typeof rawMessage === "string" && rawMessage ? rawMessage : errorStr
    const hint = typeof rawHint === "string" ? rawHint : undefined
    return richError(errorStr, message, rest, hint)
}
