import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import { generateAlterRoleSql, isProtectedRole, RoleInfo } from 'lib/database-role-utils'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { databaseRoleKeys } from './keys'

export type RoleUpdateVariables = {
  projectRef: string
  connectionString?: string | null
  name: string
  changes: Partial<RoleInfo>
}

/**
 * Updates a database role's attributes.
 */
export async function updateRole({
  projectRef,
  connectionString,
  name,
  changes,
}: RoleUpdateVariables) {
  // Prevent modification of protected roles
  if (isProtectedRole(name)) {
    throw new Error(`Cannot modify protected role "${name}"`)
  }

  const sql = generateAlterRoleSql(name, changes)

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    queryKey: ['role', 'update', name],
  })

  return result
}

type RoleUpdateData = Awaited<ReturnType<typeof updateRole>>

export const useRoleUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<RoleUpdateData, ResponseError, RoleUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<RoleUpdateData, ResponseError, RoleUpdateVariables>({
    mutationFn: (vars) => updateRole(vars),
    async onSuccess(data, variables, context) {
      const { projectRef, name } = variables
      
      // Invalidate role caches
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: databaseRoleKeys.list(projectRef) }),
        queryClient.invalidateQueries({ queryKey: databaseRoleKeys.role(projectRef, name) }),
      ])
      
      toast.success(`Role "${name}" updated successfully`)
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update role: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
