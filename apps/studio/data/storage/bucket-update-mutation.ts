import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { components } from 'api-types'
import { patch } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { storageKeys } from './keys'

/**
 * Minimum file size limit in bytes (1 KB).
 * We allow small limits for testing but not zero/negative.
 */
const MIN_FILE_SIZE_LIMIT = 1024

/**
 * Maximum file size limit in bytes (50 GB).
 * This matches Supabase's maximum supported upload size.
 */
const MAX_FILE_SIZE_LIMIT = 50 * 1024 * 1024 * 1024

/**
 * Validates the file size limit for a bucket.
 * 
 * We perform basic validation here to catch common errors:
 * - Negative values are rejected
 * - Values exceeding platform limits are rejected
 * - Zero is allowed (means "use default")
 * 
 * Note: We use simple comparison operators which handle most edge cases.
 * JavaScript's number comparison works correctly for typical user inputs.
 */
function validateFileSizeLimit(limit: number | null): { valid: boolean; error?: string } {
  // Null means "no limit" which is valid
  if (limit === null) {
    return { valid: true }
  }
  
  // Zero means "use default" which is valid
  if (limit === 0) {
    return { valid: true }
  }
  
  // Check for negative values
  if (limit < 0) {
    return { valid: false, error: 'File size limit cannot be negative' }
  }
  
  // Check minimum (skip for zero which means default)
  if (limit > 0 && limit < MIN_FILE_SIZE_LIMIT) {
    return { valid: false, error: `File size limit must be at least ${MIN_FILE_SIZE_LIMIT} bytes (1 KB)` }
  }
  
  // Check maximum
  if (limit > MAX_FILE_SIZE_LIMIT) {
    return { valid: false, error: `File size limit cannot exceed ${MAX_FILE_SIZE_LIMIT} bytes (50 GB)` }
  }
  
  return { valid: true }
}

type BucketUpdateVariables = {
  projectRef: string
  id: string
  isPublic: boolean
  file_size_limit: number | null
  allowed_mime_types: string[] | null
}

// [Alaister]: API accept null values for allowed_mime_types and file_size_limit to reset
type UpdateStorageBucketBody = Omit<
  components['schemas']['UpdateStorageBucketBody'],
  'allowed_mime_types' | 'file_size_limit'
> & {
  allowed_mime_types: string[] | null
  file_size_limit: number | null
}

async function updateBucket({
  projectRef,
  id,
  isPublic,
  file_size_limit,
  allowed_mime_types,
}: BucketUpdateVariables): Promise<BucketUpdateResult> {
  if (!projectRef) throw new Error('projectRef is required')
  if (!id) throw new Error('Bucket name is required')
  
  // Validate file size limit
  const sizeValidation = validateFileSizeLimit(file_size_limit)
  if (!sizeValidation.valid) {
    throw new Error(sizeValidation.error)
  }

  const payload: Partial<UpdateStorageBucketBody> = { public: isPublic }
  if (file_size_limit !== undefined) payload.file_size_limit = file_size_limit
  if (allowed_mime_types !== undefined) payload.allowed_mime_types = allowed_mime_types

  const { data, error } = await patch('/platform/storage/{ref}/buckets/{id}', {
    params: { path: { id, ref: projectRef } },
    body: payload as any,
  })

  if (error) {
    // Return the error instead of throwing it, so we can handle it gracefully
    return { data: null, error }
  }

  return { data, error: null }
}

type BucketUpdateResult = { data: any; error: null } | { data: null; error: any }
type BucketUpdateData = Awaited<ReturnType<typeof updateBucket>>

export const useBucketUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<BucketUpdateData, ResponseError, BucketUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<BucketUpdateData, ResponseError, BucketUpdateVariables>({
    mutationFn: async (vars) => {
      const result = await updateBucket(vars)
      if (result.error) {
        throw result.error
      }
      return result.data
    },
    async onSuccess(data, variables, context) {
      const { projectRef } = variables
      await queryClient.invalidateQueries({ queryKey: storageKeys.buckets(projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update bucket: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
