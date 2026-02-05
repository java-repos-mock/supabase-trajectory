import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { del } from 'data/fetchers'
import { ResponseError } from 'types'
import { invitationKeys } from './keys'

export interface InvitationRevokeVariables {
  organizationSlug: string
  invitationId: string
  inviteeEmail?: string
}

async function revokeInvitation({
  organizationSlug,
  invitationId,
}: InvitationRevokeVariables): Promise<void> {
  const { error } = await del(
    `/platform/organizations/${organizationSlug}/invitations/${invitationId}`
  )

  if (error) throw error
}

export type InvitationRevokeError = ResponseError

export function useInvitationRevokeMutation() {
  const queryClient = useQueryClient()

  return useMutation<void, InvitationRevokeError, InvitationRevokeVariables>({
    mutationFn: revokeInvitation,
    onSuccess: (_, { organizationSlug, inviteeEmail }) => {
      queryClient.invalidateQueries({
        queryKey: invitationKeys.list(organizationSlug),
      })

      toast.success(
        inviteeEmail
          ? `Invitation to ${inviteeEmail} has been revoked`
          : 'Invitation revoked successfully'
      )
    },
    onError: () => {
      toast.error('Failed to revoke invitation')
    },
  })
}
