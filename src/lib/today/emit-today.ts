import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getStorage } from "firebase-admin/storage"
import { serializeSetlist, getServerCongregationConfig } from "@/lib/server-auth"
import { MAX_SETLIST_FETCH } from "@/lib/server-setlists"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { buildTodayDoc, type TodaySetlistInput } from "./build-today"
import { computeWeek, isFamilyOrg, storedWeek, type StoredWeek } from "@/lib/family/week-key"
import { readServicesFromConfig, readStreamFromConfig } from "./config"
import { TODAY_CACHE_CONTROL, todayStoragePath, type TodayDoc } from "./types"

/**
 * The I/O half of `today.json`: read the org's setlists + the congregation
 * config and hand them to the pure builder. `/api/today` builds on each request
 * that reaches it (the CDN caches the answer for a minute) and keeps the last
 * good build in Storage so a failed build can still be answered. See
 * `build-today.ts` for what it decides and `types.ts` for what may never appear
 * in the output.
 */

/**
 * `eventDate` is stored with MIXED Firestore types across `setlists` —
 * Timestamp on newer rows, ISO string on older/cloned ones. A
 * `.where("eventDate", ">=", …)` range filter matches ONLY the Timestamp-typed
 * ones, so it would silently drop half the services. Same lesson as
 * `server-setlists.ts`: order by the type-consistent `date`, serialize, and do
 * the event-day window in memory.
 */
async function fetchSetlistsForToday(
    db: FirebaseFirestore.Firestore,
    org: OrgId,
): Promise<TodaySetlistInput[]> {
    const snap = await db
        .collection("setlists")
        .where("orgId", "==", org)
        .orderBy("date", "desc")
        .limit(MAX_SETLIST_FETCH)
        .get()

    // R2-f: no publish filter here. CRC never publishes; the window and the
    // `isTest` exclusion (applied in the pure builder) are the whole gate.
    return snap.docs
        .map((d) => serializeSetlist(d.id, d.data()))
        .map((s: Record<string, unknown>) => s as unknown as TodaySetlistInput)
}

/**
 * First `liturgyRef.folio` in track order.
 *
 * One query per candidate setlist, and the candidates are the handful of
 * services inside a seven-day window, so the fan-out is bounded by the
 * calendar rather than by the library. Firestore cannot filter on a nested
 * optional field, so the scan happens in memory over an already-small row set.
 * Fail-soft: a failed read means no `startFolio`, never a failed emit.
 */
async function startFolioFor(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
): Promise<number | null> {
    try {
        const snap = await db
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .orderBy("order", "asc")
            .get()
        for (const doc of snap.docs) {
            const ref = doc.data().liturgyRef as { folio?: unknown } | undefined
            if (ref && Number.isInteger(ref.folio)) return ref.folio as number
        }
        return null
    } catch (err) {
        logger.warn("[today] startFolio lookup failed (fail-soft)", {
            setlistId,
            err: err instanceof Error ? err.message : String(err),
        })
        return null
    }
}

/** Build the document for one org without writing it anywhere. */
export async function buildToday(
    org: OrgId = DEFAULT_ORG_ID,
    now: Date = new Date(),
): Promise<TodayDoc> {
    initAdmin()
    const db = getFirestore()

    const [setlists, config] = await Promise.all([
        fetchSetlistsForToday(db, org),
        getServerCongregationConfig(org),
    ])

    // Narrow to the window first (cheaply, with no startFolio), then resolve
    // startFolio only for the services that actually made it in.
    const shortlist = buildTodayDoc({
        setlists,
        services: readServicesFromConfig(config as Record<string, unknown> | null),
        stream: readStreamFromConfig(config as Record<string, unknown> | null),
        now,
        org,
    })
    const wanted = new Set(shortlist.services.map((s) => s.setlistId))
    const folios = new Map<string, number | null>()
    await Promise.all(
        [...wanted].map(async (id) => folios.set(id, await startFolioFor(db, id))),
    )

    // BET-6: a week the browser editor's date edit left stale (or never had)
    // is computed live for the handful of services in the window. Fail-soft.
    const live = new Map<string, StoredWeek | null>()
    if (isFamilyOrg(org)) {
        await Promise.all(
            setlists
                .filter((s) => wanted.has(s.id) && !storedWeek(s as unknown as Record<string, unknown>, org))
                .map(async (s) => {
                    const week = await computeWeek(s.eventDate, org)
                    live.set(s.id, week ? { weekKey: week.weekKey, parasha: week.parasha } : null)
                }),
        )
    }

    return buildTodayDoc({
        setlists: setlists.map((s) => ({ ...s, startFolio: folios.get(s.id) ?? null, liveWeek: live.get(s.id) ?? null })),
        services: readServicesFromConfig(config as Record<string, unknown> | null),
        stream: readStreamFromConfig(config as Record<string, unknown> | null),
        now,
        org,
    })
}

/**
 * Keep `doc` as the org's last good build at `public/today/<org>.json`.
 *
 * Per-org by construction: the path is keyed by `org`, so two tenants can never
 * share a file. The object is not public (storage.rules deny it); only
 * `/api/today` reads it back, when a build fails. No lock: concurrent writers
 * write equally good documents and the last one wins. Never throws — a failed
 * write costs the fallback some freshness, never the response.
 */
export async function storeToday(org: OrgId, doc: TodayDoc): Promise<boolean> {
    try {
        initAdmin()
        await getStorage()
            .bucket()
            .file(todayStoragePath(org))
            .save(JSON.stringify(doc), {
                contentType: "application/json",
                metadata: { cacheControl: TODAY_CACHE_CONTROL },
            })
        return true
    } catch (err) {
        logger.warn("[today] storing the last good copy failed (non-blocking)", {
            org,
            error: err instanceof Error ? err.message : String(err),
        })
        return false
    }
}

/** The last good build, or null when none has been stored yet. */
export async function readStoredToday(
    org: OrgId = DEFAULT_ORG_ID,
): Promise<TodayDoc | null> {
    initAdmin()
    const file = getStorage().bucket().file(todayStoragePath(org))
    const [exists] = await file.exists()
    if (!exists) return null
    const [buf] = await file.download()
    return JSON.parse(buf.toString("utf8")) as TodayDoc
}
