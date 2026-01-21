/**
 * Type definitions for table export functionality
 */

/**
 * Supported export formats
 */
export type ExportFormat = 'csv' | 'json' | 'xlsx'

/**
 * Column configuration for selective export
 */
export interface ExportColumnConfig {
  /** Column name in the source data */
  name: string
  /** Display name for the column header */
  displayName?: string
  /** Custom formatter function */
  formatter?: (value: any) => string
  /** Whether to include this column */
  include?: boolean
  /** Column width (for xlsx) */
  width?: number
}

/**
 * Filter configuration for export
 */
export interface ExportFilter {
  column: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is'
  value: any
}

/**
 * Sort configuration for export
 */
export interface ExportSort {
  column: string
  direction: 'asc' | 'desc'
  nullsFirst?: boolean
}

/**
 * Export job status
 */
export type ExportStatus = 
  | 'idle'
  | 'preparing'
  | 'fetching'
  | 'processing'
  | 'complete'
  | 'error'
  | 'cancelled'

/**
 * Export options interface
 */
export interface ExportOptions {
  /** Output format */
  format: ExportFormat
  /** Include column headers in output */
  includeHeaders?: boolean
  /** Date format string (dayjs compatible) */
  dateFormat?: string
  /** Number of rows to fetch per batch */
  batchSize?: number
  /** Maximum rows to export (safety limit) */
  maxRows?: number
  /** Specific columns to export */
  columns?: ExportColumnConfig[]
  /** Filters to apply before export */
  filters?: ExportFilter[]
  /** Sort order for exported data */
  sorts?: ExportSort[]
  /** Progress callback */
  onProgress?: (progress: ExportProgress) => void
  /** Status change callback */
  onStatusChange?: (status: ExportStatus) => void
}

/**
 * Export progress tracking
 */
export interface ExportProgress {
  /** Number of rows exported so far */
  exported: number
  /** Total rows to export */
  total: number
  /** Completion percentage (0-100) */
  percentage: number
  /** Current batch number (1-indexed) */
  currentBatch: number
  /** Total number of batches */
  totalBatches: number
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number
  /** Current export status */
  status: ExportStatus
}

/**
 * Export result
 */
export interface ExportResult {
  /** Whether export completed successfully */
  success: boolean
  /** The exported data as a string */
  data?: string
  /** Generated filename */
  filename?: string
  /** Number of rows exported */
  rowCount?: number
  /** Error message if failed */
  error?: string
  /** ISO timestamp when export completed */
  exportedAt?: string
  /** Export duration in milliseconds */
  durationMs?: number
  /** Approximate file size in bytes */
  sizeBytes?: number
}

/**
 * Persisted export settings
 */
export interface ExportSettings {
  /** Default export format */
  defaultFormat: ExportFormat
  /** Default batch size */
  defaultBatchSize: number
  /** Whether to include headers by default */
  includeHeaders: boolean
  /** Default date format */
  defaultDateFormat?: string
  /** Last exported table name */
  lastExportedTable?: string
  /** Recently used column configurations */
  recentColumnConfigs?: Record<string, ExportColumnConfig[]>
}

/**
 * Export job configuration
 */
export interface ExportJob {
  /** Unique job identifier */
  id: string
  /** Table being exported */
  tableName: string
  /** Schema name */
  schemaName: string
  /** Project reference */
  projectRef: string
  /** Export options */
  options: ExportOptions
  /** Job status */
  status: ExportStatus
  /** Job progress */
  progress?: ExportProgress
  /** Job result */
  result?: ExportResult
  /** When the job was created */
  createdAt: string
  /** When the job started */
  startedAt?: string
  /** When the job completed */
  completedAt?: string
}

/**
 * Export validation result
 */
export interface ExportValidation {
  /** Whether the export configuration is valid */
  valid: boolean
  /** Validation error messages */
  errors: string[]
  /** Validation warnings */
  warnings: string[]
  /** Estimated export size in bytes */
  estimatedSize?: number
  /** Estimated duration in seconds */
  estimatedDuration?: number
}

/**
 * Table metadata for export
 */
export interface ExportTableMetadata {
  /** Table name */
  name: string
  /** Schema name */
  schema: string
  /** Total row count */
  rowCount: number
  /** Column definitions */
  columns: ExportColumnDefinition[]
  /** Primary key columns */
  primaryKey?: string[]
  /** Whether table has RLS enabled */
  rlsEnabled?: boolean
}

/**
 * Column definition for export metadata
 */
export interface ExportColumnDefinition {
  /** Column name */
  name: string
  /** PostgreSQL data type */
  dataType: string
  /** Whether column is nullable */
  isNullable: boolean
  /** Default value expression */
  defaultValue?: string
  /** Whether this is a primary key column */
  isPrimaryKey?: boolean
  /** Whether this is a foreign key column */
  isForeignKey?: boolean
  /** Maximum length for string types */
  maxLength?: number
}
