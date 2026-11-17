import "server-only"

import { buildToday } from "@/lib/today/emit-today"
import { MIXER_ORG_ID } from "@/lib/org/features-client"
import type { ServiceLike } from "./service-start"

/**
 * The services the studio-PC jobs schedule around: CRC's `today.json`, built
 * from the setlists the same way `/api/today` builds it, so a start time edited
 * a minute ago is the one these jobs see.
 */
export async function loadServiceSchedule(now: number): Promise<ServiceLike[]> {
    return (await buildToday(MIXER_ORG_ID, new Date(now))).services
}
