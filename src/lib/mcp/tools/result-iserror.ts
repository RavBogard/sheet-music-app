/**
 * F-001 — single source of truth for "does this normalized MCP tool result
 * represent an error?". The MCP SDK surfaces tool failures to the client via
 * the `isError: true` flag on the tool result. Zod input-validation failures
 * already set it (via the SDK's own remap), but our *runtime* rejections —
 * the rich `{ ok: false, error: {...} }` envelopes every tool emits on a
 * handled failure — were returned as plain content with `isError` unset, so
 * the client could not distinguish a refusal/error from a success.
 *
 * Per [[feedback_mcp_validation_shape]] validation/runtime failures must
 * surface as `result.isError: true` with content prose — NOT as a JSON-RPC
 * `error.code`. This predicate is the runtime-path half of that contract.
 *
 * A result is an error iff it is an object carrying `ok: false` — the
 * canonical wire shape produced by `richError()` / `liftLegacyErrorEnvelope`.
 * Success envelopes are either `ok: true` or carry no `ok` field at all
 * (plain data payloads), so neither trips this check.
 */
export function isErrorEnvelope(normalized: unknown): boolean {
    return (
        normalized !== null &&
        typeof normalized === "object" &&
        (normalized as Record<string, unknown>).ok === false
    )
}
