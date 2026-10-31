/**
 * WEB-15: synthetic accounts minted for probes (`test-` uid prefix, "[TEST]"
 * display name) must not appear among the real people on /manage.
 */
export function isTestAccount(p: { uid?: string | null; displayName?: string | null }): boolean {
    if (typeof p.uid === "string" && p.uid.toLowerCase().startsWith("test-")) return true
    if (typeof p.displayName === "string" && /^\s*\[test\]/i.test(p.displayName)) return true
    return false
}
