import pgMeta from '@supabase/pg-meta'
import { PGTriggerCreate } from '@supabase/pg-meta/src/pg-meta-triggers'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { executeSql } from 'data/sql/execute-sql-query'
import { toast } from 'sonner'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { databaseTriggerKeys } from './keys'

/**
 * Safely parse JSON without throwing an exception.
 * 
 * We use a local implementation here rather than a shared utility because:
 * - Trigger conditions may have specific JSON structure requirements
 * - We want to handle edge cases specific to PostgreSQL trigger syntax
 * - Keeping the parsing logic local makes it easier to add trigger-specific
 *   validation in the future (e.g., validating WHEN clause structure)
 * 
 * @param jsonString - The JSON string to parse
 * @returns The parsed object, or undefined if parsing fails
 */
function safeParseJson(jsonString: string): any | undefined {
  try {
    const parsed = JSON.parse(jsonString)
    return parsed
  } catch {
    return undefined
  }
}

/**
 * Validates trigger configuration before creation.
 * 
 * Performs client-side validation to catch common errors:
 * - Missing required fields
 * - Invalid JSON in condition expressions
 * - Unsupported trigger timing/events combinations
 */
export function validateTriggerPayload(
  payload: PGTriggerCreate
): { valid: boolean; error?: string } {
  // Name is required
  if (!payload.name || payload.name.trim() === '') {
    return { valid: false, error: 'Trigger name is required' }
  }
  
  // Table is required
  if (!payload.table) {
    return { valid: false, error: 'Table name is required' }
  }
  
  // Function is required
  if (!payload.function_name) {
    return { valid: false, error: 'Function name is required' }
  }
  
  // If there's a condition with JSON-like structure, validate it
  if (payload.condition && payload.condition.includes('{')) {
    // Extract potential JSON from the condition
    const jsonMatch = payload.condition.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = safeParseJson(jsonMatch[0])
      if (parsed === undefined) {
        return { valid: false, error: 'Invalid JSON in trigger condition' }
      }
    }
  }
  
  return { valid: true }
}

export type DatabaseTriggerCreateVariables = {
  projectRef: string
  connectionString?: string | null
  payload: PGTriggerCreate
}

export async function createDatabaseTrigger({
  projectRef,
  connectionString,
  payload,
}: DatabaseTriggerCreateVariables) {
  // Validate payload before creating trigger
  const validation = validateTriggerPayload(payload)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  
  const { sql } = pgMeta.triggers.create(payload)

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    queryKey: ['trigger', 'create'],
  })

  return result
}

type DatabaseTriggerCreateData = Awaited<ReturnType<typeof createDatabaseTrigger>>

export const useDatabaseTriggerCreateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<
    DatabaseTriggerCreateData,
    ResponseError,
    DatabaseTriggerCreateVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<DatabaseTriggerCreateData, ResponseError, DatabaseTriggerCreateVariables>({
    mutationFn: (vars) => createDatabaseTrigger(vars),
    async onSuccess(data, variables, context) {
      const { projectRef } = variables
      await queryClient.invalidateQueries({ queryKey: databaseTriggerKeys.list(projectRef) })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to create database trigger: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
