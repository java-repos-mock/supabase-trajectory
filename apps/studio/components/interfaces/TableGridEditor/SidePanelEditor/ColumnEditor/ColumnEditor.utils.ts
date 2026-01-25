import type { PostgresColumn } from '@supabase/postgres-meta'
import { isNull } from 'lodash'
import type { Dictionary } from 'types'

import { FOREIGN_KEY_CASCADE_ACTION } from 'data/database/database-query-constants'
import type { ForeignKeyConstraint } from 'data/database/foreign-key-constraints-query'
import type { RetrievedTableColumn, RetrieveTableResult } from 'data/tables/table-retrieve-query'
import { uuidv4 } from 'lib/helpers'
import { toast } from 'sonner'
import {
  ColumnField,
  CreateColumnPayload,
  ExtendedPostgresRelationship,
  UpdateColumnPayload,
} from '../SidePanelEditor.types'

const isSQLExpression = (input: string) => {
  if (['CURRENT_DATE'].includes(input)) return true

  if (input[0] === '(' && input[input.length - 1] === ')') {
    return true
  }

  const openParanthesisIndex = input.indexOf('(')
  const closeParanthesisIndex = input.indexOf(')')

  const hasSpaces = input.indexOf(' ') >= 0
  if (!hasSpaces && openParanthesisIndex >= 0 && closeParanthesisIndex > openParanthesisIndex) {
    return true
  }

  return false
}

export const generateColumnField = (field: any = {}): ColumnField => {
  const { name, table, schema, format } = field
  return {
    id: uuidv4(),
    name: name || '',
    table: table || '',
    schema: schema || '',
    comment: '',
    format: format || '',
    defaultValue: null,
    foreignKey: undefined,
    check: null,
    isNullable: true,
    isUnique: false,
    isArray: false,
    isPrimaryKey: false,
    isIdentity: false,
    isNewColumn: true,
    isEncrypted: false,
  }
}

export const generateColumnFieldFromPostgresColumn = (
  column: PostgresColumn,
  table: RetrieveTableResult,
  foreignKeys: ForeignKeyConstraint[]
): ColumnField => {
  const { primary_keys } = table
  const primaryKeyColumns = primary_keys.map((key) => key.name)
  const foreignKey = getColumnForeignKey(column, table, foreignKeys)
  const isArray = column?.data_type === 'ARRAY'

  return {
    foreignKey,
    id: column?.id ?? uuidv4(),
    table: column.table,
    schema: column.schema,
    name: column.name,
    comment: column?.comment,
    format: isArray ? column.format.slice(1) : column.format,
    defaultValue: column?.default_value as string | null,
    check: column.check,
    isArray: isArray,
    isNullable: column.is_nullable,
    isIdentity: column.is_identity,
    isUnique: column.is_unique,

    isNewColumn: false,
    isEncrypted: false,
    isPrimaryKey: primaryKeyColumns.includes(column.name),
  }
}

export const generateCreateColumnPayload = (
  table: RetrieveTableResult,
  field: ColumnField
): CreateColumnPayload => {
  const isIdentity = field.format.includes('int') ? field.isIdentity : false
  const defaultValue = field.defaultValue
  const payload: CreateColumnPayload = {
    schema: table.schema,
    table: table.name,
    isIdentity,
    name: field.name.trim(),
    comment: field.comment?.trim(),
    type: field.isArray ? `${field.format}[]` : field.format,
    check: field.check?.trim() || undefined,
    isUnique: field.isUnique,
    isPrimaryKey: field.isPrimaryKey,
    ...(!field.isPrimaryKey && !isIdentity && { isNullable: field.isNullable }),
    ...(!isIdentity && {
      defaultValue:
        field.isArray && defaultValue ? formatArrayToPostgresArray(defaultValue) : defaultValue,
    }),
    ...(!isIdentity &&
      defaultValue && {
        defaultValueFormat:
          isNull(defaultValue) || isSQLExpression(defaultValue) ? 'expression' : 'literal',
      }),
  }
  return payload
}

export const generateUpdateColumnPayload = (
  originalColumn: RetrievedTableColumn,
  table: RetrieveTableResult,
  field: ColumnField
): Partial<UpdateColumnPayload> => {
  const primaryKeyColumns = table.primary_keys.map((key) => key.name)
  const isOriginallyPrimaryKey = primaryKeyColumns.includes(originalColumn.name)

  // Only append the properties which are getting updated
  const name = field.name.trim()
  const type = field.isArray ? `${field.format}[]` : field.format
  const comment = field.comment?.trim()
  const check = field.check?.trim()

  const payload: Partial<UpdateColumnPayload> = {}
  // [Joshen] Trimming on the original name as well so we don't rename columns that already
  // contain whitespaces (and accidentally bringing user apps down)
  if (originalColumn.name.trim() !== name) {
    payload.name = name
  }
  if (originalColumn.comment?.trim() !== comment) {
    payload.comment = comment
  }
  if (originalColumn.check?.trim() !== check) {
    payload.check = check
  }

  const originalFormat =
    originalColumn.data_type === 'ARRAY'
      ? `${originalColumn.format.replace(/^_/, '')}[]`
      : originalColumn.format
  if (originalFormat !== type) {
    payload.type = type
  }

  if (originalColumn.default_value !== field.defaultValue) {
    const defaultValue = field.defaultValue
    payload.defaultValue = defaultValue as unknown as Record<string, never> | undefined
    payload.defaultValueFormat =
      isNull(defaultValue) || isSQLExpression(defaultValue) ? 'expression' : 'literal'
  }
  if (originalColumn.is_identity !== field.isIdentity) {
    payload.isIdentity = field.isIdentity
  }
  if (originalColumn.is_nullable !== field.isNullable) {
    payload.isNullable = field.isNullable
  }
  if (originalColumn.is_unique !== field.isUnique) {
    payload.isUnique = field.isUnique
  }
  if (isOriginallyPrimaryKey !== field.isPrimaryKey) {
    payload.isPrimaryKey = field.isPrimaryKey
  }

  return payload
}

export const validateFields = (field: ColumnField) => {
  const errors = {} as Dictionary<any>
  if (field.name.length === 0) {
    errors['name'] = `Please assign a name for your column`
    toast.error(errors['name'])
  }
  if (field.format.length === 0) {
    errors['format'] = `Please select a type for your column`
    toast.error(errors['format'])
  }
  return errors
}

export const getForeignKeyUIState = (
  originalConfig: ExtendedPostgresRelationship | undefined,
  updatedConfig: ExtendedPostgresRelationship | undefined
): 'Info' | 'Add' | 'Remove' | 'Update' => {
  if (originalConfig === undefined && updatedConfig !== undefined) {
    return 'Add'
  }

  if (originalConfig !== undefined && updatedConfig === undefined) {
    return 'Remove'
  }

  if (
    originalConfig?.target_table_schema !== updatedConfig?.target_table_schema ||
    originalConfig?.target_table_name !== updatedConfig?.target_table_name ||
    originalConfig?.target_column_name !== updatedConfig?.target_column_name ||
    originalConfig?.deletion_action !== updatedConfig?.deletion_action ||
    originalConfig?.update_action !== updatedConfig?.update_action
  ) {
    return 'Update'
  }

  return 'Info'
}

export const getColumnForeignKey = (
  column: PostgresColumn,
  table: RetrieveTableResult,
  foreignKeys: ForeignKeyConstraint[]
) => {
  const { relationships } = table

  const foreignKey = relationships.find((relationship) => {
    return (
      relationship.source_schema === column.schema &&
      relationship.source_table_name === column.table &&
      relationship.source_column_name === column.name
    )
  })
  if (foreignKey === undefined) return foreignKey
  else {
    const foreignKeyMeta = foreignKeys.find((fk) => fk.id === foreignKey.id)
    return {
      ...foreignKey,
      deletion_action: foreignKeyMeta?.deletion_action ?? FOREIGN_KEY_CASCADE_ACTION.NO_ACTION,
      update_action: foreignKeyMeta?.update_action ?? FOREIGN_KEY_CASCADE_ACTION.NO_ACTION,
    }
  }
}

// Assumes arrayString is a stringified array (e.g "[1, 2, 3]")
const formatArrayToPostgresArray = (arrayString: string) => {
  if (!arrayString) return null
  return arrayString.replaceAll('[', '{').replaceAll(']', '}')
}

export const getForeignKeyCascadeAction = (action?: string) => {
  switch (action) {
    case FOREIGN_KEY_CASCADE_ACTION.CASCADE:
      return 'Cascade'
    case FOREIGN_KEY_CASCADE_ACTION.RESTRICT:
      return 'Restrict'
    case FOREIGN_KEY_CASCADE_ACTION.SET_DEFAULT:
      return 'Set default'
    case FOREIGN_KEY_CASCADE_ACTION.SET_NULL:
      return 'Set NULL'
    default:
      return undefined
  }
}

export const getPlaceholderText = (format?: string, columnFieldName?: string) => {
  const columnName = columnFieldName || 'column_name'

  switch (format) {
    case 'int2':
    case 'int4':
    case 'int8':
    case 'numeric':
      return `"${columnName}" > 0`

    case 'float4':
    case 'float8':
      return `"${columnName}" > 0.0`

    case 'text':
    case 'varchar':
      return `length("${columnName}") <= 50`

    case 'json':
    case 'jsonb':
      return `jsonb_typeof("${columnName}"->'active') = 'boolean'`

    case 'bool':
      return `"${columnName}" in (true, false)`

    case 'date':
      return `"${columnName}" > '2024-01-01'`

    case 'time':
      return `"${columnName}" between '09:00:00' and '12:00:00'`

    case 'timetz':
      return `"${columnName}" at time zone 'UTC' between '09:00:00+00' and '17:00:00+00'`

    case 'uuid':
      return `"${columnName}" '00000000-0000-0000-0000-000000000000'`

    case 'timestamp':
      return `"${columnName}" > '2023-01-01 00:00' and "${columnName}" < '2025-01-01 00:00'`
    case 'timestamptz':
      return `"${columnName}" > '2023-01-01 00:00:00+00' and "${columnName}" < '2025-01-01 00:00:00+00'`

    default:
      return `length("${columnName}") < 500`
  }
}

/**
 * Type compatibility groups for column type changes.
 * Types within the same group can be converted without data loss.
 */
const TYPE_GROUPS = {
  numeric: ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'decimal'],
  text: ['text', 'varchar', 'char', 'bpchar'],
  temporal: ['date', 'time', 'timetz', 'timestamp', 'timestamptz'],
  boolean: ['bool', 'boolean'],
  json: ['json', 'jsonb'],
  uuid: ['uuid'],
}

/**
 * Checks if a column type change is safe (won't cause data loss).
 * Safe changes are within the same type group or to a wider type.
 */
export function isTypeSafeChange(fromType: string, toType: string): boolean {
  // Same type is always safe
  if (fromType === toType) return true
  
  // Find which groups each type belongs to
  const fromGroup = Object.entries(TYPE_GROUPS).find(([_, types]) => 
    types.includes(fromType.toLowerCase())
  )?.[0]
  
  const toGroup = Object.entries(TYPE_GROUPS).find(([_, types]) => 
    types.includes(toType.toLowerCase())
  )?.[0]
  
  // Types in the same group can be converted
  if (fromGroup && toGroup && fromGroup === toGroup) {
    return true
  }
  
  // Text types can accept any type (widening)
  if (toGroup === 'text') {
    return true
  }
  
  return false
}

/**
 * Validates that a default value is compatible with the column type.
 * Returns true if the value can be safely used as a default.
 */
export function isValidDefaultValue(value: string, columnType: string): boolean {
  const type = columnType.toLowerCase()
  
  // Check numeric types
  if (TYPE_GROUPS.numeric.includes(type)) {
    const num = Number(value)
    return !isNaN(num)
  }
  
  // Check boolean types
  if (TYPE_GROUPS.boolean.includes(type)) {
    const lower = value.toLowerCase()
    return ['true', 'false', '1', '0', 't', 'f'].includes(lower)
  }
  
  // Check UUID format
  if (TYPE_GROUPS.uuid.includes(type)) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(value)
  }
  
  // Check JSON format
  if (TYPE_GROUPS.json.includes(type)) {
    try {
      JSON.parse(value)
      return true
    } catch {
      return false
    }
  }
  
  // Text types accept any value
  if (TYPE_GROUPS.text.includes(type)) {
    return true
  }
  
  // Temporal types - basic validation
  if (TYPE_GROUPS.temporal.includes(type)) {
    const date = new Date(value)
    return !isNaN(date.getTime())
  }
  
  return true
}

/**
 * Gets the appropriate SQL cast expression for type conversion.
 */
export function getTypeCastExpression(columnName: string, fromType: string, toType: string): string {
  // Numeric to text - straightforward cast
  if (TYPE_GROUPS.numeric.includes(fromType.toLowerCase()) && 
      TYPE_GROUPS.text.includes(toType.toLowerCase())) {
    return `${columnName}::${toType}`
  }
  
  // Text to numeric - need to handle non-numeric values
  if (TYPE_GROUPS.text.includes(fromType.toLowerCase()) && 
      TYPE_GROUPS.numeric.includes(toType.toLowerCase())) {
    return `${columnName}::${toType}`
  }
  
  // JSON to text
  if (TYPE_GROUPS.json.includes(fromType.toLowerCase()) && 
      TYPE_GROUPS.text.includes(toType.toLowerCase())) {
    return `${columnName}::${toType}`
  }
  
  // Default cast
  return `${columnName}::${toType}`
}

/**
 * Checks if a column can have a default value of the specified type.
 */
export function canHaveDefault(columnType: string): boolean {
  const type = columnType.toLowerCase()
  
  // Serial types have implicit defaults
  if (type.includes('serial')) {
    return false
  }
  
  // Array types can have defaults
  if (type.endsWith('[]')) {
    return true
  }
  
  return true
}
