import { initAdmin } from "@/lib/firebase-admin"
import { getFirestore } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"
import { serializeSetlist } from "@/lib/server-auth"
import type { OrgId } from "@/lib/org/types"

/**
 * `eventDate` is stored with MIXED Firestore types across the `setlists`
 * collection — Timestamp on newer rows, ISO String on older/cloned rows,
 * absent on templates (VERIFY-1 2026-05-23). After `serializeSetlist` both
 * Timestamp and String arrive here as ISO text, so we parse to epoch ms for
 * in-memory ordering/windowing. Returns `null` when the field is absent or
 * unparseable. Doing the eventDate selection in memory avoids Firestore's
 * cross-type pitfalls: its canonical sort ranks Timestamp < String (so
 * `.orderBy('eventDate','desc').limit(n)` drops recent Timestamp-typed
 * services behind the String-typed ones) and a `.where('eventDate','>=')`
 * range filter matches ONLY Timestamp-typed values. The `heal-eventdate-
 * types.mjs` script removes the root cause by normalising the stored type.
 */
function eventInstant(row: { eventDate?: unknown }): number | null {
    const v = row.eventDate
    if (typeof v !== "string") return null
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : t
}

/**
 * Fetch upcoming setlists server-side for instant SSR.
 * Returns the next 5 upcoming setlists.
 * v4.0: No private/public distinction — all setlists are accessible.
 *
 * Mixed-type hazard (VERIFY-1 2026-05-23): a Firestore
 * `.where('eventDate','>=',<Date>)` range filter matches only
 * Timestamp-typed `eventDate` values, so String-typed upcoming services
 * were silently omitted. Fetch by the type-consistent `date` field and
 * compute the upcoming window in memory so both representations count.
 */
export async function getUpcomingSetlists(opts: { org?: OrgId } = {}) {
    try {
        initAdmin()
        const db = getFirestore()

        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const cutoff = startOfToday.getTime()

        // v11-04-03: opt-in tenant scoping (mirrors getAllSetlists). With `org`,
        // restrict to that tenant via the deployed (orgId,date) index; without,
        // behavior is unchanged. No live caller passes org today (re-exported as
        // getUpcomingPublicSetlists) — added for parity/defense.
        const col = db.collection("setlists")
        const scoped: FirebaseFirestore.Query = opts.org
            ? col.where("orgId", "==", opts.org)
            : col
        const snap = await scoped
            .orderBy("date", "desc")
            .limit(MAX_SETLIST_FETCH)
            .get()

        return snap.docs
            .map((d) => serializeSetlist(d.id, d.data()))
            .map((setlist) => ({ setlist, ms: eventInstant(setlist) }))
            .filter(
                (x): x is { setlist: (typeof x)["setlist"]; ms: number } =>
                    x.ms !== null && x.ms >= cutoff,
            )
            .sort((a, b) => a.ms - b.ms)
            .slice(0, 5)
            .map((x) => x.setlist)
    } catch (error) {
        logger.warn("Server setlist fetch failed:", error)
        return []
    }
}

/**
 * Fetch recent setlists (for users with no upcoming events).
 */
export async function getRecentSetlists(opts: { org?: OrgId } = {}) {
    try {
        initAdmin()
        const db = getFirestore()

        // v11-04-03: opt-in tenant scoping (see getUpcomingSetlists).
        const col = db.collection("setlists")
        const scoped: FirebaseFirestore.Query = opts.org
            ? col.where("orgId", "==", opts.org)
            : col
        const snap = await scoped
            .orderBy("date", "desc")
            .limit(5)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server recent setlist fetch failed:", error)
        return []
    }
}

/**
 * Fetch setlists server-side for the dashboard and the MCP list_setlists
 * read tool, ordered by `date` descending. Default cap 50 (dashboard
 * fits on one screen, no scroll-paging needed); MCP callers can raise it
 * via `opts.limit` up to MAX_SETLIST_FETCH for paging through larger
 * archives.
 *
 * Cowork CF1 UAT (2026-05-15, §7.7) flagged that David has 41 setlists
 * total but `list_setlists` only ever returned the first 20; raising the
 * MCP-side cap was useless because the underlying query was hard-capped
 * at 50. Now the cap floats up to 200 so a band leader doing a multi-
 * month historical review via Claude can actually see all the entries
 * without having to thread `from`/`to` windows.
 */
export const MAX_SETLIST_FETCH = 200

/**
 * Optional Firestore ordering field. `date` (write timestamp, default —
 * preserves SSR + list_setlists historical behavior) vs. `eventDate` (the
 * actual service day, what David's "next service to plan" lookups want).
 * Cycle-5 C5C-010 — list_setlists exposes a `sort` arg that flows here.
 */
export type AllSetlistsOrderBy = "date" | "eventDate"

export async function getAllSetlists(
    opts: { limit?: number; orderBy?: AllSetlistsOrderBy; org?: OrgId } = {},
) {
    try {
        initAdmin()
        const db = getFirestore()

        const limit =
            opts.limit && opts.limit > 0
                ? Math.min(opts.limit, MAX_SETLIST_FETCH)
                : 50
        const orderBy: AllSetlistsOrderBy = opts.orderBy ?? "date"

        // v11-04-01 tenant scoping: `org` is OPT-IN. When provided (the public
        // web read paths always pass a coerced OrgId), restrict the query to that
        // tenant via `.where('orgId','==',org)`. When ABSENT, the query stays
        // cross-tenant — preserving the MCP `list_setlists` contract, which fetches
        // broad here then filters by `rowOrg` itself (src/lib/mcp/tools/setlists.ts).
        // The (orgId,date) composite index backs the where+orderBy pair.
        const base = (): FirebaseFirestore.Query => {
            const c = db.collection("setlists")
            return opts.org ? c.where("orgId", "==", opts.org) : c
        }

        if (orderBy === "eventDate") {
            // Mixed-type hazard (VERIFY-1 2026-05-23): a direct
            // `.orderBy('eventDate','desc').limit(n)` returns ALL String-typed
            // eventDates before ANY Timestamp-typed one (Firestore ranks
            // Timestamp < String), so a `limit` window drops the most recent
            // (Timestamp-typed) services entirely — e.g. Kabbalat Shabbat /
            // Shavuot vanished from list_setlists. Fetch by the
            // type-consistent `date` field up to MAX_SETLIST_FETCH, then order
            // by eventDate in memory so nothing is dropped at the fetch layer.
            // Rows with no parseable eventDate sort last. Robust until the
            // collection exceeds MAX_SETLIST_FETCH (heal-eventdate-types.mjs
            // removes the underlying type drift).
            const snap = await base()
                .orderBy("date", "desc")
                .limit(MAX_SETLIST_FETCH)
                .get()

            const rows = snap.docs.map((d) => serializeSetlist(d.id, d.data()))
            rows.sort((a, b) => {
                const am = eventInstant(a)
                const bm = eventInstant(b)
                if (am === null && bm === null) return 0
                if (am === null) return 1
                if (bm === null) return -1
                return bm - am
            })
            return rows.slice(0, limit)
        }

        const snap = await base()
            .orderBy(orderBy, "desc")
            .limit(limit)
            .get()

        return snap.docs.map((d) => serializeSetlist(d.id, d.data()))
    } catch (error) {
        logger.warn("Server all setlist fetch failed:", error)
        return []
    }
}

/**
 * Cycle-3.5 P2-004 — cursor-paginated `setlists` fetch.
 *
 * The legacy `getAllSetlists` (above) returns up to 50/200 setlists in
 * one shot and is consumed by SSR + the MCP `list_setlists` tool. As
 * David's archive grows past the 50-cap (CF1 UAT 2026-05-15 found 41
 * already), a paged fetch lets the /setlists dashboard ship page-1
 * over the wire and load older pages on demand without changing
 * `getAllSetlists`'s shape.
 *
 * Cursor encoding: the ISO-string `date` of the last item on the
 * previous page. `startAfter(Date)` accepts a JS Date directly against
 * an `orderBy('date', 'desc')` query. When the last item lacks `date`
 * (legacy seed data — uncommon but possible), we close the page
 * (`nextCursor: null`) rather than risk an undefined cursor.
 *
 * Page size defaults to 50; callers can request smaller pages on
 * follow-up fetches but the upper cap stays `MAX_SETLIST_FETCH`.
 */

export interface SetlistsPage {
    items: ReturnType<typeof serializeSetlist>[]
    nextCursor: string | null
}

export async function getSetlistsPage(opts: {
    cursor?: string | null
    pageSize?: number
    org?: OrgId
} = {}): Promise<SetlistsPage> {
    try {
        initAdmin()
        const db = getFirestore()

        const pageSize =
            opts.pageSize && opts.pageSize > 0
                ? Math.min(opts.pageSize, MAX_SETLIST_FETCH)
                : 50

        // v11-04-03: opt-in tenant scoping for the authed /setlists dashboard.
        // With `org` (the SSR page + /api/setlists/page route pass the host's
        // coerced org), restrict to that tenant — the where+orderBy+startAfter
        // chain is backed by the deployed (orgId,date) index. Without org, the
        // query stays cross-tenant (unchanged contract for any no-org caller).
        const col = db.collection("setlists")
        const scoped: FirebaseFirestore.Query = opts.org
            ? col.where("orgId", "==", opts.org)
            : col
        let q = scoped
            .orderBy("date", "desc")
            .limit(pageSize + 1) // +1 sentinel so we know if a next page exists

        if (opts.cursor) {
            const cursorDate = new Date(opts.cursor)
            if (!Number.isNaN(cursorDate.getTime())) {
                q = q.startAfter(cursorDate)
            }
        }

        const snap = await q.get()
        const docs = snap.docs.slice(0, pageSize)
        const items = docs.map((d) => serializeSetlist(d.id, d.data()))

        const hasMore = snap.docs.length > pageSize
        const lastItem = items[items.length - 1] as
            | { date?: string }
            | undefined
        const nextCursor =
            hasMore && typeof lastItem?.date === "string"
                ? lastItem.date
                : null

        return { items, nextCursor }
    } catch (error) {
        logger.warn("Server paged setlist fetch failed:", error)
        return { items: [], nextCursor: null }
    }
}

// Backward-compat aliases (deprecated — use new names)
export const getUpcomingPublicSetlists = getUpcomingSetlists
export const getRecentPublicSetlists = getRecentSetlists
export const getPersonalSetlists = (_userId: string) => getAllSetlists()
export const getAllPublicSetlists = getAllSetlists
