import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { post } from 'data/fetchers'
import { ResponseError } from 'types'
import { webhookKeys } from './keys'
import {
  WebhookConfig,
  WebhookResponse,
  Webhook,
  transformWebhookResponse,
  validateWebhookConfig,
} from 'lib/webhook-utils'

export interface WebhookCreateVariables {
  projectRef: string
  config: WebhookConfig
}

/**
 * Create a new webhook.
 * Note: Throws ResponseError on failure (different from update which returns null).
 */
async function createWebhook({ projectRef, config }: WebhookCreateVariables): Promise<Webhook> {
  // Validate config before sending
  const validation = validateWebhookConfig(config)
  if (!validation.valid) {
    // BUG: Throws error here, but updateWebhook returns null on validation failure
    // Inconsistent error handling across similar operations
    throw new Error(`Invalid webhook config: ${validation.errors.join(', ')}`)
  }

  const { data, error } = await post(`/platform/projects/${projectRef}/webhooks`, {
    body: config,  // Sends 'url' field, API accepts it for create
  })

  if (error) {
    throw error
  }

  return transformWebhookResponse(data as WebhookResponse)
}

export type WebhookCreateData = Webhook
export type WebhookCreateError = ResponseError

export function useWebhookCreateMutation() {
  const queryClient = useQueryClient()

  return useMutation<WebhookCreateData, WebhookCreateError, WebhookCreateVariables>({
    mutationFn: createWebhook,
    onSuccess: (data, { projectRef }) => {
      // Invalidate webhook list
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectRef) })
      
      toast.success(`Webhook "${data.name}" created successfully`)
    },
    onError: (error) => {
      toast.error(`Failed to create webhook: ${error.message}`)
    },
  })
}
