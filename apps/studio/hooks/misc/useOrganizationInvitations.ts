import { useMemo, useCallback } from 'react'
import { useParams } from 'common'
import { useOrganizationInvitationsQuery } from 'data/organization-invitations/invitations-query'
import { useInvitationCreateMutation } from 'data/organization-invitations/invitation-create-mutation'
import { useInvitationRevokeMutation } from 'data/organization-invitations/invitation-revoke-mutation'
import {
  OrganizationInvitation,
} from 'data/organization-invitations/invitations-query'
import {
  InvitationRole,
  ORGANIZATION_ROLES,
  getRoleByName,
  isInvitationExpired,
  groupInvitationsByStatus,
  sortInvitationsByDate,
  filterInvitationsByEmail,
  getInvitationSummary,
  canManageInvitations,
  getAvailableRolesForInvitation,
} from 'lib/invitation-utils'

export interface UseOrganizationInvitationsOptions {
  organizationSlug?: string
  userRole?: string
}

export interface UseOrganizationInvitationsReturn {
  invitations: OrganizationInvitation[]
  pendingInvitations: OrganizationInvitation[]
  isLoading: boolean
  error: Error | null
  
  sendInvitation: (email: string, role: InvitationRole, projectIds?: string[]) => Promise<boolean>
  revokeInvitation: (invitationId: string, email?: string) => Promise<boolean>
  
  isSending: boolean
  isRevoking: boolean
  
  canManage: boolean
  availableRoles: InvitationRole[]
  
  summary: ReturnType<typeof getInvitationSummary>
  
  filterByEmail: (search: string) => OrganizationInvitation[]
  sortByDate: (order?: 'asc' | 'desc') => OrganizationInvitation[]
  
  refetch: () => void
}

/**
 * Hook for managing organization invitations.
 */
export function useOrganizationInvitations(
  options: UseOrganizationInvitationsOptions = {}
): UseOrganizationInvitationsReturn {
  const params = useParams()
  const organizationSlug = options.organizationSlug || params?.slug
  const userRole = options.userRole || 'Developer'

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useOrganizationInvitationsQuery({ organizationSlug })

  const createMutation = useInvitationCreateMutation()
  const revokeMutation = useInvitationRevokeMutation()

  const invitations = useMemo(() => {
    return data?.invitations || []
  }, [data])

  const pendingInvitations = useMemo(() => {
    return invitations.filter(inv => 
      inv.status === 'pending' && !isInvitationExpired(inv)
    )
  }, [invitations])

  const summary = useMemo(() => {
    return getInvitationSummary(invitations)
  }, [invitations])

  const canManage = useMemo(() => {
    return canManageInvitations(userRole)
  }, [userRole])

  const availableRoles = useMemo(() => {
    return getAvailableRolesForInvitation(userRole)
  }, [userRole])

  const sendInvitation = useCallback(
    async (email: string, role: InvitationRole, projectIds?: string[]): Promise<boolean> => {
      if (!organizationSlug) return false

      try {
        await createMutation.mutateAsync({
          organizationSlug,
          email,
          roleId: role.id,
          projectIds,
        })
        return true
      } catch {
        return false
      }
    },
    [organizationSlug, createMutation]
  )

  const revokeInvitation = useCallback(
    async (invitationId: string, email?: string): Promise<boolean> => {
      if (!organizationSlug) return false

      try {
        await revokeMutation.mutateAsync({
          organizationSlug,
          invitationId,
          inviteeEmail: email,
        })
        return true
      } catch {
        return false
      }
    },
    [organizationSlug, revokeMutation]
  )

  const filterByEmail = useCallback(
    (search: string) => filterInvitationsByEmail(invitations, search),
    [invitations]
  )

  const sortByDate = useCallback(
    (order: 'asc' | 'desc' = 'desc') => sortInvitationsByDate(invitations, order),
    [invitations]
  )

  return {
    invitations,
    pendingInvitations,
    isLoading,
    error: error as Error | null,
    
    sendInvitation,
    revokeInvitation,
    
    isSending: createMutation.isPending,
    isRevoking: revokeMutation.isPending,
    
    canManage,
    availableRoles,
    
    summary,
    
    filterByEmail,
    sortByDate,
    
    refetch,
  }
}

/**
 * Hook for accepting an invitation.
 */
export { useInvitationAcceptMutation } from 'data/organization-invitations/invitation-accept-mutation'
export { useInvitationByTokenQuery } from 'data/organization-invitations/invitations-query'
