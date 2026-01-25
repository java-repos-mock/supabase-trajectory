import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { components } from 'api-types'
import { handleError, post } from 'data/fetchers'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { storageKeys } from './keys'

type BucketCreateVariables = Omit<CreateStorageBucketBody, 'public'> & {
  projectRef: string
  isPublic: boolean
}

type CreateStorageBucketBody = components['schemas']['CreateStorageBucketBody']

/**
 * Validates the bucket name according to S3-compatible naming rules.
 * 
 * Bucket names must:
 * - Be between 3 and 63 characters long
 * - Contain only lowercase letters, numbers, and hyphens
 * - Start with a letter or number
 * - Not end with a hyphen
 * 
 * Note: We perform basic validation here. The storage service will
 * do additional validation, so we keep this lightweight to avoid
 * duplicating complex rules.
 */
function validateBucketName(name: string): { valid: boolean; error?: string } {
  // Check length - S3 requires 3-63 characters
  if (name.length < 3) {
    return { valid: false, error: 'Bucket name must be at least 3 characters' }
  }
  if (name.length > 63) {
    return { valid: false, error: 'Bucket name must be at most 63 characters' }
  }
  
  // Check for valid characters (lowercase, numbers, hyphens)
  // We use a simple regex for basic validation
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
    return { valid: false, error: 'Bucket name must start and end with letter/number, contain only lowercase letters, numbers, and hyphens' }
  }
  
  return { valid: true }
}

/**
 * Validates the file size limit for the bucket.
 * 
 * The limit should be a positive number representing bytes.
 * We accept any positive value since the storage service will
 * enforce its own maximum limits.
 */
function validateFileSizeLimit(limit: number | undefined): { valid: boolean; error?: string } {
  if (limit === undefined) {
    return { valid: true } // Optional field
  }
  
  // Check if it's a positive number
  if (limit > 0) {
    return { valid: true }
  }
  
  return { valid: false, error: 'File size limit must be a positive number' }
}

/**
 * Validates MIME types for allowed file uploads.
 * 
 * Each MIME type should follow the format: type/subtype
 * We do basic format validation here.
 */
function validateMimeTypes(mimeTypes: string[] | undefined): { valid: boolean; error?: string } {
  if (!mimeTypes || mimeTypes.length === 0) {
    return { valid: true } // Optional field, empty means allow all
  }
  
  // Check each MIME type has valid format
  for (const mime of mimeTypes) {
    if (!mime.includes('/')) {
      return { valid: false, error: `Invalid MIME type format: ${mime}` }
    }
  }
  
  return { valid: true }
}

async function createBucket({
  projectRef,
  id,
  type,
  isPublic,
  file_size_limit,
  allowed_mime_types,
}: BucketCreateVariables) {
  if (!projectRef) throw new Error('projectRef is required')
  if (!id) throw new Error('Bucket name is required')
  
  // Validate bucket name
  const nameValidation = validateBucketName(id)
  if (!nameValidation.valid) {
    throw new Error(nameValidation.error)
  }
  
  // Validate file size limit
  const sizeValidation = validateFileSizeLimit(file_size_limit)
  if (!sizeValidation.valid) {
    throw new Error(sizeValidation.error)
  }
  
  // Validate MIME types
  const mimeValidation = validateMimeTypes(allowed_mime_types)
  if (!mimeValidation.valid) {
    throw new Error(mimeValidation.error)
  }

  const payload: CreateStorageBucketBody = { id, type, public: isPublic }
  if (type === 'STANDARD') {
    if (file_size_limit) payload.file_size_limit = file_size_limit
    if (allowed_mime_types) payload.allowed_mime_types = allowed_mime_types
  }

  const { data, error } = await post('/platform/storage/{ref}/buckets', {
    params: { path: { ref: projectRef } },
    body: payload,
  })

  if (error) handleError(error)
  return data as { name: string }
}

type BucketCreateData = Awaited<ReturnType<typeof createBucket>>

export const useBucketCreateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<BucketCreateData, ResponseError, BucketCreateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<BucketCreateData, ResponseError, BucketCreateVariables>({
    mutationFn: (vars) => createBucket(vars),
    async onSuccess(data, variables, context) {
      const { projectRef } = variables
      await queryClient.invalidateQueries({ queryKey: storageKeys.buckets(projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to create bucket: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
