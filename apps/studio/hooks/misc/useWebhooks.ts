import { useMemo, useCallback } from 'react'
import { useParams } from 'common'
import { useWebhooksQuery, useWebhookQuery } from 'data/webhooks/webhooks-query'
import { useWebhookCreateMutation } from 'data/webhooks/webhook-create-mutation'
import { useWebhookUpdateMutation } from 'data/webhooks/webhook-update-mutation'
import { useWebhookDeleteMutation } from 'data/webhooks/webhook-delete-mutation'
import {
  WebhookConfig,
  Webhook,
  WebhookEvent,
  validateWebhookConfig,
  isValidWebhookUrl,
} from 'lib/webhook-utils'

export interface UseWebhooksOptions {
  projectRef?: string
}

export interface UseWebhooksReturn {
  webhooks: Webhook[]
  isLoading: boolean
  error: Error | null
  
  // CRUD operations
  createWebhook: (config: WebhookConfig) => Promise<Webhook | null>
  updateWebhook: (webhookId: string, config: Partial<WebhookConfig>) => Promise<Webhook | null>
  deleteWebhook: (webhookId: string, webhookName?: string) => Promise<boolean>
  
  // Mutation states
  isCreating: boolean
  isUpdating: boolean
  isDeleting: boolean
  
  // Utilities
  validateConfig: typeof validateWebhookConfig
  isValidUrl: typeof isValidWebhookUrl
  refetch: () => void
}

/**
 * Hook for managing webhooks in a project.
 * Provides CRUD operations with built-in validation and error handling.
 * 
 * @example
 * const { webhooks, createWebhook, isLoading } = useWebhooks()
 * 
 * // Create a new webhook
 * await createWebhook({
 *   name: 'My Webhook',
 *   url: 'https://example.com/hook',
 *   events: [WebhookEvent.INSERT],
 *   enabled: true,
 * })
 */
export function useWebhooks(options: UseWebhooksOptions = {}): UseWebhooksReturn {
  const params = useParams()
  const projectRef = options.projectRef || params?.ref

  // Queries
  const {
    data: webhooks = [],
    isLoading,
    error,
    refetch,
  } = useWebhooksQuery({ projectRef })

  // Mutations
  const createMutation = useWebhookCreateMutation()
  const updateMutation = useWebhookUpdateMutation()
  const deleteMutation = useWebhookDeleteMutation()

  /**
   * Create a new webhook.
   * Returns the created webhook, or null if creation failed.
   */
  const createWebhook = useCallback(
    async (config: WebhookConfig): Promise<Webhook | null> => {
      if (!projectRef) {
        console.error('Cannot create webhook: projectRef is required')
        return null
      }

      try {
        const result = await createMutation.mutateAsync({ projectRef, config })
        return result
      } catch (error) {
        // Error is already handled by mutation's onError
        return null
      }
    },
    [projectRef, createMutation]
  )

  /**
   * Update an existing webhook.
   * Returns the updated webhook, or null if update failed.
   * 
   * Note: Due to API inconsistency, URL updates may not work correctly.
   */
  const updateWebhook = useCallback(
    async (webhookId: string, config: Partial<WebhookConfig>): Promise<Webhook | null> => {
      if (!projectRef) {
        console.error('Cannot update webhook: projectRef is required')
        return null
      }

      try {
        // BUG: updateMutation returns null on validation failure, not throws
        // But we treat it as success here
        const result = await updateMutation.mutateAsync({ projectRef, webhookId, config })
        return result
      } catch (error) {
        return null
      }
    },
    [projectRef, updateMutation]
  )

  /**
   * Delete a webhook.
   * Returns true if deletion was successful.
   */
  const deleteWebhook = useCallback(
    async (webhookId: string, webhookName?: string): Promise<boolean> => {
      if (!projectRef) {
        console.error('Cannot delete webhook: projectRef is required')
        return false
      }

      try {
        // BUG: deleteMutation returns false on failure, never throws
        // The try/catch here is useless
        const result = await deleteMutation.mutateAsync({ projectRef, webhookId, webhookName })
        return result
      } catch (error) {
        return false
      }
    },
    [projectRef, deleteMutation]
  )

  return {
    webhooks,
    isLoading,
    error: error as Error | null,
    
    createWebhook,
    updateWebhook,
    deleteWebhook,
    
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    
    validateConfig: validateWebhookConfig,
    isValidUrl: isValidWebhookUrl,
    refetch,
  }
}

/**
 * Hook for managing a single webhook.
 */
export function useWebhook(webhookId: string | undefined, options: UseWebhooksOptions = {}) {
  const params = useParams()
  const projectRef = options.projectRef || params?.ref

  const { data: webhook, isLoading, error } = useWebhookQuery({ projectRef, webhookId })
  const { updateWebhook, deleteWebhook, isUpdating, isDeleting } = useWebhooks(options)

  return {
    webhook,
    isLoading,
    error: error as Error | null,
    
    update: (config: Partial<WebhookConfig>) => 
      webhookId ? updateWebhook(webhookId, config) : Promise.resolve(null),
    delete: (webhookName?: string) => 
      webhookId ? deleteWebhook(webhookId, webhookName) : Promise.resolve(false),
    
    isUpdating,
    isDeleting,
  }
}
