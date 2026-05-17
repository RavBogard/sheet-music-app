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
 * Both envelopes follow the same shape pattern: `error` (machine code),
 * `message` (human-readable), `hint` (next-step recovery), plus context
 * fields specific to the rejection class.
 *
 * Used by:
 *  - Plan 01 (this): types exported; helpers used by Plan 02 + Plan 03.
 *  - Plan 02: update_track / update_setlist / remove_track /
 *    reorder_setlist / delete_setlist call `staleVersionEnvelope` when
 *    `lastSeenVersion` doesn't match.
 *  - Plan 03: bulk_update_tracks pre-flight; publish_setlist required
 *    version check.
 */

/**
 * F-015 (cycle-1) canonical rich-error envelope. Every MCP tool error
 * surfaces this shape on the wire so agents have a uniform recovery
 * contract regardless of which tool failed.
 *
 *   { ok: false, error: <machine_code>, message: <human>, ...context, hint }
 *
 * `StaleVersionEnvelope` + `TrackNotFoundEnvelope` (below) are the
 * pre-existing instances of this shape. Generic prose errors that don't
 * have a dedicated envelope go through the `richError()` factory at the
 * call site, OR through the `jsonResult` wrapper's `normalizeErrorEnvelope`
 * adapter which lifts legacy `{ error: "prose" }` returns to the rich
 * shape on the wire automatically. New tools should call `richError`
 * directly so the machine code is meaningful, not the prose fallback.
 */
export interface RichErrorEnvelope {
    ok: false
    error: string
    message: string
    hint?: string
    [key: string]: unknown
}

export function richError(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
    hint?: string,
): RichErrorEnvelope {
    return {
        ok: false,
        error: code,
        message,
        ...context,
        ...(hint ? { hint } : {}),
    }
}

export interface StaleVersionEnvelope {
    ok: false
    error: "stale_version"
    message: string
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

export interface TrackNotFoundEnvelope {
    ok: false
    error: "track_not_found"
    message: string
    /** Current setlist version so the agent can refresh by trackId resolution. */
    setlistVersion: number
    /** When the setlist was last touched — surfaces who/when changed it. */
    setlistLastModifiedAt: string | null
    hint: "Track may have been deleted or replaced — call get_setlist."
}

export function staleVersionEnvelope(
    args: {
        resource: "setlist" | "track"
        currentVersion: number
        lastSeenVersion: number
        lastModifiedBy?: string
        lastModifiedAt?: string | null
        staleRows?: StaleVersionEnvelope["staleRows"]
    },
): StaleVersionEnvelope {
    const which = args.resource === "track" ? "Track" : "Setlist"
    return {
        ok: false,
        error: "stale_version",
        message: `${which} was modified by another writer (current version ${args.currentVersion}, you saw ${args.lastSeenVersion}).`,
        currentVersion: args.currentVersion,
        lastSeenVersion: args.lastSeenVersion,
        setlist:
            args.lastModifiedBy || args.lastModifiedAt
                ? {
                      lastModifiedBy: args.lastModifiedBy,
                      lastModifiedAt: args.lastModifiedAt ?? undefined,
                  }
                : undefined,
        staleRows: args.staleRows,
        hint: "Call get_setlist to refresh state and retry.",
    }
}

export function trackNotFoundEnvelope(args: {
    trackId: string
    setlistId: string
    setlistVersion: number
    setlistLastModifiedAt: string | null
}): TrackNotFoundEnvelope {
    return {
        ok: false,
        error: "track_not_found",
        message: `Track ${args.trackId} not found in setlist ${args.setlistId}. It may have been deleted or replaced.`,
        setlistVersion: args.setlistVersion,
        setlistLastModifiedAt: args.setlistLastModifiedAt,
        hint: "Track may have been deleted or replaced — call get_setlist.",
    }
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
 * F-02 from bugstomp 2026-05-16 (deferred to W-04): Zod validation failures
 * inside an MCP tool currently propagate as raw JSON-RPC `-32602` protocol
 * errors. Agent clients see the protocol code but lose the `{error: "..."}`
 * envelope shape every other tool path uses. This helper translates a
 * thrown ZodError into the standard envelope so tool wrappers can call it
 * uniformly via try/catch in the handler.
 *
 * Usage: wrap a tool body in `try { ... } catch (e) { return jsonResult(
 *   zodErrorToEnvelope(e) ?? { error: "Unexpected: " + String(e) }) }`.
 *
 * Returns null when the error isn't shaped like a ZodError, so callers
 * can fall through to their normal error path.
 */
export function zodErrorToEnvelope(
    err: unknown,
): { error: string; details?: Array<{ path: string; message: string }> } | null {
    if (!err || typeof err !== "object") return null
    // ZodError has a constructor.name and a flat `issues` array. We don't
    // import zod here to keep this module dependency-free — duck-type instead.
    const maybe = err as {
        name?: unknown
        issues?: unknown
    }
    const isZod =
        maybe.name === "ZodError" ||
        (Array.isArray(maybe.issues) &&
            maybe.issues.length > 0 &&
            typeof (maybe.issues as Array<Record<string, unknown>>)[0]?.path !== "undefined")
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
