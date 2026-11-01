import "server-only"

import { buildToday, readStoredToday } from "@/lib/today/emit-today"
import { MIXER_ORG_ID } from "@/lib/org/features-client"
import type { ServiceLike } from "./service-start"

/** A stored `today.json` older than this is not trusted; the schedule is rebuilt from the setlists. */
const STORED_TODAY_MAX_AGE_MS = 60 * 60_000

/**
 * The services the studio-PC jobs schedule around: CRC's `today.json`, read from
 * its stored copy (emit-today refreshes it every 15 minutes) and rebuilt from the
 * setlists when the copy is missing, unreadable or more than an hour old.
 */
export async function loadServiceSchedule(now: number): Promise<ServiceLike[]> {
    try {
        const stored = await readStoredToday(MIXER_ORG_ID)
        const generatedMs = stored ? Date.parse(stored.generatedAt) : NaN
        if (stored && Number.isFinite(generatedMs) && now - generatedMs <= STORED_TODAY_MAX_AGE_MS) {
            return stored.services
        }
    } catch {
        // fall through to a rebuild
    }
    return (await buildToday(MIXER_ORG_ID, new Date(now))).services
}
