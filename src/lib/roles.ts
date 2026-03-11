/**
 * Shared role hierarchy for the application.
 *
 * AUTH-04 Role Model (verified 2026-03):
 *
 * Hierarchy: admin > band_leader > musician > member > pending
 *   - admin (100):       Full access — all booleans true. Daniel's role.
 *   - band_leader (80):  Setlist management, edit access, musician capabilities.
 *
 *   - musician (60):     Performance + profile: view setlists, set transposition, PDF access.
 *   - member (40):       Basic membership — no special music capabilities.
 *   - pending (0):       Awaiting approval — no access beyond public pages.
 *
 * Sound Engineer: NOT a role in this hierarchy.
 *   - `soundEngineer: boolean` on UserProfile is orthogonal to role.
 *   - Per research decision: "Keep the boolean flag approach. It's orthogonal to the role hierarchy."
 *   - Sound engineers get monitor bus assignment access via useMonitorAccess():
 *       hasAccess = isAdmin || isSoundEngineer || hasBusAssigned
 *   - A musician with soundEngineer=true is still a musician in the role hierarchy.
 *
 * Used by both client-side (auth-context) and server-side (api-auth) code
 * to ensure consistent role checks across the entire application.
 */

export type UserRole = 'admin' | 'band_leader' | 'musician' | 'member' | 'pending'

const ROLE_HIERARCHY: Record<string, number> = {
    admin: 100,
    band_leader: 80,
    musician: 60,
    member: 40,
    pending: 0,
}

/**
 * Check if a user's role meets the minimum required level.
 *
 * @example
 *   hasRole('admin', 'band_leader')  // true — admin outranks band_leader
 *   hasRole('musician', 'band_leader')  // false — musician is below band_leader
 *   hasRole('member', 'musician')     // false — member is below musician
 */
export function hasRole(userRole: string | null | undefined, minimumRole: UserRole): boolean {
    if (!userRole) return false
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 0
    return userLevel >= requiredLevel
}

/**
 * Derive all role booleans from a single role string.
 * This is the single source of truth for role derivation — used by auth-context.
 */
export function deriveRoles(role: string | null | undefined) {
    return {
        isAdmin: role === 'admin',
        isBandLeader: hasRole(role, 'band_leader'),
        isMusician: hasRole(role, 'musician'),
        isMember: hasRole(role, 'member'),
    }
}
