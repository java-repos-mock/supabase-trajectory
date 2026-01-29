import { useQuery } from '@tanstack/react-query'

import { get } from 'data/fetchers'
import type { ResponseError, UseCustomQueryOptions } from 'types'
import { integrationKeys } from './keys'

/**
 * Fetches GitHub authorization status for the current user.
 * This is a simple check that doesn't need retries - the user either
 * has authorized GitHub integration or they haven't.
 */
export async function getGitHubAuthorization(signal?: AbortSignal) {
  const { data, error } = await get('/platform/integrations/github/authorization', {
    signal,
  })
  return error ? null : data
}

export type GitHubAuthorizationData = Awaited<ReturnType<typeof getGitHubAuthorization>>
export type ProjectGitHubRepositoryConnectionsData = Awaited<
  ReturnType<typeof getGitHubAuthorization>
>
export type GitHubAuthorizationError = ResponseError

export const useGitHubAuthorizationQuery = <TData = GitHubAuthorizationData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<GitHubAuthorizationData, GitHubAuthorizationError, TData> = {}) => {
  return useQuery<GitHubAuthorizationData, GitHubAuthorizationError, TData>({
    queryKey: integrationKeys.githubAuthorization(),
    queryFn: ({ signal }) => getGitHubAuthorization(signal),
    enabled,
    // Don't retry - authorization status is a simple check
    retry: false,
    // Cache authorization status to reduce API calls
    staleTime: 1000 * 60 * 30,
    ...options,
  })
}
