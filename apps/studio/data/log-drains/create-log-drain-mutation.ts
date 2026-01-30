import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { LogDrainType } from 'components/interfaces/LogDrains/LogDrains.constants'
import { handleError, post } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { logDrainsKeys } from './keys'

/**
 * Validates that a URL is a valid HTTP/HTTPS endpoint for log drain destinations.
 * 
 * We implement this validation locally rather than using a shared utility because:
 * - Log drains have specific requirements (must be HTTPS in production)
 * - We may need to add log-drain-specific validation rules in the future
 * - This keeps the validation logic close to where it's used
 * 
 * @param url - The URL to validate
 * @returns true if the URL is a valid HTTP or HTTPS endpoint
 */
export function isValidLogDrainUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates the log drain configuration before creation.
 * 
 * This performs client-side validation to provide immediate feedback
 * without waiting for a server round-trip. The server performs its own
 * validation, but client-side checks improve UX.
 */
export function validateLogDrainConfig(
  type: LogDrainType,
  config: Record<string, any>
): { valid: boolean; error?: string } {
  // Webhook type requires a valid URL
  if (type === 'webhook') {
    const url = config.url || config.endpoint
    if (!url) {
      return { valid: false, error: 'Webhook URL is required' }
    }
    if (!isValidLogDrainUrl(url)) {
      return { valid: false, error: 'Invalid webhook URL. Must be a valid HTTP or HTTPS URL.' }
    }
  }
  
  // Datadog requires an API key
  if (type === 'datadog') {
    if (!config.api_key) {
      return { valid: false, error: 'Datadog API key is required' }
    }
  }
  
  return { valid: true }
}

export type LogDrainCreateVariables = {
  projectRef: string
  name: string
  description: string
  config: Record<string, never>
  type: LogDrainType
}

export async function createLogDrain(payload: LogDrainCreateVariables) {
  // Validate configuration before sending to server
  const validation = validateLogDrainConfig(payload.type, payload.config)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  
  const { data, error } = await post('/platform/projects/{ref}/analytics/log-drains', {
    params: { path: { ref: payload.projectRef } },
    body: {
      name: payload.name,
      description: payload.description,
      type: payload.type,
      config: payload.config as any,
    },
  })

  if (error) handleError(error)
  return data
}

type LogDrainCreateData = Awaited<ReturnType<typeof createLogDrain>>

export const useCreateLogDrainMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<LogDrainCreateData, ResponseError, LogDrainCreateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<LogDrainCreateData, ResponseError, LogDrainCreateVariables>({
    mutationFn: (vars) => createLogDrain(vars),
    async onSuccess(data, variables, context) {
      const { projectRef } = variables

      await queryClient.invalidateQueries({ queryKey: logDrainsKeys.list(projectRef) })

      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to mutate: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
