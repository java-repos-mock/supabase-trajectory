/**
 * Tests proving bugs in PR #16 that Greptile MISSED
 * 
 * NOTE: PR #16 is a WEAKER candidate - Greptile caught 10 significant issues.
 * The remaining bugs are conditional/fragile rather than definite failures.
 */

describe('PR #16: Bugs Greptile Missed (Conditional)', () => {

  /**
   * BUG 1: Timezone parsing depends on API format
   * 
   * If API returns '2024-01-01T12:00:00' (no Z suffix),
   * JavaScript parses it as LOCAL time, not UTC.
   * 
   * This is CONDITIONAL - only fails if API format changes.
   */
  describe('isInvitationExpired - timezone fragility', () => {
    it('FRAGILE: different results based on timestamp format', () => {
      const withZ = new Date('2024-01-01T12:00:00Z').getTime()
      const noZ = new Date('2024-01-01T12:00:00').getTime()
      
      // In non-UTC timezones, these will be different!
      // Difference = timezone offset
      const diffHours = (noZ - withZ) / 1000 / 60 / 60
      
      console.log('With Z:', withZ)
      console.log('Without Z:', noZ)
      console.log('Difference (hours):', diffHours)
      
      // In UTC timezone, this passes. In other timezones, it fails.
      // expect(withZ).toBe(noZ)  // FAILS in non-UTC timezones
    })

    it('shows the fragility', () => {
      // If API currently returns: '2024-01-01T12:00:00Z'
      // Code works correctly.
      
      // If API changes to: '2024-01-01T12:00:00'
      // Code breaks in non-UTC timezones.
      
      // The code should be defensive:
      // const expiresAt = new Date(invitation.expires_at + 'Z')
      // Or use a date library that handles this
    })
  })

  /**
   * BUG 2: Role ID ordering assumption
   * 
   * Code assumes: lower ID = higher privilege
   * This is not documented or guaranteed by the API.
   */
  describe('canInviteWithRole - implicit ID ordering', () => {
    const ROLES_CURRENT = [
      { id: 1, name: 'Owner' },
      { id: 2, name: 'Administrator' },
      { id: 3, name: 'Developer' },
      { id: 4, name: 'Read Only' },
    ]

    // What if API returns different IDs?
    const ROLES_CHANGED = [
      { id: 100, name: 'Owner' },
      { id: 50, name: 'Administrator' },  // Lower ID than Owner!
      { id: 200, name: 'Developer' },
      { id: 300, name: 'Read Only' },
    ]

    function canInviteWithRole(userRole: string, targetRole: string, roles: typeof ROLES_CURRENT) {
      const userRoleObj = roles.find(r => r.name === userRole)
      const targetRoleObj = roles.find(r => r.name === targetRole)
      if (!userRoleObj || !targetRoleObj) return false
      return userRoleObj.id <= targetRoleObj.id
    }

    it('works with current ID ordering', () => {
      expect(canInviteWithRole('Owner', 'Administrator', ROLES_CURRENT)).toBe(true)
      expect(canInviteWithRole('Administrator', 'Owner', ROLES_CURRENT)).toBe(false)
    })

    it('BREAKS if API changes ID ordering', () => {
      // Owner (100) <= Administrator (50) = FALSE!
      expect(canInviteWithRole('Owner', 'Administrator', ROLES_CHANGED)).toBe(true)
      // FAILS - returns false because 100 > 50
    })
  })
})

/**
 * VERDICT for PR #16:
 * 
 * Greptile CAUGHT (impressive - 10 comments!):
 * - Duplicated functionality (existing mutation file)
 * - Missing cache invalidations
 * - Unused inviteeEmail parameter
 * - Hardcoded roles (should come from API)
 * - Comment vs code mismatch (< vs <=)
 * - Silent error handling
 * - Unstable React dependencies (x2)
 * - Token URL encoding
 * - Email validation approach
 * 
 * Greptile MISSED (conditional bugs):
 * - Timezone parsing fragility (depends on API format)
 * - Role ID ordering assumption (works currently but fragile)
 * 
 * RECOMMENDATION: WEAK SHORTLIST
 * - Greptile caught most significant bugs
 * - Remaining bugs are "code smell" / fragility, not guaranteed failures
 * - Include if testing "implicit assumptions" category
 */
