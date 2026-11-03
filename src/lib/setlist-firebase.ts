import { getDb, subscribeWithDb } from "./firebase";
import {
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    getDocs,
} from "firebase/firestore";
import type { OrgId } from "@/lib/org/types";
import { recentSetlistsQuery } from "@/lib/tenant-query";
import { coerceOrgId, DEFAULT_ORG_ID } from "@/lib/org/registry";
import { rowOrg } from "@/lib/org/membership";
import { ROW_FIELDS } from "@/lib/setlist-ops-client/fields";

/**
 * v11-05-05: in-app setlist creates stamp the HOST org so the new doc is visible
 * under the v11-04 `where('orgId','==',org)` dashboard reads. Mirrors the
 * v11-05-04 congregation-store client pattern (`<html data-org>` is set
 * server-side before hydration). SSR-guarded; crc default keeps CRC unchanged.
 * MCP create stamps the caller org separately (setlist-write.ts).
 */
function hostOrgId(): OrgId {
    return coerceOrgId(
        typeof document !== "undefined" ? document.documentElement.dataset.org : undefined,
    )
}

/**
 * Multi-tenant phase 2: the default-pointer doc per tenant. crc keeps the
 * original `config/defaults`; every other tenant has `config/defaults__<org>`
 * so one tenant's wizard never reads another's pointers.
 */
export function defaultsDocId(org: OrgId): string {
    return org === DEFAULT_ORG_ID ? "defaults" : `defaults__${org}`
}

/**
 * Setlist sync PR 3: every create-style path (new, duplicate, clone, save as
 * template) is ONE server transaction at POST /api/setlists/create
 * (src/lib/setlist-ops/create.ts): the setlist doc and all its rows, or
 * nothing. The browser no longer writes `setlists/*` or `tracks/*`. Copies
 * read the source rows on the server, so no copied row can carry a stale
 * stamp or an `undefined`.
 */
async function createOnServer(body: Record<string, unknown>): Promise<string> {
    const setlistId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const res = await apiFetch("/api/setlists/create", {
        method: "POST",
        body: JSON.stringify(stripUndefinedDeep({ ...body, setlistId })),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; setlistId?: string; reason?: string; message?: string }
    if (!res.ok || data.ok !== true || typeof data.setlistId !== "string") {
        throw new Error(data.message || data.reason || `Create failed (${res.status})`)
    }
    return data.setlistId
}

/** A wizard / template track as explicit row fields (no ids, no stamps). */
function rowFieldsOf(t: SetlistTrack): Record<string, unknown> {
    const { id: _id, order: _order, ...rest } = t as SetlistTrack & { order?: unknown }
    void _id
    void _order
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) {
        if (v === undefined || v === null) continue
        if ((ROW_FIELDS as readonly string[]).includes(k)) out[k] = v
    }
    if (typeof out.title !== "string") out.title = ""
    if (typeof out.type !== "string") out.type = "song"
    if (typeof out.fileId === "string" && out.songId === undefined) out.songId = out.fileId
    return out
}

function eventIso(v: unknown): string | undefined {
    const d = toDate(v as Parameters<typeof toDate>[0])
    return d ? d.toISOString() : undefined
}

import { SetlistTrack } from "@/types/api"
import { logSetlistChange } from "@/lib/setlist-audit"
import { setlistConverter } from "@/types/schemas"
import { fetchTracksForSetlistClient } from "@/lib/client-tracks"

// export interface SetlistTrack { ... } // Removed local definition
export type { SetlistTrack }

import { Setlist } from "@/types/api"
import { logger } from "@/lib/logger"
import { apiFetch } from "@/lib/api-client"
import { toDate } from "@/lib/firestore-helpers"
import { getFullServiceContext, getServiceContext, ServiceType } from "@/lib/liturgical-calendar"
import { generateSetlistName } from "@/lib/liturgical-templates"
import { captureSyncFailure } from "@/lib/sync/sentry-capture"
export type { Setlist }

/**
 * ServiceType values that the legacy `templateType: 'festival'` field
 * collapses across. When a candidate setlist has `templateType: 'festival'`,
 * it matches a request for any of these specific holiday types (per v51-03
 * plan: festival templateType is a multi-match bucket because the field was
 * added before the per-holiday types existed).
 */
const FESTIVAL_SERVICE_TYPES: readonly ServiceType[] = [
    'sukkot',
    'simchat_torah',
    'passover',
    'shavuot',
] as const

/**
 * Returns true if the given setlist matches the requested ServiceType.
 *
 * Resolution order:
 *  1. If `templateType` is set and not 'other', use it (user's stated intent).
 *     - Direct types map 1:1.
 *     - 'festival' matches any of FESTIVAL_SERVICE_TYPES.
 *  2. Else infer from the setlist's eventDate (or date) via getServiceContext.
 *
 * Pure function — exported for unit testing.
 */
export function setlistMatchesServiceType(
    setlist: Pick<Setlist, 'eventDate' | 'date' | 'templateType'>,
    requestedType: ServiceType,
): boolean {
    const tt = setlist.templateType
    if (tt && tt !== 'other') {
        if (tt === 'festival') return FESTIVAL_SERVICE_TYPES.includes(requestedType)
        return tt === requestedType
    }
    const effDate = toDate(setlist.eventDate ?? setlist.date)
    if (!effDate) return false
    return getServiceContext(effDate).type === requestedType
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
    ) as T
}

function stripUndefinedDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripUndefinedDeep)
    if (value && typeof value === 'object'
        && !(typeof Timestamp === 'function' && value instanceof Timestamp)
        && Object.getPrototypeOf(value) === Object.prototype)
        return stripUndefined(
            Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripUndefinedDeep(v)])
            ) as Record<string, unknown>
        )
    return value
}

// User-specific setlist service
export function createSetlistService(userId: string | null, userName?: string | null) {
    const COLLECTION_PATH = 'setlists';

    return {
        async createSetlist(name: string, tracks: SetlistTrack[], additionalData: Partial<Setlist> = {}) {
            try {
                // The server places the new setlist in the host's tenant.
                const id = await createOnServer({
                    name,
                    eventDate: eventIso(additionalData.eventDate),
                    templateType: additionalData.templateType ?? undefined,
                    rabbi: additionalData.rabbi || undefined,
                    isTemplate: additionalData.isTemplate === true ? true : undefined,
                    musicians: (additionalData.musicians ?? undefined) as unknown,
                    rows: tracks.map(rowFieldsOf),
                })
                logSetlistChange(id, 'created', userId || '', userName || 'Anonymous', { name, trackCount: tracks.length })
                return id
            } catch (e) {
                logger.error("Error creating setlist: ", e);
                // v51-h01: instrument the direct-write path that v50-07-05 missed.
                captureSyncFailure(e, {
                    feature: 'write-atomicity',
                    site: 'createSetlist',
                    op: 'create',
                    collection: COLLECTION_PATH,
                    trackCount: tracks.length,
                })
                throw e;
            }
        },
        // Subscribe to a single setlist by ID
        subscribeToSetlist(id: string, callback: (setlist: Setlist | null) => void) {
            return subscribeWithDb((db) => {
                const docRef = doc(db, COLLECTION_PATH, id).withConverter(setlistConverter)
                return onSnapshot(docRef, (snap) => {
                    if (snap.exists()) {
                        callback(snap.data() as Setlist);
                    } else {
                        callback(null);
                    }
                }, (err) => {
                    logger.error("[Setlist] Listener error for %s:", id, err)
                });
            })
        },

        // Setlist sync PR 3: there is no client setlist update here any more.
        // Field edits go through the setlist ops client (editSetlist).

        async deleteSetlist(id: string) {
            try {
                // D01: cascade delete runs server-side via Admin SDK — removes
                // the setlist doc + scheduling_assignments + tasks + setlist-
                // rooted notifications + sub-collections (history, emailEvents).
                // Client rules correctly deny most of these; the API route is
                // the single source of truth for the cascade.
                const res = await apiFetch('/api/setlist/delete', {
                    method: 'POST',
                    body: JSON.stringify({ setlistId: id }),
                })
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    throw new Error(data?.error || `Delete failed (${res.status})`)
                }
                // Multi-tenant phase 2: the 'deleted' history entry is written by
                // the delete route before the cascade; a client write after the
                // parent is gone would be refused.
            } catch (e) {
                logger.error("Error deleting setlist:", e)
                throw e
            }
        },

        // Subscribe to setlists. v11-04-01: the live query is restricted with
        // `where('orgId','==',org)` so a tenant's surface never shows another
        // tenant's setlists after hydration. Every caller passes its tenant
        // (useOrg()). Multi-tenant phase 1: an omitted org now means crc rather
        // than every tenant's latest 50 — no caller omits it.
        subscribeToAllSetlists(callback: (setlists: Setlist[], fromCache: boolean) => void, onError?: (error: Error) => void, org: OrgId = DEFAULT_ORG_ID) {
            return subscribeWithDb((db) => {
                const q = recentSetlistsQuery(db, org, 50).withConverter(setlistConverter)

                return onSnapshot(q, {
                    next: (snapshot) => {
                        const setlists = snapshot.docs
                            .map(doc => doc.data())
                            .filter(Boolean) as Setlist[];
                        callback(setlists, snapshot.metadata.fromCache);
                    },
                    error: (error) => {
                        logger.error("Error subscribing to setlists:", error)
                        if (onError) onError(error)
                    }
                });
            })
        },

        // Duplicate a setlist (creates a copy owned by current user)
        async duplicateSetlist(sourceSetlistId: string, setlistData: Setlist) {
            try {
                // The server copies the source's rows and keeps its tenant.
                return await createOnServer({
                    name: `${setlistData.name} (Copy)`,
                    copyFrom: sourceSetlistId,
                    copyKind: "copiedFrom",
                })
            } catch (e) {
                logger.error("Error duplicating setlist: ", e);
                throw e;
            }
        },

        // v52-05: read the admin-curated default pointer for `serviceType`
        // from the tenant's defaults doc (`defaultsDocId(org)`). Returns the setlistId stored at that key,
        // or null when the doc is missing / the key is unset / the read
        // fails. Silent fallback semantics — caller is expected to fall
        // through to the legacy 20-most-recent query on null (Track D OQ Q5).
        async getDefaultForServiceType(serviceType: ServiceType, org: OrgId = hostOrgId()): Promise<string | null> {
            try {
                const db = await getDb()
                const ref = doc(db, 'config', defaultsDocId(org))
                const snap = await getDoc(ref)
                if (!snap.exists()) return null
                const data = snap.data() as Record<string, unknown>
                const id = data[serviceType]
                return typeof id === 'string' && id.length > 0 ? id : null
            } catch (e) {
                logger.error('Error reading config/defaults:', e)
                return null
            }
        },

        // v52-05: admin-only write of the canonical default for `serviceType`.
        // Uses setDoc with merge: true so each call only updates one key —
        // other service-type pointers are preserved. Firestore rules enforce
        // admin-only at the server (allow write: if isAdmin()); this method
        // does not gate client-side beyond what rules already enforce.
        async setDefaultForServiceType(serviceType: ServiceType, setlistId: string, org: OrgId = hostOrgId()): Promise<void> {
            const db = await getDb()
            const defaultsRef = doc(db, 'config', defaultsDocId(org))
            await setDoc(
                defaultsRef,
                {
                    [serviceType]: setlistId,
                    updatedAt: serverTimestamp(),
                    updatedBy: userId ?? 'unknown',
                },
                { merge: true },
            )
            logSetlistChange(setlistId, 'set_as_default', userId || '', userName || 'Anonymous')
        },

        // Find the most recent setlist matching `serviceType` whose effective
        // event date is strictly before `beforeDate` (or before "now" if not
        // given). Returns null on no-match or query failure (graceful — wizard
        // simply hides the Clone CTA).
        async findLastMatchingService(
            serviceType: ServiceType,
            beforeDate?: Date,
            org: OrgId = hostOrgId(),
        ): Promise<Setlist | null> {
            // v52-05: consult config/defaults pointer first. Silent fallback
            // on missing / dangling / repurposed pointer — graceful degradation,
            // no error surface (Track D OQ Q5 lock).
            try {
                const defaultId = await this.getDefaultForServiceType(serviceType, org)
                if (defaultId) {
                    const db = await getDb()
                    const ref = doc(db, COLLECTION_PATH, defaultId).withConverter(setlistConverter)
                    const snap = await getDoc(ref)
                    if (snap.exists()) {
                        const candidate = snap.data() as Setlist | null
                        if (
                            candidate &&
                            !candidate.isTemplate &&
                            rowOrg(candidate.orgId) === org &&
                            setlistMatchesServiceType(candidate, serviceType)
                        ) {
                            return candidate
                        }
                    }
                    // dangling or repurposed pointer — silent fallthrough
                }
            } catch {
                // pointer read failed — silent fallthrough to legacy query
            }

            try {
                const db = await getDb()
                // Multi-tenant phase 2: only this tenant's setlists.
                const q = recentSetlistsQuery(db, org, 20).withConverter(setlistConverter)
                const snap = await getDocs(q)
                for (const docSnap of snap.docs) {
                    const candidate = docSnap.data() as Setlist | null
                    if (!candidate) continue
                    if (candidate.isTemplate) continue
                    const effDate = toDate(candidate.eventDate ?? candidate.date)
                    if (!effDate) continue
                    if (beforeDate && effDate >= beforeDate) continue
                    if (setlistMatchesServiceType(candidate, serviceType)) {
                        return candidate
                    }
                }
                return null
            } catch (e) {
                logger.error("Error finding last matching service:", e)
                return null
            }
        },

        // Generic clone: copy source's tracks/musicians/rabbi onto a new
        // setlist scheduled for `targetDate`. Tracks are copied verbatim —
        // sticky-memory propagation (v50-04) happens at READ time via
        // seedTrackFromSong on next ChartBindPopover use, NOT at write time.
        // Cloned tracks preserve the user's intentful per-song values
        // (key, bpm, vocal lead) from the source setlist.
        async cloneSetlist(source: Setlist, targetDate: Date): Promise<string> {
            try {
                const context = await getFullServiceContext(targetDate, rowOrg(source.orgId))
                const name = generateSetlistName(context)

                // The server copies the source's rows verbatim (key, bpm, Vocal
                // Lead, notes …) and keeps the source's tenant; the clone
                // carries the source's musicians and rabbi.
                const id = await createOnServer({
                    name,
                    eventDate: targetDate.toISOString(),
                    ...(source.rabbi ? { rabbi: source.rabbi } : {}),
                    musicians: source.musicians || [],
                    copyFrom: source.id,
                    copyKind: "clonedFrom",
                })
                logSetlistChange(id, 'cloned', userId || '', userName || 'Anonymous')
                return id
            } catch (e) {
                logger.error("Error cloning setlist:", e)
                captureSyncFailure(e, {
                    feature: 'write-atomicity',
                    site: 'cloneSetlist',
                    op: 'create',
                    collection: COLLECTION_PATH,
                    trackCount: source.trackCount ?? 0,
                })
                throw e
            }
        },

        // Clone a setlist for next week: same tracks, musicians, rabbi; date +7 days; auto-name.
        // Public surface preserved (called by EmptyState's "Make next week's" CTA);
        // implementation is now a thin wrapper around cloneSetlist().
        async cloneForNextWeek(source: Setlist): Promise<string> {
            const sourceDate = toDate(source.eventDate || source.date) || new Date()
            const targetDate = new Date(sourceDate)
            targetDate.setDate(targetDate.getDate() + 7)
            // Delegate via `this` so the call participates in the same service
            // closure (logging, userId/userName binding stay consistent).
            return this.cloneSetlist(source, targetDate)
        },

        // Save a setlist as a reusable template (strips date, musicians, rabbi)
        async saveAsTemplate(source: Setlist, templateName?: string): Promise<string> {
            try {
                // A template stays in its source's tenant (the server reads it).
                const id = await createOnServer({
                    name: templateName || `${source.name} (Template)`,
                    isTemplate: true,
                    templateType: 'other',
                    copyFrom: source.id,
                    copyKind: "copiedFrom",
                })
                logSetlistChange(id, 'saved_as_template', userId || '', userName || 'Anonymous')
                return id
            } catch (e) {
                logger.error("Error saving as template:", e)
                throw e
            }
        },

    };
}
