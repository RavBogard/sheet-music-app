import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * Admin-only Firestore collection sizing probe.
 *
 * cycle-5 C5D-013 — the cowork field-data sink (`webVitalsObservations`)
 * grows unbounded by design (one doc per metric per visitor per page-load).
 * The product needs a cheap way to ask "how much space am I burning" without
 * exporting from the console. This tool returns a bytes/doc-count summary
 * for any collection name, with an optional `since` cutoff so trend probes
 * stay cheap.
 *
 * Notes on the estimate:
 *   - We compute `estimatedBytes` by JSON-stringifying each doc's data and
 *     summing the UTF-8 byte lengths plus a small per-doc overhead for the
 *     document name. This is an UPPER bound on the wire-encoded payload,
 *     LOWER bound on actual Firestore storage (which adds indexes, history,
 *     and per-field name overhead). Good enough for trend-spotting, not
 *     authoritative for billing.
 *   - `since`, when provided, filters on a `timestamp` field that is a
 *     Firestore Timestamp. Collections without that field will return
 *     `{docCount: 0}` for the filtered scan — pass no `since` to get the
 *     full collection.
 */

export interface DumpCollectionSizeArgs {
    collection: string
    since?: string // ISO 8601
    /** Optional safety cap; defaults to 50k docs to keep a runaway probe bounded. */
    maxDocs?: number
}

export interface DumpCollectionSizeResult {
    collection: string
    docCount: number
    estimatedBytes: number
    oldestTimestamp: string | null
    newestTimestamp: string | null
    /** Set when `maxDocs` clamped the scan. False otherwise. */
    truncated: boolean
    scannedAt: string
    sinceFilter: string | null
}

const DEFAULT_MAX_DOCS = 50_000
const HARD_MAX_DOCS = 200_000

/**
 * Allowlist of admin uids would normally be passed in by the caller; here we
 * follow the trusted-leader pattern used elsewhere in MCP. Admin-only because
 * surface area (any collection name) is broad and the estimate touches every
 * document.
 */
async function loadCallerRole(uid: string): Promise<string | undefined> {
    const db = getFirestore()
    const snap = await db.collection("users").doc(uid).get()
    if (!snap.exists) return undefined
    const data = snap.data() as Record<string, unknown> | undefined
    return typeof data?.role === "string" ? data.role : undefined
}

function approxBytes(docId: string, data: Record<string, unknown>): number {
    // JSON encoding is an upper bound on wire payload; add docId bytes + a
    // small constant for the path/name overhead. Encoding errors fall back
    // to zero so a single weird field doesn't poison the aggregate.
    try {
        return (
            Buffer.byteLength(JSON.stringify(data), "utf8") +
            Buffer.byteLength(docId, "utf8") +
            32
        )
    } catch {
        return 0
    }
}

export async function dumpCollectionSize(
    callerUid: string,
    args: DumpCollectionSizeArgs,
): Promise<DumpCollectionSizeResult | RichErrorEnvelope> {
    initAdmin()

    const role = await loadCallerRole(callerUid)
    if (role !== "admin") {
        return richError(
            "forbidden",
            "dump_collection_size requires admin role.",
            { callerRole: role ?? null },
            "Sign in as admin or ask one to dump the collection for you.",
        )
    }

    const collection = args.collection?.trim()
    if (!collection) {
        return richError(
            "invalid_collection",
            "collection must be a non-empty string.",
            { requestedCollection: args.collection },
        )
    }
    if (collection.includes("/")) {
        return richError(
            "subcollection_unsupported",
            "Only top-level collection names are supported (no `/`).",
            { requestedCollection: collection },
            "Pass just the collection name, e.g. 'webVitalsObservations'.",
        )
    }

    let sinceTs: Timestamp | null = null
    if (args.since !== undefined) {
        const parsed = Date.parse(args.since)
        if (Number.isNaN(parsed)) {
            return richError(
                "invalid_since",
                "`since` must be an ISO 8601 datetime.",
                { requestedSince: args.since },
            )
        }
        sinceTs = Timestamp.fromMillis(parsed)
    }

    const maxDocs = Math.min(
        Math.max(1, args.maxDocs ?? DEFAULT_MAX_DOCS),
        HARD_MAX_DOCS,
    )

    const db = getFirestore()
    let query: FirebaseFirestore.Query = db.collection(collection)
    if (sinceTs) query = query.where("timestamp", ">=", sinceTs)
    const snap = await query.limit(maxDocs + 1).get()
    const truncated = snap.size > maxDocs
    const docs = truncated ? snap.docs.slice(0, maxDocs) : snap.docs

    let estimatedBytes = 0
    let oldestMs: number | null = null
    let newestMs: number | null = null
    for (const doc of docs) {
        const data = doc.data() as Record<string, unknown>
        estimatedBytes += approxBytes(doc.id, data)
        const ts = data.timestamp
        if (ts instanceof Timestamp) {
            const ms = ts.toMillis()
            if (oldestMs === null || ms < oldestMs) oldestMs = ms
            if (newestMs === null || ms > newestMs) newestMs = ms
        }
    }

    return {
        collection,
        docCount: docs.length,
        estimatedBytes,
        oldestTimestamp: oldestMs !== null ? new Date(oldestMs).toISOString() : null,
        newestTimestamp: newestMs !== null ? new Date(newestMs).toISOString() : null,
        truncated,
        scannedAt: new Date().toISOString(),
        sinceFilter: sinceTs ? new Date(sinceTs.toMillis()).toISOString() : null,
    }
}
