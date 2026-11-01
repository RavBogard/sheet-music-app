import { timedServices, type ServiceLike, type TimedService } from "@/lib/monitor/service-start"

/**
 * When the bridge check is allowed to speak, and whether it already has.
 *
 * The studio PC is switched on by Michael before each service and off after, so
 * "the bridge is down" is the normal state almost all week. The only moment it
 * means anything is shortly before a service: Michael arrives about 45 minutes
 * ahead and the band at 30. So the cron runs every 15 minutes, and this decides
 * whether "now" is inside the window for some CRC service today. Outside every
 * window the route returns without looking at the bridge at all.
 *
 * Kept out of `route.ts` (a route may export only HTTP handlers) so tests can
 * import it.
 */

/** The check window, in minutes before a service starts: [40, 20]. */
export const ALERT_WINDOW_FAR_MIN = 40
export const ALERT_WINDOW_NEAR_MIN = 20

const MIN = 60_000

/**
 * The services whose start is 20 to 40 minutes away, soonest first. The window is
 * 20 minutes wide on a 15-minute cron, so every service gets at least one check
 * even when a run is a few minutes late, and the dedupe below keeps it to one alert.
 */
export function servicesInAlertWindow(
    services: ServiceLike[],
    now: number,
    timeZone?: string,
): TimedService[] {
    return timedServices(services, timeZone).filter((s) => {
        const ahead = s.startMs - now
        return ahead >= ALERT_WINDOW_NEAR_MIN * MIN && ahead <= ALERT_WINDOW_FAR_MIN * MIN
    })
}

export type AlertDecision = "notify" | "suppress"

/**
 * One alert per service per problem. `config/bridgeWatch` remembers which service
 * (`serviceKey`) and which problem shape (`signature`) it last notified about:
 *   - a different service resets everything, so each service is checked fresh;
 *   - the same service with a different problem speaks again;
 *   - the same service with the same problem stays quiet on the later runs in the window.
 */
export function alertDecision(
    prev: Record<string, unknown> | undefined,
    serviceKey: string,
    signature: string,
): AlertDecision {
    const sameService = prev?.serviceKey === serviceKey
    const sameProblem = prev?.signature === signature
    const alreadyNotified = prev?.lastNotifiedAt != null
    return sameService && sameProblem && alreadyNotified ? "suppress" : "notify"
}
