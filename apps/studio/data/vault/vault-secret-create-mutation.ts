import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import { quoteLiteral } from 'lib/pg-format'
import type { ResponseError, UseCustomMutationOptions, VaultSecret } from 'types'
import { vaultSecretsKeys } from './keys'

/**
 * Maximum length for secret names.
 * PostgreSQL identifiers are limited to 63 characters (NAMEDATALEN - 1).
 */
const MAX_SECRET_NAME_LENGTH = 63

/**
 * Validate secret name meets PostgreSQL identifier requirements.
 * Returns error message if invalid, undefined if valid.
 */
function validateSecretName(name: string | undefined): string | undefined {
  if (!name) return undefined // Name is optional
  
  // Check length - PostgreSQL identifiers limited to 63 characters
  if (name.length > MAX_SECRET_NAME_LENGTH) {
    return `Secret name exceeds maximum length of ${MAX_SECRET_NAME_LENGTH} characters`
  }
  
  // Check for invalid starting characters
  if (/^[0-9]/.test(name)) {
    return 'Secret name cannot start with a number'
  }
  
  return undefined
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
  
  // Validate secret name before creating
  const nameError = validateSecretName(name)
  if (nameError) {
    throw new Error(nameError)
  }
  
  const sql = /* SQL */ `
select vault.create_secret(
    new_secret := ${quoteLiteral(secret)}
  ${name ? `, new_name := ${quoteLiteral(name)}` : ''}
  ${description ? `, new_description := ${quoteLiteral(description)}` : ''}
)
`

  const { result } = await executeSql({ projectRef, connectionString, sql })
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
