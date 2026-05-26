/**
 * `formatError` — uniform user-visible string for an `unknown` value
 * caught at a UI error-handling boundary.
 *
 * The bug this exists to kill: somewhere in our UI we used to write
 *
 *     err instanceof Error ? err.message : String(err)
 *
 * and pass the result to `toast.error(…)` / `setError(…)` / JSX. When
 * `err` is one of our MCP rich error envelopes — shape
 * `{ ok: false, error: { message, code, machine_code, … } }` — the
 * `String(err)` fallback produces `"[object Object]"` and that lands
 * in front of the user. Useless on an iPad mid-service.
 *
 * `formatError` extracts a meaningful string from every shape we
 * realistically catch:
 *
 *  - `string` → returned as-is. (Some callers `throw "literal"`.)
 *  - `Error` → `err.message`. (`.name` is intentionally dropped here so
 *    every callsite renders the same. A site that wants `.name: .message`
 *    still narrows on `instanceof Error` itself — see
 *    `DashboardClient.tsx`.)
 *  - `RichErrorEnvelope`-shaped object (`{ ok: false, error: { message } }`)
 *    → `error.message`. Permissive: we don't require `code` /
 *    `machine_code` (the canonical `isRichError` does); just the
 *    `error.message` string is enough to render usefully. Legacy
 *    pre-rich-shape envelopes that already lifted via
 *    `liftLegacyErrorEnvelope` fit this branch too.
 *  - `{ message: string }` plain object (e.g. a JSON-decoded HTTP
 *    error body) → `message`.
 *  - everything else (`null`, `undefined`, `{}`, numbers, booleans,
 *    arrays, an object whose `message` isn't a string) → `"Unknown error"`.
 *
 * This is deliberately permissive on the envelope shape so a route
 * handler that returns `{ ok: false, error: { message: "…" } }` without
 * the full rich-error contract still renders correctly.
 */
export function formatError(err: unknown): string {
    if (typeof err === "string") return err
    if (err instanceof Error) return err.message
    if (err && typeof err === "object") {
        const obj = err as Record<string, unknown>
        // RichErrorEnvelope shape: { ok: false, error: { message, ... } }
        if (obj.ok === false && obj.error && typeof obj.error === "object") {
            const inner = obj.error as Record<string, unknown>
            if (typeof inner.message === "string" && inner.message.length > 0) {
                return inner.message
            }
        }
        // Plain { message: string } — e.g. a parsed HTTP error body.
        if (typeof obj.message === "string" && obj.message.length > 0) {
            return obj.message
        }
    }
    return "Unknown error"
}
