/**
 * v11.2-05-02 (BUG-8): single MCP-response-boundary timestamp normalizer.
 *
 * Some tools echo a raw Firestore re-read (e.g. add_track_to_setlist returns
 * `track: { ...trackSnap.data() }`), so `updatedAt` is a Firestore admin
 * `Timestamp`. When that object hits `JSON.stringify` its `.toJSON()` emits
 * `{_seconds, _nanoseconds}` — an inconsistent, hard-to-consume shape next to
 * the ISO strings other tools return (`lastModifiedAt`, get_setlist). Rather
 * than patch each tool, `jsonResult` runs this single deep pass so EVERY tool
 * response renders timestamps as ISO-8601 strings.
 *
 * Pure + firebase-admin-free (duck-types the Timestamp) so it never drags
 * admin into a client bundle. Idempotent over already-ISO / ms-number values,
 * and non-destructive to every non-timestamp field. Mirrors the conversion
 * rules of `toIsoString` in server-tracks-write.ts (the update_track echo).
 */

function toIso(date: Date): string | null {
    try {
        return date.toISOString()
    } catch {
        return null
    }
}

/**
 * Recursively convert Firestore timestamps to ISO strings within an arbitrary
 * JSON-ish value. Recognizes three shapes:
 *  - a live Firestore `Timestamp` (admin or client) — has a `toDate()` method;
 *  - the already-serialized `{_seconds, _nanoseconds}` shape (admin toJSON);
 *  - the client `{seconds, nanoseconds}` shape (when stripped of methods).
 * Everything else (strings, numbers, booleans, null, plain objects, arrays) is
 * preserved, recursing into objects/arrays.
 */
export function serializeTimestamps(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value

    // 1. Live Timestamp instance (admin or client) — has toDate().
    const maybeTs = value as { toDate?: unknown }
    if (typeof maybeTs.toDate === "function") {
        try {
            return toIso((value as { toDate(): Date }).toDate())
        } catch {
            return null
        }
    }

    // 2. Arrays — map recursively (before the plain-object branch).
    if (Array.isArray(value)) {
        return value.map(serializeTimestamps)
    }

    // 3. Already-serialized Timestamp shape: EXACTLY {_seconds,_nanoseconds} or
    //    {seconds,nanoseconds}, both numeric, no other keys. The strict
    //    two-key guard prevents misreading a domain object that merely carries
    //    a `seconds`/`_seconds` field among others.
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 2) {
        const sec = obj._seconds ?? obj.seconds
        const nanos = obj._nanoseconds ?? obj.nanoseconds
        const hasUnderscore = "_seconds" in obj && "_nanoseconds" in obj
        const hasPlain = "seconds" in obj && "nanoseconds" in obj
        if (
            (hasUnderscore || hasPlain) &&
            typeof sec === "number" &&
            typeof nanos === "number"
        ) {
            return toIso(new Date(sec * 1000 + Math.floor(nanos / 1e6)))
        }
    }

    // 4. Plain object — rebuild with each value recursed.
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
        out[k] = serializeTimestamps(v)
    }
    return out
}
