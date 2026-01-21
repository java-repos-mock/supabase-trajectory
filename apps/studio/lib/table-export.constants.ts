/**
 * Constants for table export functionality
 */

import type { ExportFormat } from './table-export.types'

/**
 * Default batch size for fetching rows
 * Balanced between memory usage and network efficiency
 */
export const DEFAULT_EXPORT_BATCH_SIZE = 1000

/**
 * Maximum rows that can be exported in a single operation
 * This is a safety limit to prevent browser crashes
 */
export const MAX_EXPORT_ROWS = 100000

/**
 * Maximum recommended rows for smooth browser experience
 */
export const RECOMMENDED_MAX_ROWS = 50000

/**
 * Number of retry attempts for failed batch fetches
 */
export const EXPORT_RETRY_ATTEMPTS = 3

/**
 * Base delay between retry attempts in milliseconds
 */
export const EXPORT_RETRY_DELAY_MS = 1000

/**
 * File size threshold for showing warnings (100MB)
 */
export const SIZE_WARNING_THRESHOLD_BYTES = 100 * 1024 * 1024

/**
 * Minimum batch size allowed
 */
export const MIN_BATCH_SIZE = 100

/**
 * Maximum batch size allowed
 */
export const MAX_BATCH_SIZE = 10000

/**
 * Storage key prefix for export-related settings
 * Note: Uses studio prefix for export-specific settings
 */
export const EXPORT_STORAGE_PREFIX = 'supabase.studio.export'

/**
 * Storage key for persisted export settings
 */
export const EXPORT_SETTINGS_STORAGE_KEY = `${EXPORT_STORAGE_PREFIX}.settings`

/**
 * Storage key for recent export history
 */
export const EXPORT_HISTORY_STORAGE_KEY = `${EXPORT_STORAGE_PREFIX}.history`

/**
 * Maximum number of export history entries to keep
 */
export const MAX_EXPORT_HISTORY_ENTRIES = 10

/**
 * Supported export formats with metadata
 */
export const EXPORT_FORMATS: Record<ExportFormat, {
  label: string
  extension: string
  mimeType: string
  description: string
}> = {
  csv: {
    label: 'CSV',
    extension: '.csv',
    mimeType: 'text/csv',
    description: 'Comma-separated values, compatible with spreadsheets',
  },
  json: {
    label: 'JSON',
    extension: '.json',
    mimeType: 'application/json',
    description: 'JavaScript Object Notation, ideal for APIs and scripts',
  },
  xlsx: {
    label: 'Excel',
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description: 'Microsoft Excel format with formatting support',
  },
}

/**
 * Default date format for exports
 * Uses ISO 8601 format for maximum compatibility
 * @deprecated Use DATETIME_FORMAT from constants instead for display
 */
export const DEFAULT_EXPORT_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ'

/**
 * Human-readable date format for export filenames
 */
export const FILENAME_DATE_FORMAT = 'YYYYMMDD_HHmmss'

/**
 * Common date format presets
 */
export const DATE_FORMAT_PRESETS = [
  { value: 'YYYY-MM-DD', label: 'ISO Date (2024-01-15)' },
  { value: 'YYYY-MM-DDTHH:mm:ssZ', label: 'ISO DateTime (2024-01-15T10:30:00Z)' },
  { value: 'MM/DD/YYYY', label: 'US Date (01/15/2024)' },
  { value: 'DD/MM/YYYY', label: 'EU Date (15/01/2024)' },
  { value: 'DD MMM YYYY', label: 'Short (15 Jan 2024)' },
  { value: 'DD MMM YYYY, HH:mm:ss', label: 'Full (15 Jan 2024, 10:30:00)' },
] as const

/**
 * Column types that require special handling during export
 */
export const SPECIAL_COLUMN_TYPES = {
  /** JSON/JSONB columns need stringification */
  JSON_TYPES: ['json', 'jsonb'],
  /** Date/time columns need formatting */
  DATE_TYPES: ['date', 'time', 'timestamp', 'timestamptz', 'timetz'],
  /** Array columns need special handling */
  ARRAY_TYPES: ['_int4', '_int8', '_text', '_varchar', '_uuid'],
  /** Binary columns should be base64 encoded */
  BINARY_TYPES: ['bytea'],
  /** Geometry columns need WKT conversion */
  GEOMETRY_TYPES: ['geometry', 'geography'],
} as const

/**
 * Export status labels for UI
 */
export const EXPORT_STATUS_LABELS: Record<string, string> = {
  idle: 'Ready to export',
  preparing: 'Preparing export...',
  fetching: 'Fetching data...',
  processing: 'Processing data...',
  complete: 'Export complete',
  error: 'Export failed',
  cancelled: 'Export cancelled',
}

/**
 * Export status colors for UI
 */
export const EXPORT_STATUS_COLORS: Record<string, string> = {
  idle: 'gray',
  preparing: 'blue',
  fetching: 'blue',
  processing: 'blue',
  complete: 'green',
  error: 'red',
  cancelled: 'yellow',
}

/**
 * Performance thresholds for export warnings
 */
export const PERFORMANCE_THRESHOLDS = {
  /** Rows above this may cause slowdown */
  SLOW_EXPORT_ROWS: 10000,
  /** Rows above this may cause browser issues */
  RISKY_EXPORT_ROWS: 50000,
  /** Rows above this should show strong warning */
  DANGEROUS_EXPORT_ROWS: 100000,
  /** Estimated rows per second for duration calculation */
  ESTIMATED_ROWS_PER_SECOND: 1000,
} as const
