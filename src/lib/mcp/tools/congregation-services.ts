import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID, congregationDocId } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import {
    DEFAULT_STREAM_LEAD_MINUTES,
    type CongregationServiceTimes,
    type CongregationStream,
} from "@/lib/today/types"
import { readServicesFromConfig, readStreamFromConfig } from "@/lib/today/config"

/**
 * `update_congregation_services` — the two config values `today.json` reads.
 *
 * `services[<serviceType>].defaultStartLocal` answers "what time does Friday
 * night start", and `stream.url` answers "where is it streamed". Both were
 * previously nowhere: the congregation config doc had a name, a logo and a
 * rabbi roster but no notion of when anything begins, which is why
 * `today.json`'s `startsAt` had nothing to compute from.
 *
 * Nothing is seeded. Daniel sets the values through Claude, because only he
 * knows them and a guessed service time is worse than none — the reader and
 * the stream overlays both show what this file says.
 *
 * Stage → confirm, like every other tool that writes on Daniel's behalf:
 * `dryRun` defaults to TRUE and returns the before/after diff without writing.
 * Admin only.
 */

type DB = FirebaseFirestore.Firestore

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
/** A `templateType` key: lowercase, digits, underscores and dashes. */
const SERVICE_KEY_RE = /^[a-z0-9_-]{1,64}$/
const MAX_SERVICES = 32

export interface UpdateCongregationServicesArgs {
    /**
     * Full replacement of the service-times map, keyed by `templateType`.
     * Omit to leave the current map untouched; pass `{}` to clear it.
     */
    services?: Record<string, { label?: string; defaultStartLocal: string }>
    /** The stream. Omit to leave untouched; pass null to clear it. */
    stream?: { url: string; leadMinutes?: number } | null
    /** Default TRUE — report the diff, write nothing. */
    dryRun?: boolean
}

export interface UpdateCongregationServicesResult {
    ok: true
    dryRun: boolean
    /** True when the committed (or proposed) state differs from the current. */
    changed: boolean
    before: {
        services: Record<string, CongregationServiceTimes> | null
        stream: CongregationStream | null
    }
    after: {
        services: Record<string, CongregationServiceTimes> | null
        stream: CongregationStream | null
    }
    /** Human-readable lines describing each change, for the confirm step. */
    diff: string[]
}

async function assertAdmin(
    db: DB,
    uid: string,
): Promise<{ ok: true } | RichErrorEnvelope> {
    const role = await readUserRole(db, uid)
    if (role === "admin") return { ok: true }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin"],
        message: "Changing the congregation's service times requires an admin account.",
        hint: "These values are published to the siddur reader and the stream overlays; ask Daniel to make the change.",
    })
}

/** Validate the incoming service map, or return the refusal. */
function validateServices(
    input: NonNullable<UpdateCongregationServicesArgs["services"]>,
): Record<string, CongregationServiceTimes> | RichErrorEnvelope {
    const keys = Object.keys(input)
    if (keys.length > MAX_SERVICES) {
        return richError(
            "invalid_argument",
            `At most ${MAX_SERVICES} service types (got ${keys.length}).`,
            { count: keys.length },
            "This map is keyed by templateType; there are a dozen or so.",
        )
    }
    const out: Record<string, CongregationServiceTimes> = {}
    for (const key of keys) {
        if (!SERVICE_KEY_RE.test(key)) {
            return richError(
                "invalid_argument",
                `'${key}' is not a valid service type key.`,
                { key },
                "Use the setlist's templateType, e.g. 'friday_night' or 'shabbat_morning'.",
            )
        }
        const row = input[key]
        if (!row || typeof row.defaultStartLocal !== "string") {
            return richError(
                "invalid_argument",
                `Service '${key}' needs a defaultStartLocal.`,
                { key },
                "Pass 24-hour HH:mm, e.g. '18:00' for 6pm.",
            )
        }
        if (!HHMM_RE.test(row.defaultStartLocal)) {
            return richError(
                "invalid_argument",
                `Service '${key}': defaultStartLocal must be 24-hour HH:mm (got "${row.defaultStartLocal}").`,
                { key, defaultStartLocal: row.defaultStartLocal },
                "It is a wall-clock America/Chicago time: '18:00', not '6pm' and not a UTC instant.",
            )
        }
        out[key] = {
            label:
                typeof row.label === "string" && row.label.trim()
                    ? row.label.trim()
                    : key,
            defaultStartLocal: row.defaultStartLocal,
        }
    }
    return out
}

function validateStream(
    input: NonNullable<UpdateCongregationServicesArgs["stream"]>,
): CongregationStream | RichErrorEnvelope {
    const url = typeof input.url === "string" ? input.url.trim() : ""
    if (!url) {
        return richError(
            "invalid_argument",
            "stream.url is required.",
            {},
            "Pass the stream's https URL, or pass stream: null to clear it.",
        )
    }
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return richError(
            "invalid_argument",
            `stream.url is not a URL (got "${url}").`,
            { url },
            "Pass an absolute https URL.",
        )
    }
    if (parsed.protocol !== "https:") {
        return richError(
            "invalid_argument",
            `stream.url must be https (got "${parsed.protocol}").`,
            { url },
            "today.json is read by browsers over https; an http URL would be blocked as mixed content.",
        )
    }
    const out: CongregationStream = { url }
    if (input.leadMinutes !== undefined) {
        if (
            typeof input.leadMinutes !== "number" ||
            !Number.isInteger(input.leadMinutes) ||
            input.leadMinutes < 0 ||
            input.leadMinutes > 240
        ) {
            return richError(
                "invalid_argument",
                `stream.leadMinutes must be a whole number of minutes, 0-240 (got ${String(input.leadMinutes)}).`,
                { leadMinutes: input.leadMinutes },
                `Omit it to use the default of ${DEFAULT_STREAM_LEAD_MINUTES} minutes.`,
            )
        }
        out.leadMinutes = input.leadMinutes
    }
    return out
}

function isEnvelope(v: unknown): v is RichErrorEnvelope {
    return !!v && typeof v === "object" && "error" in (v as Record<string, unknown>)
}

function describeServices(
    before: Record<string, CongregationServiceTimes> | null,
    after: Record<string, CongregationServiceTimes> | null,
): string[] {
    const lines: string[] = []
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
    for (const key of [...keys].sort()) {
        const b = before?.[key]
        const a = after?.[key]
        if (!b && a) lines.push(`+ ${key}: starts ${a.defaultStartLocal} (${a.label})`)
        else if (b && !a) lines.push(`- ${key}: was ${b.defaultStartLocal}`)
        else if (b && a && (b.defaultStartLocal !== a.defaultStartLocal || b.label !== a.label)) {
            lines.push(
                `~ ${key}: ${b.defaultStartLocal} (${b.label}) -> ${a.defaultStartLocal} (${a.label})`,
            )
        }
    }
    return lines
}

export async function updateCongregationServices(
    uid: string,
    args: UpdateCongregationServicesArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<UpdateCongregationServicesResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()

    const admin = await assertAdmin(db, uid)
    if (!admin.ok) return admin

    if (args.services === undefined && args.stream === undefined) {
        return richError(
            "invalid_argument",
            "Pass `services`, `stream`, or both.",
            {},
            "Call get_congregation_context first to see the current values.",
        )
    }

    const ref = db.collection("config").doc(congregationDocId(org))
    const snap = await ref.get()
    const config = (snap.exists ? snap.data() : null) as Record<string, unknown> | null

    const before = {
        services: readServicesFromConfig(config),
        stream: readStreamFromConfig(config),
    }

    let nextServices = before.services
    if (args.services !== undefined) {
        const validated = validateServices(args.services)
        if (isEnvelope(validated)) return validated
        nextServices = Object.keys(validated).length ? validated : null
    }

    let nextStream = before.stream
    if (args.stream !== undefined) {
        if (args.stream === null) {
            nextStream = null
        } else {
            const validated = validateStream(args.stream)
            if (isEnvelope(validated)) return validated
            nextStream = validated
        }
    }

    const after = { services: nextServices, stream: nextStream }
    const diff = describeServices(before.services, after.services)
    if (JSON.stringify(before.stream) !== JSON.stringify(after.stream)) {
        diff.push(
            `~ stream: ${before.stream?.url ?? "(none)"} -> ${after.stream?.url ?? "(none)"}`,
        )
    }
    const changed = diff.length > 0

    const dryRun = args.dryRun !== false
    if (!dryRun && changed) {
        // `services` and `stream` are whole-value replacements, so a merge set
        // on those two keys is the right write: it leaves the rest of the
        // congregation doc (name, logo, rabbi profiles, feature flags) alone.
        await ref.set(
            {
                ...(args.services !== undefined ? { services: after.services ?? {} } : {}),
                ...(args.stream !== undefined ? { stream: after.stream ?? null } : {}),
            },
            { merge: true },
        )
        logger.info("[mcp] update_congregation_services committed", {
            org,
            uid,
            changes: diff.length,
        })
    }

    return { ok: true, dryRun, changed, before, after, diff }
}
