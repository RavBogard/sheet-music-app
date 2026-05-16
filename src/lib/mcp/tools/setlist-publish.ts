import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { emailAllMembers } from "@/lib/email"
import { sendPushToUsers } from "@/lib/push-send"
import { sendSMS } from "@/lib/sms"
import { recordSongUsage } from "@/lib/song-usage"
import { assertEditor, readUserRole } from "@/lib/mcp/server-tracks-write"
import { getChartHealth } from "@/lib/file-fetcher"
import { logger } from "@/lib/logger"

/**
 * MCP publish_setlist — send the setlist to the band via MCP, mirroring
 * the in-app `/api/setlist/publish` flow's snapshot + multi-channel
 * fan-out so an MCP-published setlist is operationally identical to a
 * UI-published one.
 *
 * Defaulted recipient model: when no `recipients[]` override is supplied,
 * the tool queries `users` for every account in roles
 * {admin, band_leader, musician} except the caller. The HTTP route takes
 * an explicit musicians[] from the in-app picker UI; MCP has no picker,
 * so we apply a sensible default + let the caller narrow. `member`-only
 * accounts (congregation, not band) are excluded by default to avoid
 * accidental spam.
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

type ToolError = { error: string }

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
     * Chart-health pre-flight report. Always populated. Each entry mirrors
     * `verify_setlist_charts.rows[]` shape: { fileId, title, status }.
     * `unhealthy[]` is the subset with status missing/unreachable — same set
     * the publish refused on (or `force: true` bypassed).
     */
    chartHealth: {
        bondedCount: number
        okCount: number
        unhealthy: Array<{
            trackId: string
            title: string
            fileId: string
            status: "missing" | "unreachable"
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

async function resolveDefaultRecipients(
    db: FirebaseFirestore.Firestore,
    callerUid: string,
    audience: "band" | "all",
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
): Promise<PublishSetlistResult | ToolError> {
    if (!args.setlistId?.trim()) return { error: "setlistId is required" }

    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, callerUid)
    if (!editor.ok) return { error: editor.error }

    // assertEditor already gates on admin OR band_leader; this re-read is just
    // for the rate-limit bypass + audit. The setlist-ownership branch is moot
    // for MCP (every caller that got past assertEditor is already a trusted
    // leader) but kept for parity with the HTTP route's auth contract.
    const role = await readUserRole(db, callerUid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(callerUid, "api", { bypass })
    if (limited) return { error: limited.error }

    const setlistRef = db.collection("setlists").doc(args.setlistId)
    const setlistSnap = await setlistRef.get()
    if (!setlistSnap.exists) return { error: "Setlist not found" }
    const setlist = setlistSnap.data() as Record<string, unknown>

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
        return {
            error:
                "Setlist must have at least one song row with a bonded chart before publishing — add tracks via add_track_to_setlist / bulk_add_tracks first.",
        }
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
            (r): r is typeof r & { health: { status: "missing" | "unreachable" } } =>
                r.health.status === "missing" || r.health.status === "unreachable",
        )
        .map((r) => ({
            trackId: r.trackId,
            title: r.title,
            fileId: r.fileId,
            status: r.health.status,
            reason:
                r.health.status === "missing"
                    ? r.health.reason
                    : r.health.error,
        }))
    const chartHealth = {
        bondedCount: bondedSongTracks.length,
        okCount: healthRows.filter((r) => r.health.status === "ok").length,
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
        return {
            error:
                `Publish refused: ${unhealthy.length} bonded chart(s) won't render for the band:\n${list}${more}\n` +
                `Re-bond or remove these rows, or pass force: true to publish anyway (the band will see 404s on those charts).`,
        }
    }

    const recipients =
        args.recipients && args.recipients.length > 0
            ? await resolveOverrideRecipients(db, callerUid, args.recipients)
            : await resolveDefaultRecipients(db, callerUid, args.audience ?? "band")

    const snapshot = songTracks.map((t) => ({
        title: t.title ?? "",
        key: t.key ?? "",
        fileId: t.fileId ?? "",
    }))

    const setlistName =
        (typeof setlist.name === "string" && setlist.name) || args.setlistId
    const wasPublished = !!setlist.publishedAt

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
    await setlistRef.update({
        ...(wasPublished ? {} : { publishedAt: FieldValue.serverTimestamp() }),
        publishedSnapshot: snapshot,
        lastNotifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    })

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
