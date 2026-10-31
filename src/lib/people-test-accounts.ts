/**
 * WEB-15: synthetic accounts minted for probes carry a `test-` uid prefix. The
 * People list hides them behind a counted toggle. The display name is not used:
 * a real person could be named anything.
 */
export function isTestAccount(p: { uid?: string | null; displayName?: string | null }): boolean {
    if (typeof p.uid === "string" && p.uid.toLowerCase().startsWith("test-")) return true
    return false
}
