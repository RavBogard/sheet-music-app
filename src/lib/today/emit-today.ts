import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getStorage } from "firebase-admin/storage"
import { serializeSetlist, getServerCongregationConfig } from "@/lib/server-auth"
import { MAX_SETLIST_FETCH } from "@/lib/server-setlists"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { buildTodayDoc, type TodaySetlistInput } from "./build-today"
import { readServicesFromConfig, readStreamFromConfig } from "./config"
import { TODAY_CACHE_CONTROL, todayStoragePath, type TodayDoc } from "./types"

/**
 * The I/O half of the `today.json` emitter: read the org's setlists + the
 * congregation config, hand them to the pure builder, write the result to a
 * public Storage object. See `build-today.ts` for what it decides and
 * `types.ts` for what may never appear in the output.
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
    })
    const wanted = new Set(shortlist.services.map((s) => s.setlistId))
    const folios = new Map<string, number | null>()
    await Promise.all(
        [...wanted].map(async (id) => folios.set(id, await startFolioFor(db, id))),
    )

    return buildTodayDoc({
        setlists: setlists.map((s) => ({ ...s, startFolio: folios.get(s.id) ?? null })),
        services: readServicesFromConfig(config as Record<string, unknown> | null),
        stream: readStreamFromConfig(config as Record<string, unknown> | null),
        now,
    })
}

/**
 * Build and publish the document to `public/today/<org>.json`.
 *
 * Per-org by construction: the path and the query are both keyed by `org`, so
 * two tenants can never share a file. Best-effort by contract — every caller
 * (publish, cron) logs and continues on failure. A missing `today.json` costs
 * the reader its calendar hint; a failed publish would cost a service.
 */
export async function emitToday(
    org: OrgId = DEFAULT_ORG_ID,
    now: Date = new Date(),
): Promise<{ ok: true; path: string; serviceCount: number } | { ok: false; error: string }> {
    try {
        const doc = await buildToday(org, now)
        const path = todayStoragePath(org)
        await getStorage()
            .bucket()
            .file(path)
            .save(JSON.stringify(doc), {
                contentType: "application/json",
                metadata: { cacheControl: TODAY_CACHE_CONTROL },
            })
        logger.info("[today] emitted", { org, path, services: doc.services.length })
        return { ok: true, path, serviceCount: doc.services.length }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        logger.warn("[today] emit failed (non-blocking)", { org, error })
        return { ok: false, error }
    }
}

/** Read back the stored document, or null when none has been emitted yet. */
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
