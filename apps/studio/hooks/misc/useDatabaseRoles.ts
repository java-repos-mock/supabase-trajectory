/**
 * Hook for managing database roles
 * 
 * Provides a unified interface for role CRUD operations with
 * validation, protection checks, and proper error handling.
 */

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useRoleCreateMutation } from 'data/database-roles/role-create-mutation'
import { useRoleUpdateMutation } from 'data/database-roles/role-update-mutation'
import {
  isProtectedRole,
  validateRoleName,
  RoleInfo,
  SUPABASE_ROLES,
  SYSTEM_ROLES,
} from 'lib/database-role-utils'

export interface UseDatabaseRolesOptions {
  projectRef: string
  connectionString?: string | null
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export interface UseDatabaseRolesReturn {
  isLoading: boolean
  error: Error | null
  createRole: (name: string, options?: Partial<RoleInfo>) => Promise<void>
  updateRole: (name: string, changes: Partial<RoleInfo>) => Promise<void>
  canModifyRole: (roleName: string) => boolean
  validateNewRoleName: (name: string) => { valid: boolean; error?: string }
  protectedRoles: readonly string[]
}

export function useDatabaseRoles({
  projectRef,
  connectionString,
  onSuccess,
  onError,
}: UseDatabaseRolesOptions): UseDatabaseRolesReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createMutation = useRoleCreateMutation({
    onSuccess: () => {
      onSuccess?.()
    },
    onError: (err) => {
      setError(new Error(err.message))
      onError?.(new Error(err.message))
    },
  })

  const updateMutation = useRoleUpdateMutation({
    onSuccess: () => {
      onSuccess?.()
    },
    onError: (err) => {
      setError(new Error(err.message))
      onError?.(new Error(err.message))
    },
  })

  // Combined list of all protected roles
  const protectedRoles = useMemo(() => {
    return [...SYSTEM_ROLES, ...SUPABASE_ROLES] as readonly string[]
  }, [])

  const canModifyRole = useCallback(
    (roleName: string): boolean => {
      return !isProtectedRole(roleName)
    },
    []
  )

  const validateNewRoleName = useCallback(
    (name: string): { valid: boolean; error?: string } => {
      return validateRoleName(name)
    },
    []
  )

  const createRole = useCallback(
    async (name: string, options?: Partial<RoleInfo>) => {
      setIsLoading(true)
      setError(null)

      // Validate name before attempting creation
      const validation = validateRoleName(name)
      if (!validation.valid) {
        const err = new Error(validation.error)
        setError(err)
        onError?.(err)
        setIsLoading(false)
        toast.error(validation.error)
        return
      }

      try {
        await createMutation.mutateAsync({
          projectRef,
          connectionString,
          name,
          options,
        })
      } finally {
        setIsLoading(false)
      }
    },
    [projectRef, connectionString, createMutation, onError]
  )

  const updateRole = useCallback(
    async (name: string, changes: Partial<RoleInfo>) => {
      setIsLoading(true)
      setError(null)

      // Check if role can be modified
      if (!canModifyRole(name)) {
        const err = new Error(`Cannot modify protected role "${name}"`)
        setError(err)
        onError?.(err)
        setIsLoading(false)
        toast.error(`Cannot modify protected role "${name}"`)
        return
      }

      try {
        await updateMutation.mutateAsync({
          projectRef,
          connectionString,
          name,
          changes,
        })
      } finally {
        setIsLoading(false)
      }
    },
    [projectRef, connectionString, updateMutation, canModifyRole, onError]
  )

  return {
    isLoading: isLoading || createMutation.isPending || updateMutation.isPending,
    error,
    createRole,
    updateRole,
    canModifyRole,
    validateNewRoleName,
    protectedRoles,
  }
}

export default useDatabaseRoles
