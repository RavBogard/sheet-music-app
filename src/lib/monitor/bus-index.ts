/**
 * Monitor bus-index helpers (iPad consumer plane).
 *
 * DEFECT-REGISTER C-11: bus index **0 is a valid bus**. Several call sites
 * gated their fader handlers on `if (!myBusIndex) return`, which silently
 * dropped every command for a musician assigned bus 0 (and conflated "bus 0"
 * with "no bus"). Use this predicate (or an explicit `== null` check) instead
 * of truthiness so 0 is treated as a real assignment.
 */
export function hasAssignedBus(busIndex: number | null | undefined): busIndex is number {
    return busIndex != null
}
