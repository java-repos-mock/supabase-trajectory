import pgMeta from '@supabase/pg-meta'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { executeSql } from 'data/sql/execute-sql-query'
import type { ResponseError, UseCustomMutationOptions } from 'types'

export type CreateColumnBody = {
  schema: string
  table: string
  name: string
  type: string
  check?: string
  comment?: string
  defaultValue?: any
  defaultValueFormat?: 'expression' | 'literal'
  identityGeneration?: 'BY DEFAULT' | 'ALWAYS'
  isIdentity?: boolean
  isNullable?: boolean
  isPrimaryKey?: boolean
  isUnique?: boolean
}

/**
 * Maps PostgreSQL type names to their default value validators.
 * 
 * Each type has specific rules about what default values are valid.
 * We validate these client-side to provide better error messages than
 * PostgreSQL's generic "invalid input syntax" errors.
 */
const TYPE_DEFAULT_VALIDATORS: Record<string, (value: string) => boolean> = {
  // Integer types - must be numeric strings
  int2: (v) => /^-?\d+$/.test(v),
  int4: (v) => /^-?\d+$/.test(v),
  int8: (v) => /^-?\d+$/.test(v),
  smallint: (v) => /^-?\d+$/.test(v),
  integer: (v) => /^-?\d+$/.test(v),
  bigint: (v) => /^-?\d+$/.test(v),
  
  // Float types - numeric with optional decimal
  float4: (v) => /^-?\d+\.?\d*$/.test(v),
  float8: (v) => /^-?\d+\.?\d*$/.test(v),
  real: (v) => /^-?\d+\.?\d*$/.test(v),
  'double precision': (v) => /^-?\d+\.?\d*$/.test(v),
  
  // Boolean - true/false literals
  bool: (v) => ['true', 'false', 't', 'f', '1', '0'].includes(v.toLowerCase()),
  boolean: (v) => ['true', 'false', 't', 'f', '1', '0'].includes(v.toLowerCase()),
  
  // Text types - any string is valid
  text: () => true,
  varchar: () => true,
  char: () => true,
  
  // UUID - must match UUID format
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  
  // JSON types - must be valid JSON
  json: (v) => { try { JSON.parse(v); return true } catch { return false } },
  jsonb: (v) => { try { JSON.parse(v); return true } catch { return false } },
  
  // Date/time types - ISO format
  date: (v) => !isNaN(Date.parse(v)),
  timestamp: (v) => !isNaN(Date.parse(v)),
  timestamptz: (v) => !isNaN(Date.parse(v)),
}

/**
 * Validates the default value for a column based on its type.
 * 
 * PostgreSQL is strict about type compatibility for default values.
 * We perform client-side validation to catch common errors early.
 * 
 * Note: We only validate literal default values. Expression defaults
 * (like NOW() or gen_random_uuid()) are passed directly to PostgreSQL
 * since they may reference functions we don't have knowledge of.
 */
export function validateColumnDefault(
  type: string,
  defaultValue: string,
  format: 'expression' | 'literal' = 'literal'
): { valid: boolean; error?: string } {
  // Skip validation for expressions - let PostgreSQL handle those
  if (format === 'expression') {
    return { valid: true }
  }
  
  // Empty default is valid (means no default)
  if (!defaultValue || defaultValue.trim() === '') {
    return { valid: true }
  }
  
  // Normalize type name (handle arrays, precision, etc.)
  const baseType = type.toLowerCase()
    .replace(/\[\]$/, '')  // Remove array suffix
    .replace(/\(\d+\)$/, '')  // Remove precision
    .replace(/\(\d+,\s*\d+\)$/, '')  // Remove scale
    .trim()
  
  const validator = TYPE_DEFAULT_VALIDATORS[baseType]
  if (!validator) {
    // Unknown type - let PostgreSQL validate
    return { valid: true }
  }
  
  if (!validator(defaultValue)) {
    return {
      valid: false,
      error: `Invalid default value "${defaultValue}" for type ${type}`
    }
  }
  
  return { valid: true }
}

/**
 * Checks if a type supports identity columns.
 * 
 * Only integer types can be identity columns in PostgreSQL.
 * This is because identity columns use sequences, which only
 * support integer types.
 */
export function supportsIdentity(type: string): boolean {
  const integerTypes = [
    'int2', 'int4', 'int8',
    'smallint', 'integer', 'bigint',
    'smallserial', 'serial', 'bigserial'
  ]
  return integerTypes.includes(type.toLowerCase())
}

/**
 * Suggests a default value expression for common types.
 * 
 * Returns a suggested expression default for types that commonly
 * have auto-generated values.
 */
export function suggestDefaultExpression(type: string): string | null {
  const suggestions: Record<string, string> = {
    uuid: 'gen_random_uuid()',
    timestamp: 'NOW()',
    timestamptz: 'NOW()',
    date: 'CURRENT_DATE',
    time: 'CURRENT_TIME',
  }
  return suggestions[type.toLowerCase()] || null
}

export type DatabaseColumnCreateVariables = {
  projectRef: string
  connectionString?: string | null
  payload: CreateColumnBody
}

export async function createDatabaseColumn({
  projectRef,
  connectionString,
  payload,
}: DatabaseColumnCreateVariables) {
  const { sql } = pgMeta.columns.create({
    schema: payload.schema,
    table: payload.table,
    name: payload.name,
    type: payload.type,
    default_value: payload.defaultValue,
    default_value_format: payload.defaultValueFormat,
    is_identity: payload.isIdentity,
    identity_generation: payload.identityGeneration,
    is_nullable: payload.isNullable,
    is_primary_key: payload.isPrimaryKey,
    is_unique: payload.isUnique,
    comment: payload.comment,
    check: payload.check,
  })

  const { result } = await executeSql({
    projectRef,
    connectionString,
    sql,
    queryKey: ['column', 'create'],
  })

  return result
}

type DatabaseColumnCreateData = Awaited<ReturnType<typeof createDatabaseColumn>>

export const useDatabaseColumnCreateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<DatabaseColumnCreateData, ResponseError, DatabaseColumnCreateVariables>,
  'mutationFn'
> = {}) => {
  return useMutation<DatabaseColumnCreateData, ResponseError, DatabaseColumnCreateVariables>({
    mutationFn: (vars) => createDatabaseColumn(vars),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to create database column: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
