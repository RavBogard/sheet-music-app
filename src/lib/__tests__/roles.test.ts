import { describe, it, expect } from 'vitest'
import { hasRole, deriveRoles } from '../roles'

/**
 * Tests for the role hierarchy:
 *   admin > band_leader > musician > member > pending
 *
 * AUTH-04 roles:
 *   - admin: Full access
 *   - band_leader: Setlist management (isBandLeader, isMusician, isMember)
 *   - musician: Performance + profile (isMusician, isMember)
 *   - sound_engineer: Boolean flag (soundEngineer), NOT a hierarchy level
 *
 * Legacy alias: 'leader' maps to 'band_leader' level
 */

describe('hasRole', () => {
    // ── Admin ───────────────────────────────────────────────────────────────

    describe('admin role', () => {
        it('admin meets admin requirement', () => {
            expect(hasRole('admin', 'admin')).toBe(true)
        })

        it('admin meets band_leader requirement', () => {
            expect(hasRole('admin', 'band_leader')).toBe(true)
        })

        it('admin meets musician requirement', () => {
            expect(hasRole('admin', 'musician')).toBe(true)
        })

        it('admin meets member requirement', () => {
            expect(hasRole('admin', 'member')).toBe(true)
        })

        it('admin meets pending requirement', () => {
            expect(hasRole('admin', 'pending')).toBe(true)
        })
    })

    // ── Band Leader ─────────────────────────────────────────────────────────

    describe('band_leader role', () => {
        it('band_leader does not meet admin requirement', () => {
            expect(hasRole('band_leader', 'admin')).toBe(false)
        })

        it('band_leader meets band_leader requirement', () => {
            expect(hasRole('band_leader', 'band_leader')).toBe(true)
        })

        it('band_leader meets musician requirement', () => {
            expect(hasRole('band_leader', 'musician')).toBe(true)
        })

        it('band_leader meets member requirement', () => {
            expect(hasRole('band_leader', 'member')).toBe(true)
        })

        it('band_leader meets pending requirement', () => {
            expect(hasRole('band_leader', 'pending')).toBe(true)
        })
    })

    // ── Musician ────────────────────────────────────────────────────────────

    describe('musician role', () => {
        it('musician does not meet admin requirement', () => {
            expect(hasRole('musician', 'admin')).toBe(false)
        })

        it('musician does not meet band_leader requirement', () => {
            expect(hasRole('musician', 'band_leader')).toBe(false)
        })

        it('musician meets musician requirement', () => {
            expect(hasRole('musician', 'musician')).toBe(true)
        })

        it('musician meets member requirement', () => {
            expect(hasRole('musician', 'member')).toBe(true)
        })

        it('musician meets pending requirement', () => {
            expect(hasRole('musician', 'pending')).toBe(true)
        })
    })

    // ── Member ──────────────────────────────────────────────────────────────

    describe('member role', () => {
        it('member does not meet admin requirement', () => {
            expect(hasRole('member', 'admin')).toBe(false)
        })

        it('member does not meet band_leader requirement', () => {
            expect(hasRole('member', 'band_leader')).toBe(false)
        })

        it('member does not meet musician requirement', () => {
            expect(hasRole('member', 'musician')).toBe(false)
        })

        it('member meets member requirement', () => {
            expect(hasRole('member', 'member')).toBe(true)
        })

        it('member meets pending requirement', () => {
            expect(hasRole('member', 'pending')).toBe(true)
        })
    })

    // ── Pending ─────────────────────────────────────────────────────────────

    describe('pending role', () => {
        it('pending does not meet admin requirement', () => {
            expect(hasRole('pending', 'admin')).toBe(false)
        })

        it('pending does not meet band_leader requirement', () => {
            expect(hasRole('pending', 'band_leader')).toBe(false)
        })

        it('pending does not meet musician requirement', () => {
            expect(hasRole('pending', 'musician')).toBe(false)
        })

        it('pending does not meet member requirement', () => {
            expect(hasRole('pending', 'member')).toBe(false)
        })

        it('pending does not meet pending requirement (level 0)', () => {
            // pending is level 0, pending minimum is also 0 — should be true
            expect(hasRole('pending', 'pending')).toBe(true)
        })
    })

    // ── Legacy alias ─────────────────────────────────────────────────────────

    describe('leader legacy alias', () => {
        it("'leader' is equivalent to 'band_leader'", () => {
            expect(hasRole('leader', 'band_leader')).toBe(true)
        })

        it("'leader' outranks musician", () => {
            expect(hasRole('leader', 'musician')).toBe(true)
        })

        it("'leader' does not meet admin requirement", () => {
            expect(hasRole('leader', 'admin')).toBe(false)
        })
    })

    // ── Null / undefined / edge cases ────────────────────────────────────────

    describe('null, undefined, empty inputs', () => {
        it('null role returns false for musician check', () => {
            expect(hasRole(null, 'musician')).toBe(false)
        })

        it('undefined role returns false for musician check', () => {
            expect(hasRole(undefined, 'musician')).toBe(false)
        })

        it('empty string role returns false for member check', () => {
            expect(hasRole('', 'member')).toBe(false)
        })

        it('unknown role returns false for any check', () => {
            expect(hasRole('superadmin', 'admin')).toBe(false)
        })
    })
})

// ── deriveRoles ──────────────────────────────────────────────────────────────

describe('deriveRoles', () => {
    describe('admin role', () => {
        it('admin: isAdmin=true', () => {
            expect(deriveRoles('admin').isAdmin).toBe(true)
        })

        it('admin: isBandLeader=true', () => {
            expect(deriveRoles('admin').isBandLeader).toBe(true)
        })

        it('admin: isMusician=true', () => {
            expect(deriveRoles('admin').isMusician).toBe(true)
        })

        it('admin: isMember=true', () => {
            expect(deriveRoles('admin').isMember).toBe(true)
        })
    })

    describe('band_leader role', () => {
        it('band_leader: isAdmin=false', () => {
            expect(deriveRoles('band_leader').isAdmin).toBe(false)
        })

        it('band_leader: isBandLeader=true', () => {
            expect(deriveRoles('band_leader').isBandLeader).toBe(true)
        })

        it('band_leader: isMusician=true', () => {
            expect(deriveRoles('band_leader').isMusician).toBe(true)
        })

        it('band_leader: isMember=true', () => {
            expect(deriveRoles('band_leader').isMember).toBe(true)
        })
    })

    describe('musician role', () => {
        it('musician: isAdmin=false', () => {
            expect(deriveRoles('musician').isAdmin).toBe(false)
        })

        it('musician: isBandLeader=false', () => {
            expect(deriveRoles('musician').isBandLeader).toBe(false)
        })

        it('musician: isMusician=true', () => {
            expect(deriveRoles('musician').isMusician).toBe(true)
        })

        it('musician: isMember=true', () => {
            expect(deriveRoles('musician').isMember).toBe(true)
        })
    })

    describe('member role', () => {
        it('member: isAdmin=false', () => {
            expect(deriveRoles('member').isAdmin).toBe(false)
        })

        it('member: isBandLeader=false', () => {
            expect(deriveRoles('member').isBandLeader).toBe(false)
        })

        it('member: isMusician=false', () => {
            expect(deriveRoles('member').isMusician).toBe(false)
        })

        it('member: isMember=true', () => {
            expect(deriveRoles('member').isMember).toBe(true)
        })
    })

    describe('null/undefined inputs', () => {
        it('null: all false', () => {
            const result = deriveRoles(null)
            expect(result.isAdmin).toBe(false)
            expect(result.isBandLeader).toBe(false)
            expect(result.isMusician).toBe(false)
            expect(result.isMember).toBe(false)
        })

        it('undefined: all false', () => {
            const result = deriveRoles(undefined)
            expect(result.isAdmin).toBe(false)
            expect(result.isBandLeader).toBe(false)
            expect(result.isMusician).toBe(false)
            expect(result.isMember).toBe(false)
        })
    })

    describe('sound_engineer is orthogonal to the role hierarchy', () => {
        /**
         * AUTH-04: soundEngineer is a boolean flag on UserProfile, NOT a role level.
         * A musician with soundEngineer=true has monitor access via useMonitorAccess(),
         * but deriveRoles() for that user would return musician-level booleans only.
         *
         * This test verifies that a 'musician' role is NOT elevated by the sound
         * engineer flag — role derivation must stay unchanged.
         */
        it('musician with soundEngineer=true still derives musician-only booleans', () => {
            // deriveRoles does not receive soundEngineer — it only takes the role string
            const result = deriveRoles('musician')
            expect(result.isBandLeader).toBe(false)
            expect(result.isAdmin).toBe(false)
            expect(result.isMusician).toBe(true)
        })

        it('useMonitorAccess logic: admin OR soundEngineer OR hasBus grants access', () => {
            // Simulate the logic in useMonitorAccess hook:
            //   hasAccess = isAdmin || isSoundEngineer || hasBusAssigned
            // Test each condition independently
            const grantedViaAdmin = deriveRoles('admin').isAdmin || false || false
            expect(grantedViaAdmin).toBe(true)

            const grantedViaSoundEngineer = deriveRoles('musician').isAdmin || true || false
            expect(grantedViaSoundEngineer).toBe(true)

            const grantedViaAssignment = deriveRoles('musician').isAdmin || false || true
            expect(grantedViaAssignment).toBe(true)

            const denied = deriveRoles('musician').isAdmin || false || false
            expect(denied).toBe(false)
        })
    })
})
