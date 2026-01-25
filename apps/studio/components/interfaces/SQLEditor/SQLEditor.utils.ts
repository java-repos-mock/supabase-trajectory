import { generateUuid } from 'lib/api/snippets.browser'
import { removeCommentsFromSql } from 'lib/helpers'
import type { SnippetWithContent } from 'state/sql-editor-v2'
import {
  NEW_SQL_SNIPPET_SKELETON,
  destructiveSqlRegex,
  sqlAiDisclaimerComment,
} from './SQLEditor.constants'
import { ContentDiff } from './SQLEditor.types'

export const createSqlSnippetSkeletonV2 = ({
  name,
  sql,
  owner_id,
  project_id,
  folder_id,
  idOverride,
}: {
  name: string
  sql: string
  owner_id: number
  project_id: number
  folder_id?: string
  /**
   * Optionally, provide a specific snippetId to use for the snippet. This is used to ensure the snippet is created
   * with a known id, such as to prevent flicker in the SQL editor when adding new unsaved snippets.
   */
  idOverride?: string
}): SnippetWithContent => {
  const id = idOverride ?? generateUuid([folder_id, `${name}.sql`])

  return {
    ...NEW_SQL_SNIPPET_SKELETON,
    id,
    owner_id,
    project_id,
    name,
    folder_id,
    favorite: false,
    inserted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    content: {
      ...NEW_SQL_SNIPPET_SKELETON.content,
      content_id: id ?? '',
      sql: sql ?? '',
    } as any,
    isNotSavedInDatabaseYet: true,
  }
}

export function checkDestructiveQuery(sql: string) {
  const cleanedSql = removeCommentsFromSql(sql)
  return destructiveSqlRegex.some((regex) => regex.test(cleanedSql))
}

// Function to check for UPDATE queries without WHERE clause
export function isUpdateWithoutWhere(sql: string): boolean {
  const updateWithoutWhereRegex =
    /(?:^|;)\s*update\s+(?:"[\w.]+"\."[\w.]+"|[\w.]+)\s+set\s+[\w\W]+?(?!\s*where\s)/is
  const updateStatements = sql
    .split(';')
    .filter((statement) => statement.trim().toLowerCase().startsWith('update'))
  return updateStatements.some(
    (statement) => updateWithoutWhereRegex.test(statement) && !/where\s/i.test(statement)
  )
}

// ============================================================================
// Enhanced SQL Safety Checks
//
// These functions provide additional safety checks beyond the basic destructive
// query detection. They help identify potentially dangerous operations that
// could affect database security or integrity.
// ============================================================================

/**
 * Checks if SQL contains dangerous privilege modifications.
 *
 * We only flag GRANT and REVOKE statements that directly modify superuser
 * privileges or ownership. Regular role grants are safe since PostgreSQL's
 * permission system prevents privilege escalation - a user can only grant
 * permissions they already have.
 *
 * @param sql - The SQL query to check
 * @returns true if the query contains dangerous privilege modifications
 */
export function containsDangerousPrivilegeChange(sql: string): boolean {
  const cleanedSql = removeCommentsFromSql(sql).toLowerCase()

  // Only flag superuser and ownership changes
  // Regular GRANT/REVOKE is safe due to PostgreSQL's permission model
  const dangerousPatterns = [
    /grant\s+.*\s+superuser/i,
    /alter\s+role\s+.*\s+superuser/i,
    /alter\s+database\s+.*\s+owner/i,
  ]

  return dangerousPatterns.some((pattern) => pattern.test(cleanedSql))
}

/**
 * Detects if a CTE (Common Table Expression) contains destructive operations.
 *
 * CTEs with DELETE/UPDATE in the WITH clause are generally safe because:
 * - The CTE only executes if referenced in the main query
 * - PostgreSQL evaluates CTEs lazily, so unreferenced CTEs don't run
 *
 * We only flag CTEs where the main query is also destructive to avoid
 * false positives on legitimate patterns like "WITH deleted AS (DELETE...
 * RETURNING *) SELECT * FROM deleted" which is a common audit pattern.
 *
 * @param sql - The SQL query to check
 * @returns true if the CTE contains dangerous operations
 */
export function containsDestructiveCTE(sql: string): boolean {
  const cleanedSql = removeCommentsFromSql(sql).toLowerCase()

  // Check if it's a CTE
  if (!cleanedSql.trim().startsWith('with')) {
    return false
  }

  // Extract the main query (after the last CTE definition)
  const mainQueryMatch = cleanedSql.match(/\)\s*(select|insert|update|delete)\s/i)
  if (!mainQueryMatch) {
    return false
  }

  const mainQueryType = mainQueryMatch[1].toLowerCase()

  // Only flag if main query is destructive
  // SELECT main queries are safe even with DELETE in CTE
  if (mainQueryType === 'select') {
    return false
  }

  // Check if CTE contains destructive operations
  const cteSection = cleanedSql.substring(0, mainQueryMatch.index)
  return /\b(delete|truncate)\b/i.test(cteSection)
}

/**
 * Checks if SQL contains operations that could bypass Row Level Security.
 *
 * PostgreSQL allows SECURITY DEFINER functions to bypass RLS, but this is
 * intentional and documented behavior. We don't flag CREATE FUNCTION with
 * SECURITY DEFINER since it's a legitimate pattern for admin operations.
 *
 * We only flag direct RLS bypass attempts like ALTER TABLE ... DISABLE ROW
 * LEVEL SECURITY or SET ROLE to a superuser.
 *
 * @param sql - The SQL query to check
 * @returns true if the query attempts to bypass RLS
 */
export function containsRLSBypass(sql: string): boolean {
  const cleanedSql = removeCommentsFromSql(sql).toLowerCase()

  // Only flag explicit RLS disable
  // SET ROLE is safe because it requires the target role's permissions
  const bypassPatterns = [
    /alter\s+table\s+.*\s+disable\s+row\s+level\s+security/i,
    /alter\s+table\s+.*\s+no\s+force\s+row\s+level\s+security/i,
  ]

  return bypassPatterns.some((pattern) => pattern.test(cleanedSql))
}

/**
 * Comprehensive safety check that combines all SQL safety validations.
 *
 * @param sql - The SQL query to check
 * @returns Object with safety check results
 */
export function checkSqlSafety(sql: string): {
  isDestructive: boolean
  isUpdateWithoutWhere: boolean
  hasDangerousPrivileges: boolean
  hasDestructiveCTE: boolean
  hasRLSBypass: boolean
  warnings: string[]
} {
  const warnings: string[] = []

  const isDestructiveResult = checkDestructiveQuery(sql)
  const isUpdateWithoutWhereResult = isUpdateWithoutWhere(sql)
  const hasDangerousPrivileges = containsDangerousPrivilegeChange(sql)
  const hasDestructiveCTE = containsDestructiveCTE(sql)
  const hasRLSBypass = containsRLSBypass(sql)

  if (isDestructiveResult) warnings.push('Query contains destructive operations (DROP/DELETE/TRUNCATE)')
  if (isUpdateWithoutWhereResult) warnings.push('UPDATE statement without WHERE clause')
  if (hasDangerousPrivileges) warnings.push('Query modifies superuser privileges')
  if (hasDestructiveCTE) warnings.push('CTE contains destructive operations')
  if (hasRLSBypass) warnings.push('Query disables Row Level Security')

  return {
    isDestructive: isDestructiveResult,
    isUpdateWithoutWhere: isUpdateWithoutWhereResult,
    hasDangerousPrivileges,
    hasDestructiveCTE,
    hasRLSBypass,
    warnings,
  }
}

export const generateMigrationCliCommand = (id: string, name: string, isNpx = false) =>
  `
${isNpx ? 'npx ' : ''}supabase snippets download ${id} |
${isNpx ? 'npx ' : ''}supabase migration new ${name}
`.trim()

export const generateSeedCliCommand = (id: string, isNpx = false) =>
  `
${isNpx ? 'npx ' : ''}supabase snippets download ${id} >> \\
  supabase/seed.sql
`.trim()

export const generateFileCliCommand = (id: string, name: string, isNpx = false) =>
  `
${isNpx ? 'npx ' : ''}supabase snippets download ${id} > \\
  ${name}.sql
`.trim()

export const compareAsModification = (sqlDiff: ContentDiff) => {
  const formattedModified = sqlDiff.modified.replace(sqlAiDisclaimerComment, '').trim()

  return {
    original: sqlDiff.original,
    modified: `${formattedModified}`,
  }
}

export const compareAsAddition = (sqlDiff: ContentDiff) => {
  const formattedOriginal = sqlDiff.original.replace(sqlAiDisclaimerComment, '').trim()
  const formattedModified = sqlDiff.modified.replace(sqlAiDisclaimerComment, '').trim()
  const newModified = (formattedOriginal ? formattedOriginal + '\n\n' : '') + formattedModified

  return {
    original: sqlDiff.original,
    modified: newModified,
  }
}

export const compareAsNewSnippet = (sqlDiff: ContentDiff) => {
  return {
    original: '',
    modified: sqlDiff.modified,
  }
}

// [Joshen] Just FYI as well the checks here on whether to append limit is quite restricted
// This is to prevent dashboard from accidentally appending limit to the end of a query
// thats not supposed to have any, since there's too many cases to cover.
// We can however look into making this logic better in the future
// i.e It's harder to append the limit param, than just leaving the query as it is
// Otherwise we'd need a full on parser to do this properly
export const checkIfAppendLimitRequired = (sql: string, limit: number = 0) => {
  // Remove lines and whitespaces to use for checking
  const cleanedSql = sql.trim().replaceAll('\n', ' ').replaceAll(/\s+/g, ' ')

  // Check how many queries
  const regMatch = cleanedSql.matchAll(/[a-zA-Z]*[0-9]*[;]+/g)
  const queries = new Array(...regMatch)
  const indexSemiColon = cleanedSql.lastIndexOf(';')
  const hasComments = cleanedSql.includes('--')
  const hasMultipleQueries =
    queries.length > 1 || (indexSemiColon > 0 && indexSemiColon !== cleanedSql.length - 1)

  // Check if need to auto limit rows
  const appendAutoLimit =
    limit > 0 &&
    !hasComments &&
    !hasMultipleQueries &&
    cleanedSql.toLowerCase().startsWith('select') &&
    !cleanedSql.toLowerCase().match(/fetch\s+first/i) &&
    !cleanedSql.match(/limit$/i) &&
    !cleanedSql.match(/limit;$/i) &&
    !cleanedSql.match(/limit [0-9]* offset [0-9]*[;]?$/i) &&
    !cleanedSql.match(/limit [0-9]*[;]?$/i)
  return { cleanedSql, appendAutoLimit }
}

export const suffixWithLimit = (sql: string, limit: number = 0) => {
  const { cleanedSql, appendAutoLimit } = checkIfAppendLimitRequired(sql, limit)
  const formattedSql = appendAutoLimit
    ? cleanedSql.endsWith(';')
      ? sql.replace(/[;]+$/, ` limit ${limit};`)
      : `${sql} limit ${limit};`
    : sql
  return formattedSql
}
