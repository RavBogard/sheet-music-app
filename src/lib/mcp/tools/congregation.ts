import "server-only"

import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { getServerCongregationConfig } from "@/lib/server-auth"
import { getAllSetlists } from "@/lib/server-setlists"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * F3 — `get_congregation_context` MCP read tool.
 *
 * Per [[user_mcp_is_primary_author_workflow]], Daniel + David author the
 * weekly setlist through Claude Desktop, but Claude is **stateless about the
 * congregation** every session: it has to be re-told who the rabbis are, what
 * the standing band roster looks like, and who's been leading lately. This
 * tool gives Claude that standing context in one call so it doesn't have to
 * be primed each authoring session.
 *
 * It returns, together:
 *  1. **congregation** — the `config/congregation` Firestore doc (name,
 *     location, rabbi profiles, core/default musicians, feature flags),
 *     falling back to a minimal default identity when the doc is absent.
 *  2. **leadHistory** — the most-recent N setlists with the rabbi who led
 *     ("Led by") and the band that played, so Claude can see who's led lately
 *     and which service types recur. Per-song Vocal Lead detail lives on the
 *     individual track rows — call `get_setlist` for that depth; this tool
 *     stays a single cheap read (one config doc + one setlists query, no
 *     per-setlist track fan-out).
 *
 * Auth posture mirrors the sibling read tools (`list_setlists`, `get_song`):
 * a valid bearer is required at the MCP route, but congregation + setlist data
 * is public-by-design ([[feedback_setlist_public_policy]]), so there is NO
 * trusted-leader gate here — match, don't over-gate. The `uid` is threaded for
 * a consistent contract with the other tools and is otherwise unused.
 *
 * Terminology ([[feedback_terminology]]): the per-service rabbi is surfaced as
 * "Led by" (`rabbi`); musicians are the band — never "lead"/"leader" except
 * the per-track "Vocal Lead" concept, which this tool does not duplicate.
 */

const DEFAULT_HISTORY_LIMIT = 10
const MAX_HISTORY_LIMIT = 50

/** Minimal server-side identity fallback when `config/congregation` is absent.
 *  Mirrors the load-bearing fields of congregation-store's DEFAULT_CONFIG
 *  without importing the client (zustand/firebase-web) store. */
const CONGREGATION_DEFAULTS = {
    name: "Central Reform Congregation",
    shortName: DEFAULT_SHORT_NAME,
    location: "St. Louis, MO",
    description: "Digital Sheet Music Library for CRC Musicians",
} as const

export interface GetCongregationContextArgs {
    /** How many recent setlists to summarize in leadHistory. Default 10, max 50. */
    historyLimit?: number
    /**
     * Order leadHistory by the service day (`eventDate`, default — "who led the
     * most recent service") or by the doc's write timestamp (`date`). Only
     * setlists carrying the chosen field are returned by Firestore's orderBy.
     */
    orderBy?: "eventDate" | "date"
}

interface RabbiProfile {
    name: string
    musicalRole?: string
    bandSizeGuidance?: string
    instruments?: string[]
}

interface CoreMusician {
    name: string
    instrument?: string
}

interface LeadHistoryEntry {
    setlistId: string
    name: string
    /** ISO service day if the setlist carries one, else null. */
    eventDate: string | null
    /** ISO write timestamp. */
    date: string | null
    /** Service/template type (shabbat_morning, friday_night, …) when set. */
    serviceType: string | null
    /** The rabbi who led the service ("Led by"), when recorded. */
    rabbi: string | null
    /** The band that played this service (denormalized on the setlist doc). */
    band: CoreMusician[]
    trackCount: number
    /** Denormalized count of song-typed tracks, when maintained. */
    songCount: number | null
}

export interface GetCongregationContextResult {
    ok: true
    congregation: {
        name: string
        shortName: string
        location: string | null
        description: string | null
        /** Rabbi profiles from config.scheduling.rabbiProfiles (who the rabbis are). */
        rabbis: RabbiProfile[]
        /** Standing band roster from config.defaultMusicians. */
        coreMusicians: CoreMusician[]
        features: Record<string, boolean> | null
        /** True when the `config/congregation` doc was absent and identity
         *  fields fell back to defaults. */
        usingDefaults: boolean
    }
    leadHistory: LeadHistoryEntry[]
    historyCount: number
}

function asString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

function buildRabbiProfiles(config: Record<string, unknown> | null): RabbiProfile[] {
    const scheduling = config?.scheduling as Record<string, unknown> | undefined
    const raw = scheduling?.rabbiProfiles
    if (!Array.isArray(raw)) return []
    const profiles: RabbiProfile[] = []
    for (const r of raw) {
        if (!r || typeof r !== "object") continue
        const row = r as Record<string, unknown>
        const name = asString(row.name)
        if (!name) continue
        const profile: RabbiProfile = { name }
        const musicalRole = asString(row.musicalRole)
        if (musicalRole) profile.musicalRole = musicalRole
        const bandSizeGuidance = asString(row.bandSizeGuidance)
        if (bandSizeGuidance) profile.bandSizeGuidance = bandSizeGuidance
        if (Array.isArray(row.instruments)) {
            const instruments = row.instruments.filter(
                (i): i is string => typeof i === "string",
            )
            if (instruments.length) profile.instruments = instruments
        }
        profiles.push(profile)
    }
    return profiles
}

function buildCoreMusicians(config: Record<string, unknown> | null): CoreMusician[] {
    const raw = config?.defaultMusicians
    if (!Array.isArray(raw)) return []
    const musicians: CoreMusician[] = []
    for (const m of raw) {
        if (!m || typeof m !== "object") continue
        const row = m as Record<string, unknown>
        const name = asString(row.name)
        if (!name) continue
        const entry: CoreMusician = { name }
        const instrument = asString(row.instrument)
        if (instrument) entry.instrument = instrument
        musicians.push(entry)
    }
    return musicians
}

function buildBand(setlist: Record<string, unknown>): CoreMusician[] {
    const raw = setlist.musicians
    if (!Array.isArray(raw)) return []
    const band: CoreMusician[] = []
    for (const m of raw) {
        if (!m || typeof m !== "object") continue
        const row = m as Record<string, unknown>
        const name = asString(row.name)
        if (!name) continue
        const entry: CoreMusician = { name }
        const instrument = asString(row.instrument)
        if (instrument) entry.instrument = instrument
        band.push(entry)
    }
    return band
}

export async function getCongregationContext(
    // Threaded for contract parity with the other read tools; congregation +
    // setlist data is public-by-design so the uid is intentionally unused.
    uid: string,
    args: GetCongregationContextArgs = {},
    // v11-05-04: caller org (orgFrom(extra) at the registration site). Scopes
    // the congregation read to the caller's per-org doc; crc reads the bare doc.
    org: OrgId = DEFAULT_ORG_ID,
): Promise<GetCongregationContextResult | RichErrorEnvelope> {
    void uid

    const requested =
        typeof args.historyLimit === "number" && args.historyLimit > 0
            ? Math.floor(args.historyLimit)
            : DEFAULT_HISTORY_LIMIT
    const historyLimit = Math.min(requested, MAX_HISTORY_LIMIT)
    const orderBy = args.orderBy === "date" ? "date" : "eventDate"

    try {
        // One config-doc read + one setlists query. getServerCongregationConfig
        // returns the raw doc data (or null on absent/unreachable);
        // getAllSetlists is the shared SSR/list_setlists helper — no duplicated
        // query logic.
        // v11-05-04 scopes the CONGREGATION doc per-org (above). leadHistory's
        // getAllSetlists has a v11-04-03 opt-in `org` filter, but it's an EQUALITY
        // filter (not crc-safe for unbackfilled docs) and wiring it live makes
        // this the first live caller — a setlist-read behavior change out of this
        // slice's scope. Setlist names are public-by-design ([[feedback_setlist_public_policy]]),
        // so cross-tenant leadHistory is a UX nit, not a leak. DEFERRED to the
        // v11-06 isolation audit (which sweeps exactly these setlist reads).
        const [configRaw, setlists] = await Promise.all([
            getServerCongregationConfig(org),
            getAllSetlists({ limit: historyLimit, orderBy }),
        ])

        const config = (configRaw as Record<string, unknown> | null) ?? null
        const usingDefaults = config === null

        const features =
            config?.features && typeof config.features === "object"
                ? (config.features as Record<string, boolean>)
                : null

        const leadHistory: LeadHistoryEntry[] = setlists.map((s) => {
            const row = s as Record<string, unknown>
            const trackCount =
                typeof row.trackCount === "number" ? row.trackCount : 0
            const songCount =
                typeof row.songCount === "number" ? row.songCount : null
            return {
                setlistId: typeof row.id === "string" ? row.id : "",
                name: asString(row.name) ?? "",
                eventDate: asString(row.eventDate),
                date: asString(row.date),
                serviceType: asString(row.templateType),
                rabbi: asString(row.rabbi),
                band: buildBand(row),
                trackCount,
                songCount,
            }
        })

        return {
            ok: true,
            congregation: {
                name: asString(config?.name) ?? CONGREGATION_DEFAULTS.name,
                shortName:
                    asString(config?.shortName) ??
                    CONGREGATION_DEFAULTS.shortName,
                location:
                    asString(config?.location) ??
                    CONGREGATION_DEFAULTS.location,
                description:
                    asString(config?.description) ??
                    CONGREGATION_DEFAULTS.description,
                rabbis: buildRabbiProfiles(config),
                coreMusicians: buildCoreMusicians(config),
                features,
                usingDefaults,
            },
            leadHistory,
            historyCount: leadHistory.length,
        }
    } catch (err) {
        logger.error("[mcp] get_congregation_context failed", err)
        return richError(
            "get_congregation_context_failed",
            `Failed to read congregation context: ${
                err instanceof Error ? err.message : String(err)
            }`,
            {},
            "Check Firestore connectivity; the config/congregation doc + setlists collection are the sources.",
        )
    }
}
