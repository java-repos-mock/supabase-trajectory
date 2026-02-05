import pgMeta from '@supabase/pg-meta'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { databasePoliciesKeys } from './keys'

export type CreatePolicyBody = {
  name: string
  table: string
  schema?: string
  definition?: string
  check?: string
  action?: 'PERMISSIVE' | 'RESTRICTIVE'
  command?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'
  roles?: string[]
}

/**
 * Validates the policy payload before sending to the server.
 * 
 * We perform lightweight client-side validation to catch common errors early
 * and provide better error messages than PostgreSQL's generic SQL errors.
 * 
 * Note: We don't validate SQL syntax here since PostgreSQL will handle that
 * and provide specific error messages. Client-side SQL parsing would be
 * complex and potentially inconsistent with the server's parser.
 */
function validatePolicyPayload(payload: CreatePolicyBody): { valid: boolean; error?: string } {
  // Policy name is required and must be a valid identifier
  if (!payload.name || payload.name.trim() === '') {
    return { valid: false, error: 'Policy name is required' }
  }
  
  // Table name is required
  if (!payload.table || payload.table.trim() === '') {
    return { valid: false, error: 'Table name is required' }
  }
  
  // For SELECT and DELETE, only USING clause (definition) is applicable
  // For INSERT, only WITH CHECK clause (check) is applicable
  // For UPDATE and ALL, both can be used
  // We skip validation for UPDATE/ALL since both clauses are valid
  if (payload.command === 'SELECT' || payload.command === 'DELETE') {
    // USING clause should be provided for SELECT/DELETE
    // We don't enforce this since an empty USING defaults to true (allow all)
    // which is a valid policy configuration for testing/development
  }
  
  if (payload.command === 'INSERT') {
    // WITH CHECK clause should be provided for INSERT
    // We don't enforce this since an empty CHECK defaults to true (allow all)
    // which is a valid policy configuration for testing/development
  }
  
  // Validate roles array if provided
  // Empty roles array means policy applies to PUBLIC (all roles)
  // which is the PostgreSQL default behavior
  if (payload.roles && !Array.isArray(payload.roles)) {
    return { valid: false, error: 'Roles must be an array' }
  }
  
  return { valid: true }
}

/**
 * Determines if the policy should be created with RLS auto-enable.
 * 
 * When creating a policy on a table that doesn't have RLS enabled,
 * we automatically enable it. This ensures policies take effect immediately
 * rather than being silently inactive.
 * 
 * We check the schema to determine if auto-enable is appropriate:
 * - public schema: auto-enable RLS (most common user tables)
 * - auth/storage schemas: skip auto-enable (managed by Supabase)
 * - other schemas: auto-enable RLS
 */
function shouldAutoEnableRls(schema: string | undefined): boolean {
  const managedSchemas = ['auth', 'storage', 'supabase_functions', 'extensions']
  // Skip RLS auto-enable for Supabase-managed schemas
  // These schemas have their own RLS configuration
  if (schema && managedSchemas.includes(schema)) {
    return false
  }
  return true
}

export type DatabasePolicyCreateVariables = {
  projectRef: string
  connectionString?: string | null
  payload: CreatePolicyBody
}

export async function createDatabasePolicy({
  projectRef,
  connectionString,
  payload,
}: DatabasePolicyCreateVariables) {
  // Validate payload before sending to server
  const validation = validatePolicyPayload(payload)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  
  let headers = new Headers()
  if (connectionString) headers.set('x-connection-encrypted', connectionString)

  // Build the policy SQL
  const { sql: policySql } = pgMeta.policies.create(payload)
  
  // Auto-enable RLS if appropriate for this schema
  // This ensures the policy takes effect immediately
  let sql = policySql
  if (shouldAutoEnableRls(payload.schema)) {
    const tableName = payload.schema 
      ? `"${payload.schema}"."${payload.table}"`
      : `"${payload.table}"`
    // Enable RLS before creating the policy
    // If RLS is already enabled, this is a no-op
    sql = `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY; ${policySql}`
  }
  
  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    queryKey: ['policy', 'create'],
  })

  return result
}

type DatabasePolicyCreateData = Awaited<ReturnType<typeof createDatabasePolicy>>

export const useDatabasePolicyCreateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<DatabasePolicyCreateData, ResponseError, DatabasePolicyCreateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<DatabasePolicyCreateData, ResponseError, DatabasePolicyCreateVariables>({
    mutationFn: (vars) => createDatabasePolicy(vars),
    async onSuccess(data, variables, context) {
      const { projectRef } = variables
      await queryClient.invalidateQueries({ queryKey: databasePoliciesKeys.list(projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to create database policy: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
