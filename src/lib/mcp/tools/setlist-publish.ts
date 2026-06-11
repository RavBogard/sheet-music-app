import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { emailAllMembers } from "@/lib/email"
import { sendPushToUsers } from "@/lib/push-send"
import { sendSMS } from "@/lib/sms"
import { recordSongUsage } from "@/lib/song-usage"
import { assertEditor, readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    readLastModifiedAt,
    readVersion,
    richError,
    staleVersionEnvelope,
    type RichErrorEnvelope,
    type StaleVersionEnvelope,
} from "@/lib/mcp/error-envelopes"
import { getChartHealth } from "@/lib/file-fetcher"
import { isTestUid } from "@/lib/test-isolation"
import { rowOrg, rowOrgIds } from "@/lib/org/membership"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"

/**
 * MCP publish_setlist — send the setlist to the band via MCP, mirroring
 * the in-app `/api/setlist/publish` flow's snapshot + multi-channel
 * fan-out so an MCP-published setlist is operationally identical to a
 * UI-published one.
 *
 * Recipient model (v11.4-01, D8 item 1): a REAL publish requires an
 * explicit `recipients[]` — it never fans out to an implicitly-derived
 * generic roster (that implicit fan-out was the v11.2 BUG-9 blast class).
 * When `recipients` is undefined, a real publish refuses with
 * `recipients_required`; only `dryRun`/`preview_publish` auto-derive the
 * default org-scoped candidate audience (roles {admin, band_leader,
 * musician}, scoped to the setlist's org, minus the caller) so the caller
 * can review it and then re-publish with an explicit set. `member`-only
 * accounts (congregation, not band) are excluded from that candidate set.
 *
 * Notification channels (matches the HTTP route):
 *   - In-app: users/{uid}/notifications/{id} doc per recipient with uid.
 *   - FCM push: sendPushToUsers for uids that have a registered token.
 *   - Email: emailAllMembers via Resend; honors user.email; supports note + subject overrides.
 *   - SMS: sendSMS for users with `musicianProfile.notificationPreferences.sms === true` AND a phone — first-publish only (re-publish skips SMS to control cost).
 *
 * Side effects on the setlist doc: `publishedAt` (first publish only),
 * `publishedSnapshot` (song-row title/key/fileId list), `lastNotifiedAt`,
 * `updatedAt`. A history audit entry is written to setlists/{id}/history.
 *
 * dryRun=true returns the would-publish plan without writing anything or
 * dispatching any messages. Useful for Daniel-in-Claude to confirm the
 * recipient set before pushing the button.
 *
 * Auth: admin or band_leader. Rate limit `api` tier with trusted-leader
 * bypass — publish is the load-bearing weekly action; rate-limiting an
 * admin out of it would block the band's Friday packet.
 */

// Cycle-2 REG-001b: errors return the canonical rich envelope.

interface RecipientPayload {
    uid?: string
    name?: string
    email?: string
    instrument?: string
}

interface ResolvedRecipient {
    uid?: string
    name: string
    email: string | null
    instrument?: string
    phone?: string
    smsOptIn?: boolean
}

export interface PublishSetlistArgs {
    setlistId: string
    recipients?: RecipientPayload[]
    note?: string
    subject?: string
    dryRun?: boolean
    /** Audience preset — only honored when `recipients` is not provided. */
    audience?: "band" | "all"
    /**
     * Bypass the pre-flight chart-health check. By default, publish refuses
     * if any bonded chart is missing or unreachable (B-003 fix from the
     * 2026-05-16 Bar Mitzvah session — the band was emailed 4 broken charts
     * because nobody verified). `force: true` proceeds anyway — operator
     * has decided the broken charts are acceptable (e.g. the band will
     * lead-live those songs).
     */
    force?: boolean
    /**
     * W-04 Plan 03 optimistic-concurrency gate. When supplied, rejects
     * with the stale_version envelope if the setlist's current version
     * has advanced past `lastSeenVersion` — no snapshot is written, no
     * notifications fan out. Optional (matches the cross-cutting "OPTIONAL
     * on every tool" policy); W-04 §Q5 originally specified strict-required
     * for publish, but staying consistent with the other 5 gated paths
     * means pre-W-04 agents and HTTP callers keep working without forcing
     * them to pass it.
     */
    lastSeenVersion?: number
}

export interface PublishSetlistResult {
    ok: true
    setlistId: string
    setlistName: string
    wasAlreadyPublished: boolean
    dryRun: boolean
    recipientCount: number
    recipients: Array<{
        uid?: string
        name: string
        email: string | null
        smsEligible: boolean
    }>
    /** Per-channel results. dryRun zeros everything. */
    delivery: {
        inApp: { sent: number; failed: number }
        push: { sent: number; failed: number }
        email: { sent: number; failed: number }
        sms: { sent: number; failed: number; skippedRepublish: boolean }
    }
    snapshot: Array<{ title: string; key: string; fileId: string }>
    /**
     * Post-write setlist version (unchanged on dryRun, bumped on real
     * commit by Plan 03). Lets callers chain a `lastSeenVersion` follow-up
     * without a separate get_setlist. version-echo-missing NOTE (v6
     * bugstomp).
     */
    version: number
    /**
     * Chart-health pre-flight report. Always populated. Each entry mirrors
     * `verify_setlist_charts.rows[]` shape: { fileId, title, status }.
     * `unhealthy[]` is the subset with status missing/unreachable — same set
     * the publish refused on (or `force: true` bypassed). Aggregate counts
     * (`missingCount`, `unreachableCount`) save the caller from filtering
     * `unhealthy[]` themselves; same shape preview_publish returns (F-006).
     *
     * Cycle-3 b5 followup: `needsSyncCount` matches a1's NEW-5 field on
     * `VerifySetlistChartsResult` — rows where Drive has the bytes but
     * Storage doesn't yet. Chart still SERVES via the file-fetcher's
     * Drive fallback, so publish does NOT refuse on it; the count is
     * surfaced so callers know which rows `/api/cron/drive-sync` is
     * mid-resolving.
     */
    chartHealth: {
        bondedCount: number
        okCount: number
        missingCount: number
        unreachableCount: number
        needsSyncCount: number
        /**
         * Cycle-3 BUG-002. Bonded tracks whose source-of-truth mime is
         * `application/vnd.google-apps.shortcut` — `generate_gig_packet`
         * drops these from the merged PDF, so they count as un-renderable
         * and join `unhealthy[]`. Pre-fix the per-row probe returned `ok`
         * and the band saw a broken chart at publish time.
         */
        shortcutUnresolvedCount: number
        unhealthy: Array<{
            trackId: string
            title: string
            fileId: string
            status: "missing" | "unreachable" | "shortcut_unresolved"
            reason: string
        }>
    }
}

const PUBLISH_AUDIENCE_ROLES_BAND = [
    "admin",
    "band_leader",
    "musician",
] as const
const PUBLISH_AUDIENCE_ROLES_ALL = [
    "admin",
    "band_leader",
    "musician",
    "member",
] as const

/**
 * Cycle-5 C5C-005 — exclude test traffic from default-audience derivation.
 * Filters anyone whose uid matches `isTestUid` (cycle-7 Lane 1 broadens this
 * from `startsWith("test-")` to also cover `c<N>i<N>[a]-…` + `cf<N>-…`
 * cowork-probe shapes) OR whose displayName starts with `[TEST]`
 * (autonomous-run convention). Callers who legitimately want test
 * recipients on a publish must pass them via explicit `recipients: [...]`
 * AND short-circuit defenses below allow the override only when the
 * setlist owner is a real prod uid (so cross-owner test-callers can't
 * route through). Doesn't filter the publisher's own uid (a separate
 * `doc.id === callerUid` skip handles that).
 */
function isTestUserRow(uid: string, data: Record<string, unknown>): boolean {
    if (isTestUid(uid)) return true
    const displayName =
        typeof data.displayName === "string" ? data.displayName : null
    if (displayName && /^\[TEST\]/i.test(displayName)) return true
    return false
}

async function resolveDefaultRecipients(
    db: FirebaseFirestore.Firestore,
    callerUid: string,
    audience: "band" | "all",
    // v11.2-02 (BUG-9): only members of the setlist's org. Mirrors the
    // v11-05-02 roster pattern (roster.ts:229) — keep the role query, filter
    // membership in-memory via rowOrgIds (missing orgIds → ['crc'], the
    // CRC-safety default, so legacy CRC users stay in CRC's audience with no
    // backfill). Without this the default audience was the ENTIRE users
    // collection → a BL publish notified CRC's roster (the report's BUG-9).
    orgScope: OrgId,
): Promise<ResolvedRecipient[]> {
    const roles =
        audience === "all"
            ? PUBLISH_AUDIENCE_ROLES_ALL
            : PUBLISH_AUDIENCE_ROLES_BAND
    const snap = await db
        .collection("users")
        .where("role", "in", [...roles])
        .get()
    const resolved: ResolvedRecipient[] = []
    for (const doc of snap.docs) {
        if (doc.id === callerUid) continue
        const data = doc.data() as Record<string, unknown>
        // Cycle-5 C5C-005 — test-* uids + [TEST] displayName prefixes are
        // filtered from the default-audience derivation so a publish without
        // explicit `recipients` never fans out to autonomous-run test
        // accounts. Explicit `recipients: [...]` still allows test targets.
        if (isTestUserRow(doc.id, data)) continue
        // v11.2-02 (BUG-9): tenant wall — only the setlist's org's members.
        if (!rowOrgIds(data.orgIds).includes(orgScope)) continue
        const email = typeof data.email === "string" ? data.email : null
        const name =
            (typeof data.displayName === "string" && data.displayName) ||
            (typeof data.name === "string" && data.name) ||
            email ||
            doc.id
        const profile = (data.musicianProfile ?? {}) as Record<string, unknown>
        const prefs = (profile.notificationPreferences ?? {}) as Record<
            string,
            unknown
        >
        const phone =
            typeof profile.phone === "string"
                ? profile.phone
                : typeof data.phone === "string"
                  ? data.phone
                  : undefined
        resolved.push({
            uid: doc.id,
            name,
            email,
            phone,
            smsOptIn: prefs.sms === true,
        })
    }
    return resolved
}

async function resolveOverrideRecipients(
    db: FirebaseFirestore.Firestore,
    callerUid: string,
    overrides: RecipientPayload[],
    // v11.2-02 (BUG-9) defense-in-depth: drop uid-bearing override entries
    // whose resolved doc's orgIds exclude the setlist's org. Email-only
    // entries (no uid) pass through — operator-explicit, same posture as the
    // isTestUid email passthrough.
    orgScope: OrgId,
): Promise<ResolvedRecipient[]> {
    const resolved: ResolvedRecipient[] = []
    const uidLookups = overrides.filter((r) => r.uid).map((r) => r.uid!)
    const userDataByUid = new Map<string, Record<string, unknown>>()
    if (uidLookups.length > 0) {
        const docs = await Promise.all(
            uidLookups.map((uid) => db.collection("users").doc(uid).get()),
        )
        for (const doc of docs) {
            if (doc.exists) {
                userDataByUid.set(doc.id, doc.data() as Record<string, unknown>)
            }
        }
    }
    for (const r of overrides) {
        if (r.uid === callerUid) continue
        const data = r.uid ? userDataByUid.get(r.uid) : undefined
        // v11.2-02 (BUG-9): drop a uid-bearing entry that is not a member of
        // the setlist's org (rowOrgIds default ['crc'] for an unresolved/legacy
        // doc). Email-only entries (no uid) bypass — operator-explicit.
        if (r.uid && !rowOrgIds(data?.orgIds).includes(orgScope)) continue
        const email =
            r.email ?? (typeof data?.email === "string" ? (data.email as string) : null)
        const name =
            r.name ??
            (typeof data?.displayName === "string"
                ? (data.displayName as string)
                : null) ??
            (typeof data?.name === "string" ? (data.name as string) : null) ??
            email ??
            r.uid ??
            "Unknown"
        const profile = (data?.musicianProfile ?? {}) as Record<string, unknown>
        const prefs = (profile.notificationPreferences ?? {}) as Record<
            string,
            unknown
        >
        const phone =
            typeof profile.phone === "string"
                ? profile.phone
                : typeof data?.phone === "string"
                  ? (data.phone as string)
                  : undefined
        resolved.push({
            uid: r.uid,
            name,
            email,
            instrument: r.instrument,
            phone,
            smsOptIn: prefs.sms === true,
        })
    }
    return resolved
}

export async function publishSetlist(
    callerUid: string,
    args: PublishSetlistArgs,
    // v11.2-02 (BUG-9): caller's resolved org. Used for the caller-org wall
    // (a caller may not publish/preview another tenant's setlist) and, post-
    // wall, as the recipient scope. Defaults crc so internal callers + the
    // emulator suite stay behavior-neutral; the MCP route passes orgFrom(extra).
    org: OrgId = DEFAULT_ORG_ID,
): Promise<PublishSetlistResult | RichErrorEnvelope | StaleVersionEnvelope> {
    if (!args.setlistId?.trim())
        return richError(
            "invalid_argument",
            "setlistId must be a non-empty string.",
            { field: "setlistId" },
        )

    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, callerUid)
    if (!editor.ok) return editor

    // assertEditor already gates on admin OR band_leader; this re-read is just
    // for the rate-limit bypass + audit. The setlist-ownership branch is moot
    // for MCP (every caller that got past assertEditor is already a trusted
    // leader) but kept for parity with the HTTP route's auth contract.
    const role = await readUserRole(db, callerUid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(callerUid, "api", { bypass })
    if (limited)
        return richError(
            "rate_limited",
            limited.error,
            undefined,
            "Retry after the cooldown window, or ask an admin to bypass via trusted-leader role.",
        )

    const setlistRef = db.collection("setlists").doc(args.setlistId)
    const setlistSnap = await setlistRef.get()
    if (!setlistSnap.exists)
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    const setlist = setlistSnap.data() as Record<string, unknown>

    // v11.2-02 (BUG-9): caller-org wall. A caller may not publish (or preview,
    // since previewPublish routes through here with dryRun) a setlist in
    // another org — return the SAME setlist_not_found envelope as the absent
    // branch (no existence leak, no audience enumeration), mirroring
    // loadEditableSetlist's v11-02-03 check + the v11.2-01 commit wall. Applies
    // to dryRun too: tenant isolation is NOT an observability gate. setlistOrg
    // is then the authoritative recipient scope below.
    const setlistOrg = rowOrg(setlist.orgId)
    if (setlistOrg !== org)
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )

    // Cycle-7 Lane 1 — Convergence A (closes C7I1-008 + C7I3-002 +
    // Instance-5 headline). Real-publish (NOT dryRun) refuses on two
    // owner-shape gates BEFORE recipient resolution so audience-leak to
    // real humans is structurally impossible even when an explicit
    // `recipients:[…]` override is supplied. dryRun stays observable per
    // `[[feedback_dryrun_is_observability]]` — callers can still inspect
    // would-be recipients without triggering the fanout.
    //
    //  Gate 1 — test-owner setlist: a setlist owned by a test-shape uid
    //  must NEVER fan out to real humans, regardless of caller. Closes
    //  the C7I1-008 audience-leak (caller=test, owner=test, recipients
    //  auto-derived → 18 real emails).
    //
    //  Gate 2 — test-caller on real-owner setlist: a test bearer
    //  cannot real-publish a real-owner setlist. dryRun is permitted
    //  (observability). Closes the C7I3-002 non-owner PII visibility
    //  concern for the real-publish path. Owners of their own real
    //  setlists are unaffected (caller is not a test uid).
    const ownerIdRaw = setlist.ownerId
    const ownerId = typeof ownerIdRaw === "string" ? ownerIdRaw : null
    if (!args.dryRun && isTestUid(ownerId)) {
        return richError(
            "test_owner_cannot_publish_to_real_humans",
            "Refusing to publish a test-owned setlist to real humans. The setlist owner uid is a test-shape uid (test-*, c<N>i<N>-*, cf<N>-*); fan-out would route to production band members.",
            {
                errorCode: 403,
                setlistId: args.setlistId,
                ownerId,
            },
            "Use dryRun:true to inspect would-be recipients without sending. To actually publish, the setlist must be owned by a real (non-test) uid.",
        )
    }
    if (!args.dryRun && isTestUid(callerUid) && ownerId && !isTestUid(ownerId)) {
        return richError(
            "cross_owner_publish_forbidden",
            "Test-bearer callers may NOT real-publish a setlist owned by a real (non-test) uid. dryRun is permitted (observability).",
            {
                errorCode: 403,
                setlistId: args.setlistId,
                callerUid,
                ownerId,
            },
            "Pass dryRun:true to inspect recipients, or use a real (non-test) bearer to actually publish on behalf of the owner.",
        )
    }

    // W-04 Plan 03: optional setlist-level stale-version gate. Fires
    // BEFORE the (expensive) chart-health pre-flight + recipient
    // resolution so a known-stale publish bails cheaply. dryRun is NOT
    // exempt — the version check is the agent's "is my view current?"
    // signal, and a stale dryRun report is worse than an honest refusal.
    if (args.lastSeenVersion !== undefined) {
        const currentVersion = readVersion(setlist)
        if (currentVersion !== args.lastSeenVersion) {
            return staleVersionEnvelope({
                resource: "setlist",
                currentVersion,
                lastSeenVersion: args.lastSeenVersion,
                lastModifiedBy: setlist.lastModifiedBy as string | undefined,
                lastModifiedAt: readLastModifiedAt(setlist),
            })
        }
    }

    const tracks = (await getTracksForSetlist(db, args.setlistId, setlist)) as Array<{
        id?: string
        fileId?: string
        title?: string
        key?: string
        type?: string
        mimeType?: string
    }>
    const songTracks = tracks.filter((t) => !t.type || t.type === "song")
    const hasSongs = songTracks.some((t) => !!t.fileId)
    if (!hasSongs) {
        return richError(
            "no_bonded_songs",
            "Setlist must have at least one song row with a bonded chart before publishing.",
            { setlistId: args.setlistId, trackCount: tracks.length },
            "Add tracks via add_track_to_setlist / bulk_add_tracks first.",
        )
    }

    // ── Pre-flight chart-health check (B-003 / A-001) ───────────────────
    // HEAD-probe every bonded chart so the band never gets a 404 on a row
    // they were emailed. Refuses to publish on broken charts unless the
    // caller explicitly passes `force: true`. dryRun still runs the check
    // so callers see the report in their plan response.
    const bondedSongTracks = songTracks.filter(
        (t): t is typeof t & { fileId: string } => !!t.fileId,
    )
    const healthRows = await Promise.all(
        bondedSongTracks.map(async (t) => {
            const health = await getChartHealth(t.fileId, t.mimeType)
            return {
                trackId: t.id ?? "",
                title: t.title ?? "",
                fileId: t.fileId,
                health,
            }
        }),
    )
    const unhealthy = healthRows
        .filter(
            (
                r,
            ): r is typeof r & {
                health: {
                    status: "missing" | "unreachable" | "shortcut_unresolved"
                }
            } =>
                r.health.status === "missing" ||
                r.health.status === "unreachable" ||
                r.health.status === "shortcut_unresolved",
        )
        .map((r) => ({
            trackId: r.trackId,
            title: r.title,
            fileId: r.fileId,
            status: r.health.status,
            reason:
                r.health.status === "missing"
                    ? r.health.reason
                    : r.health.status === "shortcut_unresolved"
                      ? r.health.reason
                      : r.health.error,
        }))
    const chartHealth = {
        bondedCount: bondedSongTracks.length,
        okCount: healthRows.filter((r) => r.health.status === "ok").length,
        missingCount: unhealthy.filter((u) => u.status === "missing").length,
        unreachableCount: unhealthy.filter((u) => u.status === "unreachable")
            .length,
        needsSyncCount: healthRows.filter(
            (r) => r.health.status === "needs_storage_sync",
        ).length,
        shortcutUnresolvedCount: unhealthy.filter(
            (u) => u.status === "shortcut_unresolved",
        ).length,
        unhealthy,
    }
    // F-05 (2026-05-16 bugstomp): dryRun NEVER refuses on the chart-health
    // gate. dryRun's purpose is to surface the report so the operator can
    // see what's broken BEFORE deciding whether to force-publish. Pre-fix,
    // the operator had to pass `force: true` just to see the preview —
    // they had to opt into "I'm okay shipping anyway" to learn whether they
    // were okay shipping anyway. The refuse-gate now fires only on a real
    // publish; dryRun always returns the report below, with chartHealth
    // populated.
    if (unhealthy.length > 0 && !args.force && !args.dryRun) {
        const list = unhealthy
            .slice(0, 5)
            .map((u) => `  - "${u.title}" (${u.fileId}): ${u.status}`)
            .join("\n")
        const more =
            unhealthy.length > 5
                ? `\n  ...and ${unhealthy.length - 5} more`
                : ""
        return richError(
            "publish_refused_unhealthy_charts",
            `Publish refused: ${unhealthy.length} bonded chart(s) won't render for the band:\n${list}${more}`,
            {
                setlistId: args.setlistId,
                unhealthyCount: unhealthy.length,
                chartHealth,
            },
            "Re-bond or remove these rows, or pass force: true to publish anyway (the band will see 404s on those charts).",
        )
    }

    // REG-003 (cycle-2): distinguish `recipients` UNDEFINED (auto-derive
    // from the audience preset) from `recipients: []` (literal empty —
    // operator-explicit "send to nobody"). Pre-cycle-2 we coerced both
    // through `args.recipients && length > 0`, which made the literal-
    // empty case silently fall back to the band default. Per Daniel's
    // 2026-05-17T22:55Z ratification: literal-empty → recipientCount:0,
    // no send (treated as success below); all-invalid-uid (every uid
    // resolves to no user doc AND no email override) → rich-envelope
    // refusal so the operator notices the typo instead of silently
    // sending to nobody.
    let recipients: ResolvedRecipient[]
    if (args.recipients === undefined) {
        // v11.4-01 (D8 item 1 / tenancy invariant 3 = the v11.2 BUG-9 blast
        // class): a REAL publish must NEVER fan out to an implicitly-derived
        // generic roster. Refuse and point the caller at preview_publish,
        // which (via dryRun) still surfaces the default org-scoped candidate
        // audience for review. dryRun itself stays observable — it falls
        // through to resolveDefaultRecipients below so the candidate set is
        // returned WITHOUT sending ([[feedback_dryrun_is_observability]]).
        // Net: undefined + !dryRun → refuse (AC-1); undefined + dryRun →
        // auto-derive candidates (AC-2); explicit recipients[] unchanged (AC-3).
        if (!args.dryRun) {
            return richError(
                "recipients_required",
                "Explicit recipient selection is required — a publish never fans out to a generic roster (D8 item 1). Call preview_publish (or publish_setlist with dryRun:true) to review the default org-scoped audience, then re-call publish_setlist with an explicit recipients[].",
                {
                    errorCode: 400,
                    setlistId: args.setlistId,
                },
                "Run preview_publish to see the default org-scoped audience, then pass that set (or a subset) as recipients[] on the real publish.",
            )
        }
        recipients = await resolveDefaultRecipients(
            db,
            callerUid,
            args.audience ?? "band",
            setlistOrg,
        )
    } else if (args.recipients.length === 0) {
        // Operator-explicit "no recipients" — honor it; don't auto-derive.
        recipients = []
    } else {
        // Explicit recipients[] — resolve, then guard against the
        // all-invalid case. An entry counts as VALID if it has a real
        // email OR its uid resolves to a known user doc.
        const validInputs = args.recipients.filter((r) => {
            if (r.uid === callerUid) return false // publisher filtered anyway
            if (typeof r.email === "string" && r.email.trim()) return true
            return typeof r.uid === "string" && r.uid.trim().length > 0
        })
        if (validInputs.length === 0 && args.recipients.length > 0) {
            return richError(
                "no_valid_recipients",
                "Every supplied recipient was either the publisher or had neither a uid nor an email — nothing to send.",
                {
                    setlistId: args.setlistId,
                    suppliedCount: args.recipients.length,
                },
                "Pass uid (a user account) or email per entry, or omit `recipients` to auto-derive from the band audience.",
            )
        }
        recipients = await resolveOverrideRecipients(
            db,
            callerUid,
            args.recipients,
            setlistOrg,
        )
        // Cycle-7 Lane 1 — defense-in-depth on the override path: drop any
        // resolved recipient whose uid matches `isTestUid`. The Gate-1 +
        // Gate-2 short-circuits above already block the load-bearing
        // audience-leak shapes; this filter ensures that even if a future
        // refactor moves either gate, an explicit `recipients:[<test-uid>]`
        // override can never fan a real notification to a test bearer.
        // Email-only entries (no uid) pass through unfiltered — operator
        // is explicit and accepts responsibility for non-band recipients.
        recipients = recipients.filter((r) => !isTestUid(r.uid))
        // Post-resolve validity guard: an entry is dispatchable if it has
        // either a Firestore-resolved user doc (uid-bearing entry that hit
        // userDataByUid) OR an explicit email. If none of the resolved
        // recipients qualify, refuse rather than silently send-to-noone.
        const dispatchable = recipients.filter((r) => {
            if (typeof r.email === "string" && r.email.trim()) return true
            return typeof r.uid === "string" && r.uid.trim().length > 0
        })
        if (dispatchable.length === 0) {
            return richError(
                "no_valid_recipients",
                "None of the supplied recipients resolved to a deliverable target (no email, and no uid that exists as a user doc).",
                {
                    setlistId: args.setlistId,
                    suppliedCount: args.recipients.length,
                    resolvedCount: recipients.length,
                },
                "Verify the uids via list_users (or omit `recipients` to auto-derive from the band audience).",
            )
        }
    }

    const snapshot = songTracks.map((t) => ({
        title: t.title ?? "",
        key: t.key ?? "",
        fileId: t.fileId ?? "",
    }))

    const setlistName =
        (typeof setlist.name === "string" && setlist.name) || args.setlistId
    const wasPublished = !!setlist.publishedAt

    // version-echo: the version we have in `setlist` (read at line 281)
    // is correct for dryRun (unchanged) and the pre-commit baseline for
    // a real publish. Real publish overrides this below with the
    // post-bump value so callers chain `lastSeenVersion` correctly.
    const preCommitVersion = readVersion(setlist)
    const result: PublishSetlistResult = {
        ok: true,
        setlistId: args.setlistId,
        setlistName,
        wasAlreadyPublished: wasPublished,
        dryRun: !!args.dryRun,
        recipientCount: recipients.length,
        recipients: recipients.map((r) => ({
            uid: r.uid,
            name: r.name,
            email: r.email,
            smsEligible: !!(r.smsOptIn && r.phone),
        })),
        delivery: {
            inApp: { sent: 0, failed: 0 },
            push: { sent: 0, failed: 0 },
            email: { sent: 0, failed: 0 },
            sms: { sent: 0, failed: 0, skippedRepublish: wasPublished },
        },
        snapshot,
        version: preCommitVersion,
        chartHealth,
    }

    if (args.dryRun) {
        logger.info("[mcp] publish_setlist dry-run", {
            setlistId: args.setlistId,
            recipientCount: recipients.length,
            wasPublished,
        })
        return result
    }

    // ── Commit phase ────────────────────────────────────────────────────
    // W-04: bump version + stamp lastModifiedAt so wait_for_setlist_change
    // observers wake on a publish, and so a subsequent edit can pass the
    // post-publish version as its `lastSeenVersion`.
    await setlistRef.update({
        ...(wasPublished ? {} : { publishedAt: FieldValue.serverTimestamp() }),
        publishedSnapshot: snapshot,
        lastNotifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        version: FieldValue.increment(1),
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: callerUid,
    })
    // version-echo: surface the post-bump value so callers can chain a
    // `lastSeenVersion` follow-up without re-reading the setlist.
    result.version = preCommitVersion + 1

    // Song-usage record — fire-and-forget; never fail publish on its account.
    const eventDateRaw = setlist.eventDate ?? setlist.date
    const eventDate =
        eventDateRaw &&
        typeof eventDateRaw === "object" &&
        "toDate" in eventDateRaw &&
        typeof (eventDateRaw as { toDate: unknown }).toDate === "function"
            ? (eventDateRaw as { toDate(): Date }).toDate()
            : new Date()
    const eventDateStr = eventDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    })
    // recordSongUsage's track contract requires `title` to be a defined string;
    // our raw tracks come back as `title?: string` from Firestore. Normalize
    // before handing off so the type narrows without an `as` cast.
    const usageTracks = tracks.map((t) => ({
        fileId: t.fileId,
        title: t.title ?? "",
        key: t.key,
        type: t.type,
    }))
    void recordSongUsage(args.setlistId, setlistName, eventDate, usageTracks).catch(
        (err) => logger.warn("[mcp publish] song-usage record failed", err),
    )

    // In-app notifications + FCM push to uid-bearing recipients.
    const uidRecipients = recipients.filter((r) => r.uid)
    if (uidRecipients.length > 0) {
        const BATCH = 50
        for (let i = 0; i < uidRecipients.length; i += BATCH) {
            const chunk = uidRecipients.slice(i, i + BATCH)
            const batch = db.batch()
            for (const r of chunk) {
                const ref = db
                    .collection("users")
                    .doc(r.uid!)
                    .collection("notifications")
                    .doc()
                batch.set(ref, {
                    type: "setlist_published",
                    title: "New setlist published",
                    body: `"${setlistName}" is now available`,
                    link: `/setlist/${args.setlistId}`,
                    entityId: args.setlistId,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            }
            try {
                await batch.commit()
                result.delivery.inApp.sent += chunk.length
            } catch (err) {
                logger.warn("[mcp publish] in-app batch failed", err)
                result.delivery.inApp.failed += chunk.length
            }
        }

        try {
            const pushResult = await sendPushToUsers(
                uidRecipients.map((r) => r.uid!),
                {
                    title: "New setlist published",
                    body: `"${setlistName}" is now available`,
                    link: `/perform/setlist/${args.setlistId}`,
                },
            )
            result.delivery.push.sent = pushResult?.sent ?? 0
            result.delivery.push.failed = pushResult?.failed ?? 0
        } catch (err) {
            logger.warn("[mcp publish] FCM push failed", err)
            result.delivery.push.failed = uidRecipients.length
        }
    }

    // Email — every recipient with an email gets the standard setlist email.
    const emailTargets = recipients
        .filter((r) => r.email)
        .map((r) => ({ email: r.email!, displayName: r.name }))
    if (emailTargets.length > 0) {
        const origin =
            process.env.NEXT_PUBLIC_BASE_URL || "https://centralreform.live"
        // Best-effort publisher name; same fallback chain as the HTTP route.
        // MCP bearer tokens don't carry an email claim, so we read it off the
        // user doc when needed.
        let publisherName = "A band member"
        try {
            const publisherDoc = await db
                .collection("users")
                .doc(callerUid)
                .get()
            const d = publisherDoc.exists ? publisherDoc.data() : undefined
            const callerEmail = typeof d?.email === "string" ? d.email : undefined
            publisherName =
                (typeof d?.displayName === "string" && d.displayName) ||
                callerEmail?.split("@")[0] ||
                publisherName
        } catch {
            // ignore — fall back to default
        }
        const songNames = songTracks.map((t) => t.title ?? "")
        const trimmedNote =
            typeof args.note === "string" ? args.note.trim().slice(0, 2000) : undefined
        const trimmedSubject =
            typeof args.subject === "string"
                ? args.subject.trim().slice(0, 200)
                : undefined
        const serviceNotes =
            typeof setlist.serviceNotes === "string"
                ? setlist.serviceNotes.trim()
                : undefined
        const combinedNote =
            [trimmedNote, serviceNotes].filter(Boolean).join("\n\n") || undefined
        try {
            const emailResult = await emailAllMembers(
                emailTargets,
                args.setlistId,
                setlistName,
                eventDateStr,
                publisherName,
                songNames,
                origin,
                combinedNote,
                trimmedSubject,
                // v11.4-02 (D8 item 4): brand the email by the publishing
                // tenant (the setlist's org), not a hardcoded CRC default.
                setlistOrg,
            )
            result.delivery.email.sent = emailResult.sent
            result.delivery.email.failed = emailResult.failed
        } catch (err) {
            logger.warn("[mcp publish] email send failed", err)
            result.delivery.email.failed = emailTargets.length
        }
    }

    // SMS — first-publish only, opt-in users only, matches HTTP route policy.
    if (!wasPublished) {
        const origin =
            process.env.NEXT_PUBLIC_BASE_URL || "https://centralreform.live"
        for (const r of recipients) {
            if (!r.smsOptIn || !r.phone) continue
            try {
                await sendSMS(
                    r.phone,
                    `CRC Music: "${setlistName}" for ${eventDateStr} has been published. View it at ${origin}/perform/setlist/${args.setlistId}`,
                )
                result.delivery.sms.sent++
            } catch (err) {
                logger.warn("[mcp publish] SMS failed", { uid: r.uid, err })
                result.delivery.sms.failed++
            }
        }
    }

    // History audit — fire-and-forget; never fail publish on this.
    void setlistRef
        .collection("history")
        .doc()
        .set({
            action: "published",
            userId: callerUid,
            userName: "mcp",
            timestamp: FieldValue.serverTimestamp(),
            details: {
                wasAlreadyPublished: wasPublished,
                source: "mcp",
                recipientCount: recipients.length,
                recipientNames: recipients.map((r) => r.name),
            },
        })
        .catch((err) => logger.warn("[mcp publish] audit log failed", err))

    logger.info("[mcp] setlist published", {
        setlistId: args.setlistId,
        wasPublished,
        recipientCount: recipients.length,
        emailed: result.delivery.email.sent,
    })

    return result
}
