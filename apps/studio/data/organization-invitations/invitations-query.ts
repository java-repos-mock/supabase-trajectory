import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { get } from 'data/fetchers'
import { ResponseError } from 'types'
import { invitationKeys } from './keys'

export interface OrganizationInvitation {
  id: string
  email: string
  role_id: number
  role_name: string
  invited_by: string
  invited_at: string
  expires_at: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
}

export interface InvitationsResponse {
  invitations: OrganizationInvitation[]
  total: number
}

export interface InvitationsVariables {
  organizationSlug?: string
  status?: 'pending' | 'all'
}

async function fetchInvitations(
  { organizationSlug, status }: InvitationsVariables,
  signal?: AbortSignal
): Promise<InvitationsResponse> {
  if (!organizationSlug) {
    throw new Error('organizationSlug is required')
  }

  const params = new URLSearchParams()
  if (status) {
    params.set('status', status)
  }

  const { data, error } = await get(
    `/platform/organizations/${organizationSlug}/invitations?${params.toString()}`,
    { signal }
  )

  if (error) throw error

  return data as InvitationsResponse
}

export type InvitationsData = InvitationsResponse
export type InvitationsError = ResponseError

export function useOrganizationInvitationsQuery<TData = InvitationsData>(
  { organizationSlug, status }: InvitationsVariables,
  options: UseQueryOptions<InvitationsData, InvitationsError, TData> = {}
) {
  return useQuery<InvitationsData, InvitationsError, TData>({
    queryKey: status === 'pending'
      ? invitationKeys.pending(organizationSlug)
      : invitationKeys.list(organizationSlug),
    queryFn: ({ signal }) => fetchInvitations({ organizationSlug, status }, signal),
    enabled: !!organizationSlug,
    staleTime: 30 * 1000,
    ...options,
  })
}

export interface InvitationByTokenVariables {
  token?: string
}

export interface InvitationTokenResponse {
  invitation: OrganizationInvitation | null
  organization: {
    slug: string
    name: string
  }
  is_expired: boolean
  email_matches: boolean
}

async function fetchInvitationByToken(
  { token }: InvitationByTokenVariables,
  signal?: AbortSignal
): Promise<InvitationTokenResponse> {
  if (!token) {
    throw new Error('token is required')
  }

  const { data, error } = await get(`/platform/invitations/verify?token=${token}`, { signal })

  if (error) throw error

  return data as InvitationTokenResponse
}

export function useInvitationByTokenQuery<TData = InvitationTokenResponse>(
  { token }: InvitationByTokenVariables,
  options: UseQueryOptions<InvitationTokenResponse, InvitationsError, TData> = {}
) {
  return useQuery<InvitationTokenResponse, InvitationsError, TData>({
    queryKey: invitationKeys.byToken(token),
    queryFn: ({ signal }) => fetchInvitationByToken({ token }, signal),
    enabled: !!token,
    staleTime: 0,
    ...options,
  })
}
