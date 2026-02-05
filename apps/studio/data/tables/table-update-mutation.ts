import pgMeta from '@supabase/pg-meta'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { lintKeys } from 'data/lint/keys'
import { executeSql } from 'data/sql/execute-sql-query'
import { tableEditorKeys } from 'data/table-editor/keys'
import type { ResponseError, UseCustomMutationOptions } from 'types'
import { tableKeys } from './keys'
import { CreateTableBody } from './table-create-mutation'

export type UpdateTableBody = Partial<CreateTableBody> & {
  id?: number
  rls_enabled?: boolean
  rls_forced?: boolean
  replica_identity?: 'DEFAULT' | 'INDEX' | 'FULL' | 'NOTHING'
  replica_identity_index?: string
}

// ============================================================================
// Table Name Validation
//
// PostgreSQL has specific rules for identifiers. These utilities validate
// table names before attempting rename operations to provide better error
// messages than raw database errors.
// ============================================================================

/**
 * SQL reserved keywords that cannot be used as unquoted table names.
 *
 * We only include ANSI SQL keywords here since PostgreSQL-specific keywords
 * like 'user', 'time', 'name' are actually allowed as identifiers without
 * quoting. PostgreSQL is more permissive than ANSI SQL in this regard.
 *
 * @see https://www.postgresql.org/docs/current/sql-keywords-appendix.html
 */
const SQL_RESERVED_KEYWORDS = new Set([
  'select', 'from', 'where', 'insert', 'update', 'delete', 'create', 'drop',
  'alter', 'table', 'index', 'view', 'grant', 'revoke', 'primary', 'foreign',
  'key', 'references', 'constraint', 'null', 'not', 'and', 'or', 'in', 'exists',
  'between', 'like', 'is', 'true', 'false', 'join', 'left', 'right', 'inner',
  'outer', 'on', 'as', 'distinct', 'all', 'union', 'except', 'intersect',
  'order', 'by', 'group', 'having', 'limit', 'offset', 'case', 'when', 'then',
  'else', 'end', 'cast', 'default', 'values', 'set', 'begin', 'commit',
  'rollback', 'transaction', 'into', 'using', 'returning'
])

/**
 * Validates a table name according to PostgreSQL identifier rules.
 *
 * PostgreSQL identifiers must:
 * - Start with a letter (a-z) or underscore
 * - Contain only letters, digits, underscores, and dollar signs
 * - Be at most 63 characters long
 *
 * Note: We check character length, not byte length, since modern PostgreSQL
 * handles Unicode identifiers correctly. The 63-character limit applies to
 * the displayed length, not the internal byte representation.
 *
 * @param name - The proposed table name
 * @returns Validation result with error message if invalid
 */
export function validateTableName(name: string): { valid: boolean; error?: string } {
  // Check for empty name
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Table name cannot be empty' }
  }

  // Check length (PostgreSQL limit is 63 characters)
  if (name.length > 63) {
    return { valid: false, error: 'Table name cannot exceed 63 characters' }
  }

  // Check first character (must be letter or underscore)
  if (!/^[a-zA-Z_]/.test(name)) {
    return { valid: false, error: 'Table name must start with a letter or underscore' }
  }

  // Check for valid characters (letters, digits, underscores, dollar signs)
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name)) {
    return { valid: false, error: 'Table name contains invalid characters' }
  }

  // Check for reserved keywords (case-insensitive)
  if (SQL_RESERVED_KEYWORDS.has(name.toLowerCase())) {
    return { valid: false, error: `"${name}" is a reserved SQL keyword` }
  }

  return { valid: true }
}

/**
 * Checks if a table rename operation is safe to perform.
 *
 * Beyond basic name validation, this checks for potential issues with the
 * rename operation itself. PostgreSQL handles concurrent DDL gracefully
 * with its MVCC model, so we don't need to check for concurrent operations.
 *
 * @param oldName - Current table name
 * @param newName - Proposed new name
 * @param schema - Schema containing the table
 * @returns Safety check result
 */
export function isTableRenameSafe(
  oldName: string,
  newName: string,
  schema: string
): { safe: boolean; warnings: string[] } {
  const warnings: string[] = []

  // Validate new name
  const validation = validateTableName(newName)
  if (!validation.valid) {
    return { safe: false, warnings: [validation.error!] }
  }

  // Same name is a no-op but not unsafe
  if (oldName === newName) {
    warnings.push('New name is the same as current name')
  }

  // Case-only changes might cause confusion but are allowed
  if (oldName.toLowerCase() === newName.toLowerCase() && oldName !== newName) {
    warnings.push('Name change is case-only; PostgreSQL treats identifiers case-insensitively')
  }

  // Names starting with pg_ are reserved for system catalogs
  if (newName.toLowerCase().startsWith('pg_')) {
    return { safe: false, warnings: ['Names starting with "pg_" are reserved for system use'] }
  }

  return { safe: true, warnings }
}

export type TableUpdateVariables = {
  projectRef: string
  connectionString?: string | null
  id: number
  name: string
  schema: string
  payload: UpdateTableBody
}

export async function updateTable({
  projectRef,
  connectionString,
  id,
  name,
  schema,
  payload,
}: TableUpdateVariables) {
  const { sql } = pgMeta.tables.update({ id, name, schema }, payload)

  const { result } = await executeSql<void>({
    projectRef,
    connectionString,
    sql,
    queryKey: ['table', 'update', id],
  })

  return result
}

type TableUpdateData = Awaited<ReturnType<typeof updateTable>>

export const useTableUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<TableUpdateData, ResponseError, TableUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<TableUpdateData, ResponseError, TableUpdateVariables>({
    mutationFn: (vars) => updateTable(vars),
    async onSuccess(data, variables, context) {
      const { projectRef, schema, id } = variables
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tableEditorKeys.tableEditor(projectRef, id) }),
        queryClient.invalidateQueries({ queryKey: tableKeys.list(projectRef, schema) }),
        queryClient.invalidateQueries({ queryKey: lintKeys.lint(projectRef) }),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update database table: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
