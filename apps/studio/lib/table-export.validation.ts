/**
 * Validation utilities for table export
 */

import {
  MAX_BATCH_SIZE,
  MAX_EXPORT_ROWS,
  MIN_BATCH_SIZE,
  PERFORMANCE_THRESHOLDS,
  SIZE_WARNING_THRESHOLD_BYTES,
  SPECIAL_COLUMN_TYPES,
} from './table-export.constants'
import type {
  ExportColumnConfig,
  ExportColumnDefinition,
  ExportFilter,
  ExportFormat,
  ExportOptions,
  ExportSort,
  ExportTableMetadata,
  ExportValidation,
} from './table-export.types'

/**
 * Validates export options and returns validation result
 */
export function validateExportOptions(
  options: Partial<ExportOptions>,
  metadata?: ExportTableMetadata
): ExportValidation {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate format
  if (options.format && !['csv', 'json', 'xlsx'].includes(options.format)) {
    errors.push(`Invalid export format: ${options.format}`)
  }

  // Validate batch size
  if (options.batchSize !== undefined) {
    if (options.batchSize < MIN_BATCH_SIZE) {
      errors.push(`Batch size must be at least ${MIN_BATCH_SIZE}`)
    }
    if (options.batchSize > MAX_BATCH_SIZE) {
      errors.push(`Batch size cannot exceed ${MAX_BATCH_SIZE}`)
    }
  }

  // Validate max rows
  if (options.maxRows !== undefined) {
    if (options.maxRows <= 0) {
      errors.push('Max rows must be greater than 0')
    }
    if (options.maxRows > MAX_EXPORT_ROWS) {
      warnings.push(
        `Max rows (${options.maxRows.toLocaleString()}) exceeds recommended limit of ${MAX_EXPORT_ROWS.toLocaleString()}`
      )
    }
  }

  // Validate columns if specified
  if (options.columns) {
    if (options.columns.length === 0) {
      errors.push('At least one column must be selected for export')
    }

    // Check for duplicate columns
    const columnNames = options.columns.map((c) => c.name)
    const duplicates = columnNames.filter(
      (name, index) => columnNames.indexOf(name) !== index
    )
    if (duplicates.length > 0) {
      errors.push(`Duplicate columns: ${duplicates.join(', ')}`)
    }

    // Validate against metadata if available
    if (metadata) {
      const validColumns = metadata.columns.map((c) => c.name)
      const invalidColumns = columnNames.filter((name) => !validColumns.includes(name))
      if (invalidColumns.length > 0) {
        errors.push(`Invalid columns: ${invalidColumns.join(', ')}`)
      }
    }
  }

  // Validate filters
  if (options.filters) {
    for (const filter of options.filters) {
      const filterError = validateFilter(filter, metadata)
      if (filterError) {
        errors.push(filterError)
      }
    }
  }

  // Validate sorts
  if (options.sorts) {
    for (const sort of options.sorts) {
      const sortError = validateSort(sort, metadata)
      if (sortError) {
        errors.push(sortError)
      }
    }
  }

  // Add performance warnings based on metadata
  if (metadata) {
    const rowCount = metadata.rowCount
    const maxRows = options.maxRows || MAX_EXPORT_ROWS
    const rowsToExport = Math.min(rowCount, maxRows)

    if (rowsToExport >= PERFORMANCE_THRESHOLDS.DANGEROUS_EXPORT_ROWS) {
      warnings.push(
        `Exporting ${rowsToExport.toLocaleString()} rows may cause browser instability. Consider using smaller batches or server-side export.`
      )
    } else if (rowsToExport >= PERFORMANCE_THRESHOLDS.RISKY_EXPORT_ROWS) {
      warnings.push(
        `Exporting ${rowsToExport.toLocaleString()} rows may be slow. Consider reducing the number of rows.`
      )
    } else if (rowsToExport >= PERFORMANCE_THRESHOLDS.SLOW_EXPORT_ROWS) {
      warnings.push(
        `Exporting ${rowsToExport.toLocaleString()} rows may take a few moments.`
      )
    }

    // Check for special column types
    const hasJsonColumns = metadata.columns.some((c) =>
      SPECIAL_COLUMN_TYPES.JSON_TYPES.includes(c.dataType)
    )
    if (hasJsonColumns && options.format === 'csv') {
      warnings.push(
        'JSON columns will be stringified in CSV format. Consider using JSON format for better data fidelity.'
      )
    }

    const hasBinaryColumns = metadata.columns.some((c) =>
      SPECIAL_COLUMN_TYPES.BINARY_TYPES.includes(c.dataType)
    )
    if (hasBinaryColumns) {
      warnings.push('Binary columns will be base64 encoded in the export.')
    }

    const hasGeometryColumns = metadata.columns.some((c) =>
      SPECIAL_COLUMN_TYPES.GEOMETRY_TYPES.includes(c.dataType)
    )
    if (hasGeometryColumns) {
      warnings.push('Geometry columns will be exported as WKT (Well-Known Text).')
    }
  }

  // Estimate size and duration if possible
  let estimatedSize: number | undefined
  let estimatedDuration: number | undefined

  if (metadata) {
    const rowsToExport = Math.min(
      metadata.rowCount,
      options.maxRows || MAX_EXPORT_ROWS
    )

    // Very rough estimate: 100 bytes per row average
    estimatedSize = rowsToExport * 100

    // Estimate based on rows per second
    estimatedDuration = Math.ceil(
      rowsToExport / PERFORMANCE_THRESHOLDS.ESTIMATED_ROWS_PER_SECOND
    )

    if (estimatedSize > SIZE_WARNING_THRESHOLD_BYTES) {
      warnings.push(
        `Estimated file size is ${formatBytes(estimatedSize)}. Large files may cause download issues.`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedSize,
    estimatedDuration,
  }
}

/**
 * Validates a single filter
 */
function validateFilter(
  filter: ExportFilter,
  metadata?: ExportTableMetadata
): string | null {
  if (!filter.column) {
    return 'Filter column is required'
  }

  if (!filter.operator) {
    return 'Filter operator is required'
  }

  const validOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is']
  if (!validOperators.includes(filter.operator)) {
    return `Invalid filter operator: ${filter.operator}`
  }

  if (filter.operator === 'in' && !Array.isArray(filter.value)) {
    return 'Filter value must be an array for "in" operator'
  }

  if (filter.operator === 'is' && !['null', 'not null', 'true', 'false'].includes(String(filter.value).toLowerCase())) {
    return 'Filter value for "is" operator must be null, not null, true, or false'
  }

  if (metadata) {
    const column = metadata.columns.find((c) => c.name === filter.column)
    if (!column) {
      return `Invalid filter column: ${filter.column}`
    }
  }

  return null
}

/**
 * Validates a single sort
 */
function validateSort(
  sort: ExportSort,
  metadata?: ExportTableMetadata
): string | null {
  if (!sort.column) {
    return 'Sort column is required'
  }

  if (!sort.direction || !['asc', 'desc'].includes(sort.direction)) {
    return 'Sort direction must be "asc" or "desc"'
  }

  if (metadata) {
    const column = metadata.columns.find((c) => c.name === sort.column)
    if (!column) {
      return `Invalid sort column: ${sort.column}`
    }

    // Warn about sorting JSON columns
    if (SPECIAL_COLUMN_TYPES.JSON_TYPES.includes(column.dataType)) {
      // This is a warning, not an error
      return null
    }
  }

  return null
}

/**
 * Validates column configuration
 */
export function validateColumnConfig(
  config: ExportColumnConfig,
  definition?: ExportColumnDefinition
): string | null {
  if (!config.name) {
    return 'Column name is required'
  }

  if (config.width !== undefined && (config.width < 1 || config.width > 500)) {
    return 'Column width must be between 1 and 500'
  }

  return null
}

/**
 * Validates that all required columns are included
 */
export function validateRequiredColumns(
  selectedColumns: ExportColumnConfig[],
  metadata: ExportTableMetadata
): string[] {
  const errors: string[] = []

  // Check if primary key columns are included (optional warning)
  if (metadata.primaryKey && metadata.primaryKey.length > 0) {
    const selectedNames = selectedColumns.map((c) => c.name)
    const missingPk = metadata.primaryKey.filter((pk) => !selectedNames.includes(pk))
    if (missingPk.length > 0) {
      // This is informational, not an error
    }
  }

  return errors
}

/**
 * Formats bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Checks if a column type requires special export handling
 */
export function requiresSpecialHandling(dataType: string): boolean {
  const allSpecialTypes = [
    ...SPECIAL_COLUMN_TYPES.JSON_TYPES,
    ...SPECIAL_COLUMN_TYPES.DATE_TYPES,
    ...SPECIAL_COLUMN_TYPES.ARRAY_TYPES,
    ...SPECIAL_COLUMN_TYPES.BINARY_TYPES,
    ...SPECIAL_COLUMN_TYPES.GEOMETRY_TYPES,
  ]

  return allSpecialTypes.includes(dataType)
}

/**
 * Gets the appropriate formatter for a column type
 */
export function getColumnFormatter(
  dataType: string
): ((value: any) => string) | null {
  if (SPECIAL_COLUMN_TYPES.JSON_TYPES.includes(dataType)) {
    return (value) => JSON.stringify(value)
  }

  if (SPECIAL_COLUMN_TYPES.BINARY_TYPES.includes(dataType)) {
    return (value) => {
      if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(value)))
      }
      return String(value)
    }
  }

  if (SPECIAL_COLUMN_TYPES.ARRAY_TYPES.includes(dataType)) {
    return (value) => (Array.isArray(value) ? `{${value.join(',')}}` : String(value))
  }

  return null
}
