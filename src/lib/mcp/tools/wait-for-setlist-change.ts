import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { readVersion } from "@/lib/mcp/error-envelopes"

/**
 * W-04 Track B-cheap — long-poll setlist change observer.
 *
 * Blocks server-side until either:
 *   (a) the setlist's `version` (or any of its tracks' `version`) advances
 *       past `sinceVersion`, or
 *   (b) `timeoutSec` elapses with no change.
 *
 * Fits cleanly inside MCP's request/response model — no SSE plumbing, no
 * reconnect logic, no token-refresh dance. Agents chain successive calls
 * if they want to wait longer than 60 seconds.
 *
 * Why long-poll over real SSE: see `.paul/research/w-plans/W-004-bidirectional-sync.md`.
 * In short — MCP's transport doesn't have a clean streaming idiom yet, and
 * Vercel function lifetime + Firebase token-refresh make SSE materially
 * more expensive for unclear benefit at the agent's current use pattern.
 */

export interface WaitForSetlistChangeArgs {
    setlistId: string
    sinceVersion: number
    /** Default 30, clamped to [1, 60]. Vercel function timeout headroom. */
    timeoutSec?: number
    /** When true, the response includes the full get_setlist payload. */
    includeFullState?: boolean
}

export interface WaitForSetlistChangeChange {
    entity: "setlist" | "track"
    id: string
    version: number
    kind: "update" | "insert" | "delete"
    at?: string
}

export interface WaitForSetlistChangeResult {
    changed: boolean
    currentVersion: number
    changes?: WaitForSetlistChangeChange[]
    setlist?: unknown // full get_setlist payload when includeFullState
    /** Tool will set `timedOut: true` instead of `changed: false` for clarity. */
    timedOut?: boolean
}

export type WaitForSetlistChangeError = { error: string }

export const WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC = 60
export const WAIT_FOR_SETLIST_CHANGE_DEFAULT_TIMEOUT_SEC = 30

/**
 * Take a single snapshot of setlist + tracks state and synthesize the
 * change list relative to `sinceVersion`. Used both for the immediate-
 * return path (version already advanced) and for the post-trigger
 * resolution after a listener fires.
 */
async function snapshotState(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
    sinceVersion: number,
): Promise<{
    currentVersion: number
    setlistData: Record<string, unknown> | null
    changes: WaitForSetlistChangeChange[]
}> {
    const setlistRef = db.collection("setlists").doc(setlistId)
    const setlistSnap = await setlistRef.get()
    if (!setlistSnap.exists) {
        return { currentVersion: 0, setlistData: null, changes: [] }
    }
    const setlistData = setlistSnap.data() as Record<string, unknown>
    const setlistVersion = readVersion(setlistData)
    const lastModifiedAt =
        typeof setlistData.lastModifiedAt === "string"
            ? setlistData.lastModifiedAt
            : undefined

    const tracksSnap = await db
        .collection("tracks")
        .where("setlistId", "==", setlistId)
        .get()

    const changes: WaitForSetlistChangeChange[] = []
    if (setlistVersion > sinceVersion) {
        changes.push({
            entity: "setlist",
            id: setlistId,
            version: setlistVersion,
            kind: "update",
            at: lastModifiedAt,
        })
    }
    for (const td of tracksSnap.docs) {
        const tdata = td.data() as Record<string, unknown>
        const tv = readVersion(tdata)
        if (tv > sinceVersion) {
            const trackLastMod =
                typeof tdata.lastModifiedAt === "string"
                    ? (tdata.lastModifiedAt as string)
                    : undefined
            changes.push({
                entity: "track",
                id: td.id,
                version: tv,
                kind: tv === 1 ? "insert" : "update",
                at: trackLastMod,
            })
        }
    }

    return {
        currentVersion: setlistVersion,
        setlistData,
        changes,
    }
}

export async function waitForSetlistChange(
    _uid: string,
    args: WaitForSetlistChangeArgs,
): Promise<WaitForSetlistChangeResult | WaitForSetlistChangeError> {
    if (!args.setlistId) {
        return { error: "setlistId is required" }
    }
    if (typeof args.sinceVersion !== "number" || args.sinceVersion < 0) {
        return { error: "sinceVersion must be a non-negative integer" }
    }

    const timeoutSec = Math.min(
        WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC,
        Math.max(1, args.timeoutSec ?? WAIT_FOR_SETLIST_CHANGE_DEFAULT_TIMEOUT_SEC),
    )

    initAdmin()
    const db = getFirestore()

    // Immediate-return path: if state has already advanced, no need to wait.
    const initial = await snapshotState(db, args.setlistId, args.sinceVersion)
    if (initial.changes.length > 0) {
        const result: WaitForSetlistChangeResult = {
            changed: true,
            currentVersion: initial.currentVersion,
            changes: initial.changes,
        }
        if (args.includeFullState && initial.setlistData) {
            const tracksSnap = await db
                .collection("tracks")
                .where("setlistId", "==", args.setlistId)
                .orderBy("order", "asc")
                .get()
            result.setlist = {
                id: args.setlistId,
                ...initial.setlistData,
                tracks: tracksSnap.docs.map((t) => ({
                    id: t.id,
                    ...t.data(),
                })),
            }
        }
        return result
    }

    // Listener path: race two onSnapshot subscriptions against a timeout.
    // Whichever resolves first wins; both unsubscribes always run in finally.
    return new Promise<WaitForSetlistChangeResult>((resolve) => {
        let resolved = false
        let unsubscribeSetlist: (() => void) | null = null
        let unsubscribeTracks: (() => void) | null = null
        let timer: NodeJS.Timeout | null = null

        const cleanup = () => {
            if (unsubscribeSetlist) {
                try {
                    unsubscribeSetlist()
                } catch (err) {
                    logger.warn("[mcp] waitForSetlistChange setlist unsubscribe", {
                        err: err instanceof Error ? err.message : String(err),
                    })
                }
                unsubscribeSetlist = null
            }
            if (unsubscribeTracks) {
                try {
                    unsubscribeTracks()
                } catch (err) {
                    logger.warn("[mcp] waitForSetlistChange tracks unsubscribe", {
                        err: err instanceof Error ? err.message : String(err),
                    })
                }
                unsubscribeTracks = null
            }
            if (timer) {
                clearTimeout(timer)
                timer = null
            }
        }

        const resolveOnce = async (timedOut: boolean) => {
            if (resolved) return
            resolved = true
            const snap = await snapshotState(
                db,
                args.setlistId,
                args.sinceVersion,
            )
            cleanup()
            if (timedOut && snap.changes.length === 0) {
                resolve({
                    changed: false,
                    currentVersion: snap.currentVersion,
                    timedOut: true,
                })
                return
            }
            const result: WaitForSetlistChangeResult = {
                changed: snap.changes.length > 0,
                currentVersion: snap.currentVersion,
                changes: snap.changes,
            }
            if (args.includeFullState && snap.setlistData) {
                const tracksSnap = await db
                    .collection("tracks")
                    .where("setlistId", "==", args.setlistId)
                    .orderBy("order", "asc")
                    .get()
                result.setlist = {
                    id: args.setlistId,
                    ...snap.setlistData,
                    tracks: tracksSnap.docs.map((t) => ({
                        id: t.id,
                        ...t.data(),
                    })),
                }
            }
            resolve(result)
        }

        const onChange = () => {
            // Re-snapshot in resolveOnce; cheap and avoids double-firing
            // if both listeners trigger near-simultaneously.
            resolveOnce(false)
        }

        try {
            unsubscribeSetlist = db
                .collection("setlists")
                .doc(args.setlistId)
                .onSnapshot((s) => {
                    const data = s.data()
                    if (!data) return
                    if (readVersion(data) > args.sinceVersion) onChange()
                })
            unsubscribeTracks = db
                .collection("tracks")
                .where("setlistId", "==", args.setlistId)
                .onSnapshot((qs) => {
                    for (const td of qs.docs) {
                        if (readVersion(td.data()) > args.sinceVersion) {
                            onChange()
                            return
                        }
                    }
                })
        } catch (err) {
            logger.error("[mcp] waitForSetlistChange listener setup failed", {
                setlistId: args.setlistId,
                err: err instanceof Error ? err.message : String(err),
            })
            resolved = true
            cleanup()
            resolve({ changed: false, currentVersion: initial.currentVersion })
            return
        }

        timer = setTimeout(() => {
            resolveOnce(true)
        }, timeoutSec * 1000)
    })
}
