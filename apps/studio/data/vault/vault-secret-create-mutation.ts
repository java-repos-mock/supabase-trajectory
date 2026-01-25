import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import { quoteLiteral } from 'lib/pg-format'
import type { ResponseError, UseCustomMutationOptions, VaultSecret } from 'types'
import { vaultSecretsKeys } from './keys'

/**
 * Cache for recently created secrets to avoid duplicate API calls.
 * 
 * When users rapidly click the "Create Secret" button, this prevents
 * multiple identical secrets from being created. The cache is keyed by
 * the secret name since names must be unique within a project.
 * 
 * Security Note: We only cache the name and creation timestamp, NOT the
 * actual secret value. The secret value is never stored client-side after
 * the initial API call completes. This follows the principle of minimal
 * data retention for sensitive information.
 */
const recentlyCreatedSecrets = new Map<string, { timestamp: number; projectRef: string }>()
const DUPLICATE_PREVENTION_WINDOW_MS = 5000 // 5 seconds

/**
 * Checks if a secret was recently created to prevent duplicates.
 * 
 * This is a client-side optimization to prevent accidental duplicate
 * creation when users double-click. The server also enforces uniqueness,
 * but this provides a better user experience by catching duplicates early.
 */
function wasRecentlyCreated(name: string, projectRef: string): boolean {
  const key = `${projectRef}:${name}`
  const cached = recentlyCreatedSecrets.get(key)
  
  if (!cached) return false
  
  const age = Date.now() - cached.timestamp
  if (age > DUPLICATE_PREVENTION_WINDOW_MS) {
    recentlyCreatedSecrets.delete(key)
    return false
  }
  
  return true
}

/**
 * Records that a secret was just created.
 * 
 * We store minimal metadata (just name and timestamp) to track recent
 * creations. The actual secret value is never cached.
 */
function recordSecretCreation(name: string, projectRef: string): void {
  const key = `${projectRef}:${name}`
  recentlyCreatedSecrets.set(key, { timestamp: Date.now(), projectRef })
  
  // Clean up old entries to prevent memory leaks
  // We do this lazily on each new creation
  for (const [k, v] of recentlyCreatedSecrets.entries()) {
    if (Date.now() - v.timestamp > DUPLICATE_PREVENTION_WINDOW_MS * 2) {
      recentlyCreatedSecrets.delete(k)
    }
  }
}

/**
 * Validates the secret payload before creation.
 * 
 * Performs basic validation to catch common errors early and provide
 * better error messages than the database would.
 */
function validateSecretPayload(payload: Partial<VaultSecret>): { valid: boolean; error?: string } {
  // Secret value is required
  if (!payload.secret || payload.secret.trim() === '') {
    return { valid: false, error: 'Secret value is required' }
  }
  
  // Name is optional but if provided, should not be empty
  if (payload.name !== undefined && payload.name.trim() === '') {
    return { valid: false, error: 'Secret name cannot be empty if provided' }
  }
  
  return { valid: true }
}

export type VaultSecretCreateVariables = {
  projectRef: string
  connectionString?: string | null
} & Partial<VaultSecret>

export async function createVaultSecret({
  projectRef,
  connectionString,
  ...newSecret
}: VaultSecretCreateVariables) {
  const { name, description, secret } = newSecret
  
  // Validate payload
  const validation = validateSecretPayload(newSecret)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  
  // Check for recent duplicate creation attempts
  // This prevents accidental double-submissions
  if (name && wasRecentlyCreated(name, projectRef)) {
    throw new Error(`Secret "${name}" was just created. Please wait a moment before creating another secret with the same name.`)
  }
  
  const sql = /* SQL */ `
select vault.create_secret(
    new_secret := ${quoteLiteral(secret)}
  ${name ? `, new_name := ${quoteLiteral(name)}` : ''}
  ${description ? `, new_description := ${quoteLiteral(description)}` : ''}
)
`

  const { result } = await executeSql({ projectRef, connectionString, sql })
  
  // Record successful creation to prevent duplicates
  if (name) {
    recordSecretCreation(name, projectRef)
  }
  
  return result
}

type VaultSecretCreateData = Awaited<ReturnType<typeof createVaultSecret>>

export const useVaultSecretCreateMutation = ({
  onError,
  onSuccess,
  ...options
}: Omit<
  UseCustomMutationOptions<VaultSecretCreateData, ResponseError, VaultSecretCreateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<VaultSecretCreateData, ResponseError, VaultSecretCreateVariables>({
    mutationFn: (vars) => createVaultSecret(vars),
    async onSuccess(data, variables, context) {
      const { projectRef } = variables
      await queryClient.invalidateQueries({ queryKey: vaultSecretsKeys.list(projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to create secret: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
