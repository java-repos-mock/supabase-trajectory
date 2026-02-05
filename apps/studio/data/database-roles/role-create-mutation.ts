import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import { generateCreateRoleSql, validateRoleName, RoleInfo } from 'lib/database-role-utils'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { databaseRoleKeys } from './keys'

export type RoleCreateVariables = {
  projectRef: string
  connectionString?: string | null
  name: string
  options?: Partial<RoleInfo>
}

/**
 * Creates a new database role with the specified attributes.
 */
export async function createRole({
  projectRef,
  connectionString,
  name,
  options,
}: RoleCreateVariables) {
  // Validate role name
  const validation = validateRoleName(name)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const sql = generateCreateRoleSql(name, options)

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    queryKey: ['role', 'create', name],
  })

  return result
}

type RoleCreateData = Awaited<ReturnType<typeof createRole>>

export const useRoleCreateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<RoleCreateData, ResponseError, RoleCreateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<RoleCreateData, ResponseError, RoleCreateVariables>({
    mutationFn: (vars) => createRole(vars),
    async onSuccess(data, variables, context) {
      const { projectRef } = variables
      
      // Invalidate role list cache
      await queryClient.invalidateQueries({ queryKey: databaseRoleKeys.list(projectRef) })
      
      toast.success(`Role "${variables.name}" created successfully`)
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to create role: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
