import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { post } from 'data/fetchers'
import { ResponseError } from 'types'
import { invitationKeys } from './keys'

export interface InvitationAcceptVariables {
  token: string
}

interface InvitationAcceptResponse {
  organization_slug: string
  organization_name: string
  role_name: string
}

async function acceptInvitation({
  token,
}: InvitationAcceptVariables): Promise<InvitationAcceptResponse> {
  const { data, error } = await post('/platform/invitations/accept', {
    body: { token },
  })

  if (error) throw error

  return data as InvitationAcceptResponse
}

export type InvitationAcceptData = InvitationAcceptResponse
export type InvitationAcceptError = ResponseError

export function useInvitationAcceptMutation() {
  const queryClient = useQueryClient()

  return useMutation<InvitationAcceptData, InvitationAcceptError, InvitationAcceptVariables>({
    mutationFn: acceptInvitation,
    onSuccess: (data, { token }) => {
      queryClient.invalidateQueries({
        queryKey: invitationKeys.byToken(token),
      })

      queryClient.invalidateQueries({
        queryKey: ['organizations'],
      })

      toast.success(`You've joined ${data.organization_name} as ${data.role_name}`)
    },
    onError: () => {
      toast.error('Failed to accept invitation')
    },
  })
}
