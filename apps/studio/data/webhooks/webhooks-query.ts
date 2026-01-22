import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { get } from 'data/fetchers'
import { ResponseError } from 'types'
import { webhookKeys } from './keys'
import { WebhookResponse, Webhook, transformWebhookResponse } from 'lib/webhook-utils'

export interface WebhooksVariables {
  projectRef?: string
}

async function fetchWebhooks(
  { projectRef }: WebhooksVariables,
  signal?: AbortSignal
): Promise<Webhook[]> {
  if (!projectRef) {
    throw new Error('projectRef is required')
  }

  const { data, error } = await get(`/platform/projects/${projectRef}/webhooks`, {
    signal,
  })

  if (error) throw error

  // Transform API responses to internal format
  return (data as WebhookResponse[]).map(transformWebhookResponse)
}

export type WebhooksData = Webhook[]
export type WebhooksError = ResponseError

export function useWebhooksQuery<TData = WebhooksData>(
  { projectRef }: WebhooksVariables,
  options: UseQueryOptions<WebhooksData, WebhooksError, TData> = {}
) {
  return useQuery<WebhooksData, WebhooksError, TData>({
    queryKey: webhookKeys.list(projectRef),
    queryFn: ({ signal }) => fetchWebhooks({ projectRef }, signal),
    enabled: !!projectRef,
    ...options,
  })
}

// Single webhook query
export interface WebhookVariables {
  projectRef?: string
  webhookId?: string
}

async function fetchWebhook(
  { projectRef, webhookId }: WebhookVariables,
  signal?: AbortSignal
): Promise<Webhook> {
  if (!projectRef || !webhookId) {
    throw new Error('projectRef and webhookId are required')
  }

  const { data, error } = await get(
    `/platform/projects/${projectRef}/webhooks/${webhookId}`,
    { signal }
  )

  if (error) throw error

  return transformWebhookResponse(data as WebhookResponse)
}

export function useWebhookQuery<TData = Webhook>(
  { projectRef, webhookId }: WebhookVariables,
  options: UseQueryOptions<Webhook, WebhooksError, TData> = {}
) {
  return useQuery<Webhook, WebhooksError, TData>({
    queryKey: webhookKeys.detail(projectRef, webhookId),
    queryFn: ({ signal }) => fetchWebhook({ projectRef, webhookId }, signal),
    enabled: !!projectRef && !!webhookId,
    ...options,
  })
}
