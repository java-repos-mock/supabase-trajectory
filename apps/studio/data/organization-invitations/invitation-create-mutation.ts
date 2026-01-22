import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { post } from 'data/fetchers'
import { ResponseError } from 'types'
import { invitationKeys } from './keys'

export interface InvitationCreateVariables {
  organizationSlug: string
  email: string
  roleId: number
  projectIds?: string[]
}

interface InvitationCreateResponse {
  id: string
  email: string
  role_id: number
  invited_at: string
  expires_at: string
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

async function createInvitation({
  organizationSlug,
  email,
  roleId,
  projectIds,
}: InvitationCreateVariables): Promise<InvitationCreateResponse> {
  if (!validateEmail(email)) {
    throw new Error('Invalid email address')
  }

  const { data, error } = await post(
    `/platform/organizations/${organizationSlug}/invitations`,
    {
      body: {
        email,
        role_id: roleId,
        project_ids: projectIds,
      },
    }
  )

  if (error) throw error

  return data as InvitationCreateResponse
}

export type InvitationCreateData = InvitationCreateResponse
export type InvitationCreateError = ResponseError

export function useInvitationCreateMutation() {
  const queryClient = useQueryClient()

  return useMutation<InvitationCreateData, InvitationCreateError, InvitationCreateVariables>({
    mutationFn: createInvitation,
    onSuccess: (data, { organizationSlug }) => {
      queryClient.invalidateQueries({
        queryKey: invitationKeys.list(organizationSlug),
      })

      toast.success(`Invitation sent to ${data.email}`)
    },
    onError: () => {
      toast.error('Failed to send invitation')
    },
  })
}
