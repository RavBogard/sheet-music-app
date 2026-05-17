/**
 * Uniform error envelopes for the MCP write tools (W-04 bidirectional-sync).
 *
 * Two envelope shapes get shared across the seven write tools so the agent
 * sees a consistent recovery contract regardless of which write was racy.
 *
 *  - `stale_version` — optimistic-concurrency rejection: the resource was
 *    modified by another writer between the agent's last read and this
 *    write. Caller refreshes via `get_setlist` and retries.
 *
 *  - `track_not_found` — the targeted trackId no longer exists in the
 *    setlist. Most often a sibling was deleted or replaced by a parallel
 *    edit; carries the current setlist version + timestamp so the agent
 *    can re-fetch without guessing.
 *
 * Both envelopes follow the same shape pattern: machine code in
 * `error.machine_code`, human prose in `error.message`, recovery hint
 * + context fields at the top level. The factory + body type live in
 * `./errors`; this module wires the type-narrowed envelopes on top.
 *
 * Cycle-3 REG-002 migration: prior to the cowork-driven 2026-05-18 sweep,
 * `richError()` here emitted the flat shape `{ok:false, error:<slug>,
 * message, ...}`. The factory has moved to `./errors` and now emits the
 * rich-object shape `{ok:false, error:{code, machine_code, message,
 * debug?}, ...extras}`; every call-site here pre-existed and continues
 * compiling via the preserved signature.
 */

export {
    MACHINE_CODE_RE,
    ERROR_CODE_MAP,
    codeFor,
    richError,
    isRichError,
    stripDebugInProduction,
    liftLegacyErrorEnvelope,
} from "./errors"
export type { RichErrorBody, RichErrorEnvelope } from "./errors"

import {
    richError,
    type RichErrorEnvelope,
    type RichErrorBody,
} from "./errors"

/**
 * Stale-version envelope. Rich-shape: `error.machine_code` is
 * `'stale_version'`; recovery context (currentVersion, lastSeenVersion,
 * setlist provenance, optional stale-row breakdown for bulk paths) lives
 * at the top level so an agent can pull what it needs without re-keying.
 */
export interface StaleVersionEnvelope extends RichErrorEnvelope {
    error: RichErrorBody & { machine_code: "stale_version" }
    /** Server-side current version of the resource. */
    currentVersion: number
    /** What the caller asserted as their last-seen version. */
    lastSeenVersion: number
    /** Setlist-level provenance — useful for showing the user who edited. */
    setlist?: {
        lastModifiedBy?: string
        lastModifiedAt?: string
    }
    /** Bulk-atomic only: which rows specifically were stale. */
    staleRows?: Array<{
        trackId: string
        currentVersion: number
        lastSeenVersion: number
    }>
    hint: "Call get_setlist to refresh state and retry."
}

export interface TrackNotFoundEnvelope extends RichErrorEnvelope {
    error: RichErrorBody & { machine_code: "track_not_found" }
    /** Current setlist version so the agent can refresh by trackId resolution. */
    setlistVersion: number
    /** When the setlist was last touched — surfaces who/when changed it. */
    setlistLastModifiedAt: string | null
    hint: "Track may have been deleted or replaced — call get_setlist."
}

export function staleVersionEnvelope(args: {
    resource: "setlist" | "track"
    currentVersion: number
    lastSeenVersion: number
    lastModifiedBy?: string
    lastModifiedAt?: string | null
    staleRows?: StaleVersionEnvelope["staleRows"]
}): StaleVersionEnvelope {
    const which = args.resource === "track" ? "Track" : "Setlist"
    const setlist =
        args.lastModifiedBy || args.lastModifiedAt
            ? {
                  lastModifiedBy: args.lastModifiedBy,
                  lastModifiedAt: args.lastModifiedAt ?? undefined,
              }
            : undefined
    return richError(
        "stale_version",
        `${which} was modified by another writer (current version ${args.currentVersion}, you saw ${args.lastSeenVersion}).`,
        {
            currentVersion: args.currentVersion,
            lastSeenVersion: args.lastSeenVersion,
            ...(setlist ? { setlist } : {}),
            ...(args.staleRows ? { staleRows: args.staleRows } : {}),
        },
        "Call get_setlist to refresh state and retry.",
    ) as StaleVersionEnvelope
}

export function trackNotFoundEnvelope(args: {
    trackId: string
    setlistId: string
    setlistVersion: number
    setlistLastModifiedAt: string | null
}): TrackNotFoundEnvelope {
    return richError(
        "track_not_found",
        `Track ${args.trackId} not found in setlist ${args.setlistId}. It may have been deleted or replaced.`,
        {
            setlistVersion: args.setlistVersion,
            setlistLastModifiedAt: args.setlistLastModifiedAt,
        },
        "Track may have been deleted or replaced — call get_setlist.",
    ) as TrackNotFoundEnvelope
}

/**
 * Read the current numeric `version` off a Firestore doc snapshot, with a
 * safe default of 0 for rows that pre-date W-04 (no migration backfill —
 * first write stamps version = 1).
 */
export function readVersion(data: Record<string, unknown> | undefined): number {
    if (!data) return 0
    const v = data.version
    return typeof v === "number" && Number.isFinite(v) ? v : 0
}

/**
 * Pull `lastModifiedAt` (W-04 ISO sibling of Firestore's serverTimestamp
 * `updatedAt`) off a doc snapshot. Returns the ISO string as written, or
 * null if absent / mis-shaped. Used by envelope builders that surface
 * "what's the current state" context to the agent.
 */
export function readLastModifiedAt(
    data: Record<string, unknown> | undefined,
): string | null {
    if (!data) return null
    const v = data.lastModifiedAt
    return typeof v === "string" ? v : null
}

/**
 * Plan 02 write-side rejection union. Server-side write helpers return one
 * of these (or `{ ok: true, ... }`) so the MCP tool wrapper can distinguish
 * a stale-version / track-not-found envelope (structured, machine-readable)
 * from a generic `{ ok: false, error: string }` validation error.
 */
export type WriteRejection =
    | {
          ok: false
          kind: "stale_version"
          envelope: StaleVersionEnvelope
      }
    | {
          ok: false
          kind: "track_not_found"
          envelope: TrackNotFoundEnvelope
      }

/**
 * REG-001 (cycle-2) — uniform validation_error envelope used when an
 * MCP tool's inputSchema fails Zod validation. Issues mirror Zod's
 * `issues[]` shape (path, message, optional code) so an agent can surface
 * per-field guidance without parsing prose.
 *
 * Wire path: the SDK swallows the ZodError into a CallToolResult and
 * prefixes the content text with "MCP error -32602: Input validation
 * error: Invalid arguments for tool <name>: <JSON-stringified issues>".
 * `zod-envelope-remap.remapValidationResult` parses that prose, extracts
 * the issues array via `zodFormatterFromSdkProse`, and emits this rich
 * envelope on the wire so every tool sees a uniform validation shape.
 */
export interface ValidationErrorEnvelope extends RichErrorEnvelope {
    error: RichErrorBody & { machine_code: "validation_error" }
    /** Per-field Zod issues. Empty array when the SDK prose carried no parseable JSON. */
    issues: Array<{
        path: string
        message: string
        code?: string
    }>
    /** Tool name the validation failed against; null when the prose was unrecognized. */
    toolName: string | null
    hint: "Re-call the tool with corrected arguments (see issues[])."
}

/**
 * Build a `validation_error` rich envelope from a ZodError-like object
 * (anything with a non-empty `issues` array). Duck-typed so the module
 * stays zero-dep on zod.
 */
export function zodFormatter(
    err: unknown,
    toolName: string | null = null,
): ValidationErrorEnvelope {
    const issues: ValidationErrorEnvelope["issues"] = []
    if (err && typeof err === "object") {
        const maybe = err as { issues?: unknown }
        if (Array.isArray(maybe.issues)) {
            for (const raw of maybe.issues as Array<Record<string, unknown>>) {
                const path = Array.isArray(raw.path)
                    ? (raw.path as unknown[]).map(String).join(".")
                    : ""
                const message =
                    typeof raw.message === "string" ? raw.message : "invalid"
                const code = typeof raw.code === "string" ? raw.code : undefined
                issues.push(code ? { path, message, code } : { path, message })
            }
        }
    }
    const summary =
        issues.length > 0
            ? issues
                  .map((i) => `${i.path || "(root)"}: ${i.message}`)
                  .join("; ")
            : "validation failed"
    const toolLabel = toolName ? `${toolName}: ` : ""
    return richError(
        "validation_error",
        `Invalid arguments — ${toolLabel}${summary}`,
        { toolName, issues },
        "Re-call the tool with corrected arguments (see issues[]).",
    ) as ValidationErrorEnvelope
}

/**
 * Parse the SDK's validation-failure prose into a rich envelope. The MCP
 * SDK emits content text of the form:
 *
 *   "Input validation error: Invalid arguments for tool <name>: <JSON>"
 *
 * (after the `MCP error -32602: ` prefix has been stripped by the
 * remap caller). The JSON tail is `JSON.stringify(zodError.issues)`,
 * so we extract the tool name + issues and feed them through
 * `zodFormatter`. When the prose doesn't parse cleanly we fall back to
 * a one-issue envelope carrying the raw text so the agent still sees
 * something structured.
 */
export function zodFormatterFromSdkProse(
    prose: string,
): ValidationErrorEnvelope {
    const PREFIX = "Input validation error: Invalid arguments for tool "
    if (!prose.startsWith(PREFIX)) {
        return zodFormatter(
            { issues: [{ path: [], message: prose, code: "custom" }] },
            null,
        )
    }
    const rest = prose.slice(PREFIX.length)
    const colonIdx = rest.indexOf(": ")
    if (colonIdx === -1) {
        return zodFormatter(
            { issues: [{ path: [], message: prose, code: "custom" }] },
            null,
        )
    }
    const toolName = rest.slice(0, colonIdx)
    const jsonTail = rest.slice(colonIdx + 2)
    let issues: unknown = []
    try {
        issues = JSON.parse(jsonTail)
    } catch {
        return zodFormatter(
            { issues: [{ path: [], message: jsonTail, code: "custom" }] },
            toolName || null,
        )
    }
    return zodFormatter({ issues }, toolName || null)
}

/**
 * Legacy 1-key envelope kept ONLY for back-compat with callers that
 * already parse the older `{error: "Validation error — ..."}` shape.
 * New code MUST call `zodFormatter` and emit the rich envelope. The
 * wire-level remap (`zod-envelope-remap.remapValidationResult`) lifts
 * the SDK prose directly into the rich envelope, so this function
 * isn't on any hot path today.
 *
 * @deprecated Cycle-2 REG-001 — use `zodFormatter` for the rich envelope.
 */
export function zodErrorToEnvelope(
    err: unknown,
): { error: string; details?: Array<{ path: string; message: string }> } | null {
    if (!err || typeof err !== "object") return null
    const maybe = err as { name?: unknown; issues?: unknown }
    const isZod =
        maybe.name === "ZodError" ||
        (Array.isArray(maybe.issues) &&
            maybe.issues.length > 0 &&
            typeof (maybe.issues as Array<Record<string, unknown>>)[0]?.path !==
                "undefined")
    if (!isZod) return null
    const issues = Array.isArray(maybe.issues)
        ? (maybe.issues as Array<{ path?: unknown; message?: unknown }>)
        : []
    const details = issues.map((i) => ({
        path: Array.isArray(i.path) ? i.path.map(String).join(".") : "",
        message: typeof i.message === "string" ? i.message : "invalid",
    }))
    const summary =
        details.length > 0
            ? details.map((d) => `${d.path || "(root)"}: ${d.message}`).join("; ")
            : "validation failed"
    return { error: `Validation error — ${summary}`, details }
}

/**
 * REG-001b (cycle-2) — uniform role-refusal envelope. The MCP wire
 * surface used to mix bare-prose throws (`return {error: "Only admins
 * may ..."}`) with the rich shape; this factory standardizes the
 * machine code to `forbidden_role` and exposes the caller's actual role
 * + the set of accepted roles so the agent (or its operator) can either
 * elevate the caller or pick a different tool. Mirror of the rich
 * envelopes `create_test_account` / `revoke_test_account` already emit.
 */
export interface ForbiddenRoleEnvelope extends RichErrorEnvelope {
    error: RichErrorBody & { machine_code: "forbidden_role" }
    callerRole: string | null
    requiredRoles: string[]
    hint: string
}

export function forbiddenRoleEnvelope(args: {
    callerRole: string | null | undefined
    requiredRoles: readonly string[]
    message?: string
    hint?: string
    /** Optional extra context (e.g. setlistId, collection). Spread alongside. */
    context?: Record<string, unknown>
}): ForbiddenRoleEnvelope {
    const required = [...args.requiredRoles]
    const role = args.callerRole ?? null
    const message =
        args.message ??
        `This action requires one of: ${required.join(", ")}. Your account role is ${
            role ?? "unknown"
        }.`
    const hint =
        args.hint ??
        `Ask an admin to elevate your account, or call a tool your role is allowed to use.`
    return richError(
        "forbidden_role",
        message,
        {
            callerRole: role,
            requiredRoles: required,
            ...(args.context ?? {}),
        },
        hint,
    ) as ForbiddenRoleEnvelope
}

/**
 * Helper to attach `version: prev+1 + lastModifiedAt + lastModifiedBy`
 * to an outgoing write payload. Used by Plan 01 on every write path so
 * Plan 02's lastSeenVersion checks have data to compare against.
 *
 * Doesn't touch the existing `updatedAt: FieldValue.serverTimestamp()`
 * the write paths already stamp — `lastModifiedAt` is its ISO sibling
 * for envelope display; `updatedAt` stays the canonical Firestore-side
 * timestamp.
 */
export function stampVersionWrite(
    payload: Record<string, unknown>,
    prevVersion: number,
    actorUid?: string,
): Record<string, unknown> {
    payload.version = prevVersion + 1
    payload.lastModifiedAt = new Date().toISOString()
    if (actorUid) payload.lastModifiedBy = actorUid
    return payload
}
