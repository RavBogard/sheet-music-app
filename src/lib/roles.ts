/**
 * Shared role hierarchy for the application.
 *
 * The hierarchy is: admin > band_leader > musician > member > pending
 * Backward compat: 'leader' is the legacy name for 'band_leader'.
 *
 * Used by both client-side (auth-context) and server-side (api-auth) code
 * to ensure consistent role checks across the entire application.
 */

export type UserRole = 'admin' | 'band_leader' | 'leader' | 'musician' | 'member' | 'pending'

const ROLE_HIERARCHY: Record<string, number> = {
    admin: 100,
    band_leader: 80,
    leader: 80, // backward compat
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
 *   hasRole('leader', 'band_leader')  // true — 'leader' is legacy alias for band_leader
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
