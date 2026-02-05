/**
 * CSV Export Utilities
 *
 * Provides optimized CSV export functionality for table data with
 * batched fetching, progress tracking, and role impersonation support.
 */

import dayjs from 'dayjs'
import Papa from 'papaparse'

import { DATE_FORMAT } from './constants'
import { wrapWithRoleImpersonation, RoleImpersonationState } from './role-impersonation'
import { executeSql } from 'data/sql/execute-sql-query'

// Storage key for CSV export preferences
const CSV_EXPORT_SETTINGS_KEY = 'supabase.csv-export.settings'

// Export configuration
const DEFAULT_BATCH_SIZE = 1000
const MAX_EXPORT_ROWS = 100000
const EXPORT_RETRY_ATTEMPTS = 3
const EXPORT_RETRY_DELAY_MS = 1000

/**
 * Export settings persisted to localStorage
 */
interface CsvExportSettings {
  defaultBatchSize: number
  includeHeaders: boolean
  dateFormat: string
  lastExportedTable?: string
}

/**
 * Progress callback data
 */
export interface ExportProgress {
  exported: number
  total: number
  percentage: number
  currentBatch: number
  totalBatches: number
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean
  data?: string
  filename?: string
  rowCount?: number
  error?: string
}

/**
 * Saves export settings to localStorage
 */
export function saveExportSettings(settings: Partial<CsvExportSettings>): void {
  try {
    const existing = loadExportSettings()
    const merged = { ...existing, ...settings }
    localStorage.setItem(CSV_EXPORT_SETTINGS_KEY, JSON.stringify(merged))
  } catch (error) {
    console.warn('Failed to save CSV export settings:', error)
  }
}

/**
 * Loads export settings from localStorage
 */
export function loadExportSettings(): CsvExportSettings {
  try {
    const stored = localStorage.getItem(CSV_EXPORT_SETTINGS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.warn('Failed to load CSV export settings:', error)
  }

  return {
    defaultBatchSize: DEFAULT_BATCH_SIZE,
    includeHeaders: true,
    dateFormat: DATE_FORMAT,
  }
}

/**
 * Formats a date value for CSV export
 */
export function formatDateForExport(value: Date | string | number, format?: string): string {
  const dateFormat = format || DATE_FORMAT
  return dayjs(value).format(dateFormat)
}

/**
 * Calculates pagination range for batch fetching
 *
 * @param page - Zero-indexed page number
 * @param batchSize - Number of rows per batch
 * @returns Range with from and to values for database query
 */
export function getExportRange(page: number, batchSize: number): { from: number; to: number } {
  const from = page * batchSize
  const to = from + batchSize
  return { from, to }
}

/**
 * Wraps SQL query with custom role for export
 * Useful when exporting data as a specific database role
 */
export function wrapExportQueryWithRole(sql: string, roleName?: string): string {
  if (!roleName) {
    return sql
  }

  // Set the role for the export query
  return `
    SET LOCAL ROLE '${roleName}';
    ${sql}
  `.trim()
}

/**
 * Formats row data for CSV, handling special types
 */
function formatRowForCsv(
  row: Record<string, any>,
  columns?: string[],
  dateFormat?: string
): Record<string, any> {
  const formattedRow: Record<string, any> = {}
  const columnsToExport = columns || Object.keys(row)

  for (const column of columnsToExport) {
    const value = row[column]

    if (value === null || value === undefined) {
      formattedRow[column] = ''
    } else if (value instanceof Date) {
      formattedRow[column] = formatDateForExport(value, dateFormat)
    } else if (typeof value === 'object') {
      // JSON/JSONB columns
      formattedRow[column] = JSON.stringify(value)
    } else {
      formattedRow[column] = value
    }
  }

  return formattedRow
}

/**
 * Converts rows to CSV string
 */
export function rowsToCsv(
  rows: Record<string, any>[],
  options: {
    columns?: string[]
    includeHeaders?: boolean
    dateFormat?: string
  } = {}
): string {
  const { columns, includeHeaders = true, dateFormat } = options

  const formattedRows = rows.map((row) => formatRowForCsv(row, columns, dateFormat))
  const csvColumns = columns || (rows.length > 0 ? Object.keys(rows[0]) : [])

  return Papa.unparse(formattedRows, {
    columns: csvColumns,
    header: includeHeaders,
  })
}

/**
 * Retry helper with backoff for failed operations
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = EXPORT_RETRY_ATTEMPTS,
  delayMs: number = EXPORT_RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt < maxAttempts) {
        // Backoff delay between retries
        const backoffDelay = delayMs * attempt
        await new Promise((resolve) => setTimeout(resolve, backoffDelay))
      }
    }
  }

  throw lastError
}

/**
 * Generates a filename for the CSV export
 */
export function generateExportFilename(tableName: string, schemaName?: string): string {
  const timestamp = dayjs().format('YYYYMMDD_HHmmss')
  const prefix = schemaName && schemaName !== 'public' ? `${schemaName}_` : ''
  return `${prefix}${tableName}_${timestamp}.csv`
}

/**
 * Main CSV export function with batched fetching
 */
export async function exportTableToCsv({
  projectRef,
  connectionString,
  tableName,
  schemaName = 'public',
  totalRows,
  columns,
  roleImpersonationState,
  customRole,
  batchSize = DEFAULT_BATCH_SIZE,
  maxRows = MAX_EXPORT_ROWS,
  includeHeaders = true,
  dateFormat,
  onProgress,
}: {
  projectRef: string
  connectionString?: string | null
  tableName: string
  schemaName?: string
  totalRows: number
  columns?: string[]
  roleImpersonationState?: RoleImpersonationState
  customRole?: string
  batchSize?: number
  maxRows?: number
  includeHeaders?: boolean
  dateFormat?: string
  onProgress?: (progress: ExportProgress) => void
}): Promise<ExportResult> {
  const rowsToExport = Math.min(totalRows, maxRows)
  const totalBatches = Math.ceil(rowsToExport / batchSize)

  const allRows: Record<string, any>[] = []
  let exportedCount = 0

  try {
    for (let batch = 0; batch < totalBatches; batch++) {
      const { from, to } = getExportRange(batch, batchSize)

      // Adjust last batch to not exceed total
      const adjustedTo = Math.min(to, rowsToExport)

      // Build SELECT query
      const columnList = columns ? columns.map((c) => `"${c}"`).join(', ') : '*'
      let sql = `SELECT ${columnList} FROM "${schemaName}"."${tableName}" LIMIT ${adjustedTo - from} OFFSET ${from}`

      // Apply role impersonation if configured
      if (roleImpersonationState) {
        sql = wrapWithRoleImpersonation(sql, roleImpersonationState)
      } else if (customRole) {
        sql = wrapExportQueryWithRole(sql, customRole)
      }

      // Fetch batch with retry
      const { result } = await withRetry(async () =>
        executeSql({ projectRef, connectionString, sql })
      )

      allRows.push(...result)
      exportedCount += result.length

      // Report progress
      if (onProgress) {
        onProgress({
          exported: exportedCount,
          total: rowsToExport,
          percentage: Math.round((exportedCount / rowsToExport) * 100),
          currentBatch: batch + 1,
          totalBatches,
        })
      }
    }

    // Convert to CSV
    const csvData = rowsToCsv(allRows, {
      columns,
      includeHeaders,
      dateFormat: dateFormat || DATE_FORMAT,
    })

    const filename = generateExportFilename(tableName, schemaName)

    // Save last exported table
    saveExportSettings({ lastExportedTable: `${schemaName}.${tableName}` })

    return {
      success: true,
      data: csvData,
      filename,
      rowCount: allRows.length,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'CSV export failed',
    }
  }
}

/**
 * Triggers download of CSV data
 */
export function downloadCsv(result: ExportResult): void {
  if (!result.success || !result.data || !result.filename) {
    throw new Error('Cannot download failed or empty export')
  }

  const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = result.filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Estimates CSV file size
 */
export function estimateCsvSize(
  sampleRow: Record<string, any>,
  totalRows: number
): number {
  const sampleCsv = rowsToCsv([sampleRow])
  // Add ~5% overhead for headers and formatting
  return Math.round(sampleCsv.length * totalRows * 1.05)
}
