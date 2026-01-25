/**
 * Invitation utilities for the Studio dashboard.
 * Provides helpers for invitation management and validation.
 */

import type { OrganizationInvitation } from 'data/organization-invitations/invitations-query'

/**
 * Invitation status types.
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

/**
 * Role information for invitations.
 */
export interface InvitationRole {
  id: number
  name: string
  description: string
}

/**
 * Available organization roles.
 */
export const ORGANIZATION_ROLES: InvitationRole[] = [
  { id: 1, name: 'Owner', description: 'Full access to organization and all projects' },
  { id: 2, name: 'Administrator', description: 'Manage organization settings and members' },
  { id: 3, name: 'Developer', description: 'Access to projects and development features' },
  { id: 4, name: 'Read Only', description: 'View-only access to projects' },
]

/**
 * Get role by ID.
 */
export function getRoleById(roleId: number): InvitationRole | undefined {
  return ORGANIZATION_ROLES.find(role => role.id === roleId)
}

/**
 * Get role by name.
 */
export function getRoleByName(roleName: string): InvitationRole | undefined {
  return ORGANIZATION_ROLES.find(role => role.name === roleName)
}

/**
 * Check if an invitation has expired.
 */
export function isInvitationExpired(invitation: OrganizationInvitation): boolean {
  if (invitation.status === 'expired') return true
  
  const expiresAt = new Date(invitation.expires_at)
  const now = new Date()
  
  return expiresAt < now
}

/**
 * Get time until invitation expires.
 * Returns milliseconds, or null if already expired.
 */
export function getTimeUntilExpiration(invitation: OrganizationInvitation): number | null {
  if (isInvitationExpired(invitation)) return null
  
  const expiresAt = new Date(invitation.expires_at)
  const now = new Date()
  
  return expiresAt.getTime() - now.getTime()
}

/**
 * Format expiration time for display.
 */
export function formatExpirationTime(invitation: OrganizationInvitation): string {
  const remaining = getTimeUntilExpiration(invitation)
  
  if (remaining === null) return 'Expired'
  
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `Expires in ${days} day${days === 1 ? '' : 's'}`
  if (hours > 0) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`
  
  return 'Expires soon'
}

/**
 * Check if user can manage invitations.
 * Requires Owner or Administrator role.
 */
export function canManageInvitations(userRole: string): boolean {
  return userRole === 'Owner' || userRole === 'Administrator'
}

/**
 * Check if user can invite with a specific role.
 * Users can only invite to roles lower than their own.
 */
export function canInviteWithRole(userRole: string, targetRole: string): boolean {
  const userRoleObj = getRoleByName(userRole)
  const targetRoleObj = getRoleByName(targetRole)
  
  if (!userRoleObj || !targetRoleObj) return false
  
  return userRoleObj.id <= targetRoleObj.id
}

/**
 * Get available roles for invitation based on user's role.
 */
export function getAvailableRolesForInvitation(userRole: string): InvitationRole[] {
  const userRoleObj = getRoleByName(userRole)
  if (!userRoleObj) return []
  
  return ORGANIZATION_ROLES.filter(role => role.id >= userRoleObj.id)
}

/**
 * Group invitations by status.
 */
export function groupInvitationsByStatus(
  invitations: OrganizationInvitation[]
): Record<InvitationStatus, OrganizationInvitation[]> {
  const groups: Record<InvitationStatus, OrganizationInvitation[]> = {
    pending: [],
    accepted: [],
    expired: [],
    revoked: [],
  }
  
  for (const invitation of invitations) {
    const status = isInvitationExpired(invitation) && invitation.status === 'pending'
      ? 'expired'
      : invitation.status
    groups[status].push(invitation)
  }
  
  return groups
}

/**
 * Sort invitations by date (newest first).
 */
export function sortInvitationsByDate(
  invitations: OrganizationInvitation[],
  order: 'asc' | 'desc' = 'desc'
): OrganizationInvitation[] {
  return [...invitations].sort((a, b) => {
    const dateA = new Date(a.invited_at).getTime()
    const dateB = new Date(b.invited_at).getTime()
    return order === 'desc' ? dateB - dateA : dateA - dateB
  })
}

/**
 * Filter invitations by email search.
 */
export function filterInvitationsByEmail(
  invitations: OrganizationInvitation[],
  search: string
): OrganizationInvitation[] {
  if (!search) return invitations
  
  const searchLower = search.toLowerCase()
  return invitations.filter(inv => 
    inv.email.toLowerCase().includes(searchLower)
  )
}

/**
 * Generate invitation link.
 */
export function generateInvitationLink(token: string, baseUrl: string = ''): string {
  const url = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${url}/join?token=${encodeURIComponent(token)}`
}

/**
 * Parse invitation token from URL.
 */
export function parseInvitationToken(url: string): string | null {
  try {
    const urlObj = new URL(url)
    return urlObj.searchParams.get('token')
  } catch {
    return null
  }
}

/**
 * Validate invitation token format.
 */
export function isValidTokenFormat(token: string): boolean {
  return /^[a-zA-Z0-9_-]{20,}$/.test(token)
}

/**
 * Get invitation summary for display.
 */
export function getInvitationSummary(invitations: OrganizationInvitation[]): {
  total: number
  pending: number
  accepted: number
  expired: number
} {
  const groups = groupInvitationsByStatus(invitations)
  
  return {
    total: invitations.length,
    pending: groups.pending.length,
    accepted: groups.accepted.length,
    expired: groups.expired.length + groups.revoked.length,
  }
}
