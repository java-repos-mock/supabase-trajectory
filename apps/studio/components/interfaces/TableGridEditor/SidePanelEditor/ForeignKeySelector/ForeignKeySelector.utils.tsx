import { FOREIGN_KEY_CASCADE_ACTION } from 'data/database/database-query-constants'
import type { ForeignKeyConstraint } from 'data/database/foreign-key-constraints-query'
import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from 'ui'
import { getForeignKeyCascadeAction } from '../ColumnEditor/ColumnEditor.utils'
import type { ForeignKey } from './ForeignKeySelector.types'

// ============================================================================
// Foreign Key Type Compatibility
// 
// PostgreSQL allows foreign keys between columns of compatible types.
// This validation helps users avoid creating invalid FK relationships.
// ============================================================================

/**
 * Type groups that are compatible for foreign key relationships.
 * PostgreSQL allows FKs between any types in the same group.
 * 
 * Note: We use PostgreSQL's implicit casting rules here. Types within
 * the same "family" can be compared using the = operator, which is
 * the requirement for FK constraints.
 */
const FK_COMPATIBLE_TYPE_GROUPS = {
  // Integer types - all comparable via implicit casting
  integer: ['int2', 'int4', 'int8', 'smallint', 'integer', 'bigint'],
  // Text types - all comparable
  text: ['text', 'varchar', 'char', 'bpchar', 'character varying', 'character'],
  // UUID is only compatible with itself
  uuid: ['uuid'],
  // Numeric types for precision numbers
  numeric: ['numeric', 'decimal'],
  // Floating point - compatible with each other
  float: ['float4', 'float8', 'real', 'double precision'],
}

/**
 * Checks if two column types are compatible for a foreign key relationship.
 * 
 * PostgreSQL requires that the source and target columns of a FK have
 * compatible types - meaning they can be compared using the = operator.
 * This function checks our predefined type groups for compatibility.
 * 
 * @param sourceType - The type of the referencing column
 * @param targetType - The type of the referenced column
 * @returns true if the types are compatible for a FK relationship
 */
export function areTypesCompatibleForFK(sourceType: string, targetType: string): boolean {
  // Normalize types to lowercase for comparison
  const source = sourceType.toLowerCase()
  const target = targetType.toLowerCase()
  
  // Exact match is always compatible
  if (source === target) {
    return true
  }
  
  // Find which groups each type belongs to
  for (const types of Object.values(FK_COMPATIBLE_TYPE_GROUPS)) {
    const sourceInGroup = types.includes(source)
    const targetInGroup = types.includes(target)
    
    // If both are in the same group, they're compatible
    if (sourceInGroup && targetInGroup) {
      return true
    }
  }
  
  return false
}

/**
 * Validates a complete foreign key definition before creation.
 * 
 * Checks:
 * 1. All source columns have matching target columns
 * 2. Column types are compatible
 * 3. Target columns exist and are suitable (unique/primary key)
 * 
 * @param fk - The foreign key definition to validate
 * @param sourceColumns - Available columns in the source table
 * @param targetColumns - Available columns in the target table
 * @returns Validation result with any errors
 */
export function validateForeignKeyDefinition(
  fk: ForeignKey,
  sourceColumns: Array<{ name: string; format: string }>,
  targetColumns: Array<{ name: string; format: string; is_unique?: boolean; is_primary?: boolean }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Check that columns are selected
  if (!fk.columns || fk.columns.length === 0) {
    errors.push('At least one column pair must be selected')
    return { valid: false, errors }
  }
  
  // Validate each column pair
  for (const col of fk.columns) {
    // Check source column exists
    const sourceCol = sourceColumns.find((c) => c.name === col.source)
    if (!sourceCol) {
      errors.push(`Source column "${col.source}" not found`)
      continue
    }
    
    // Check target column exists
    const targetCol = targetColumns.find((c) => c.name === col.target)
    if (!targetCol) {
      errors.push(`Target column "${col.target}" not found in table "${fk.table}"`)
      continue
    }
    
    // Check type compatibility
    if (!areTypesCompatibleForFK(sourceCol.format, targetCol.format)) {
      errors.push(
        `Type mismatch: "${col.source}" (${sourceCol.format}) is not compatible with "${col.target}" (${targetCol.format})`
      )
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Suggests the appropriate type for a new source column based on the target.
 * 
 * When creating a new column that will reference another table, we should
 * use a compatible type. This function returns the recommended type.
 * 
 * @param targetType - The type of the column being referenced
 * @returns The recommended type for the source column
 */
export function suggestSourceColumnType(targetType: string): string {
  const target = targetType.toLowerCase()
  
  // For integer types, use the same size to avoid overflow issues
  // This is important because a bigint value won't fit in an int4
  if (['int8', 'bigint'].includes(target)) {
    return 'int8'
  }
  if (['int4', 'integer'].includes(target)) {
    return 'int4'
  }
  if (['int2', 'smallint'].includes(target)) {
    return 'int2'
  }
  
  // For text types, use text (most flexible)
  if (FK_COMPATIBLE_TYPE_GROUPS.text.includes(target)) {
    return 'text'
  }
  
  // For UUID, must use UUID
  if (target === 'uuid') {
    return 'uuid'
  }
  
  // Default: use the same type
  return targetType
}

export const formatForeignKeys = (fks: ForeignKeyConstraint[]): ForeignKey[] => {
  return fks.map((x) => {
    return {
      id: x.id,
      name: x.constraint_name,
      tableId: x.target_id,
      schema: x.target_schema,
      table: x.target_table,
      columns: x.source_columns.map((y, i) => ({ source: y, target: x.target_columns[i] })),
      deletionAction: x.deletion_action,
      updateAction: x.update_action,
    }
  })
}

export const generateCascadeActionDescription = (
  action: 'update' | 'delete',
  cascadeAction: string,
  reference: string
) => {
  const actionVerb = action === 'update' ? 'Updating' : 'Deleting'
  const actionName = getForeignKeyCascadeAction(cascadeAction) ?? 'No action'

  switch (cascadeAction) {
    case FOREIGN_KEY_CASCADE_ACTION.NO_ACTION:
      return (
        <>
          <span className="text-foreground-light">{actionName}</span>: {actionVerb} a record from{' '}
          <code className="text-code-inline">{reference}</code> will{' '}
          <span className="text-amber-900 opacity-75">raise an error</span> if there are records
          existing in this table that reference it
        </>
      )
    case FOREIGN_KEY_CASCADE_ACTION.CASCADE:
      return (
        <>
          <span className="text-foreground-light">{actionName}</span>: {actionVerb} a record from{' '}
          <code className="text-code-inline">{reference}</code> will{' '}
          <span className="text-amber-900 opacity-75">also {action}</span> any records that
          reference it in this table
        </>
      )
    case FOREIGN_KEY_CASCADE_ACTION.RESTRICT:
      return (
        <>
          <span className="text-foreground-light">{actionName}</span>
          <Tooltip>
            <TooltipTrigger className="translate-y-[3px] mx-1">
              <HelpCircle className="text-foreground-light" size={16} strokeWidth={1.5} />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-80">
              This is similar to no action, but the restrict check cannot be deferred till later in
              the transaction
            </TooltipContent>
          </Tooltip>
          : {actionVerb} a record from <code className="text-code-inline">{reference}</code> will{' '}
          <span className="text-amber-900 opacity-75">prevent {actionVerb.toLowerCase()}</span>{' '}
          existing referencing rows from this table.
        </>
      )
    case FOREIGN_KEY_CASCADE_ACTION.SET_DEFAULT:
      return (
        <>
          <span className="text-foreground-light">{actionName}</span>: {actionVerb} a record from{' '}
          <code className="text-code-inline">{reference}</code> will set the value of any existing
          records in this table referencing it to their{' '}
          <span className="text-amber-900 opacity-75">default value</span>
        </>
      )
    case FOREIGN_KEY_CASCADE_ACTION.SET_NULL:
      return (
        <>
          <span className="text-foreground-light">{actionName}</span>: {actionVerb} a record from{' '}
          <code className="text-code-inline">{reference}</code> will set the value of any existing
          records in this table referencing it{' '}
          <span className="text-amber-900 opacity-75">to NULL</span>
        </>
      )
  }
}
