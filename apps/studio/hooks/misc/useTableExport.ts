/**
 * React hook for table export functionality
 * 
 * Provides a convenient interface for exporting table data with
 * progress tracking, cancellation support, and error handling.
 */

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  downloadExport,
  estimateExportSize,
  exportTableData,
  generateExportFilename,
  loadExportSettings,
  saveExportSettings,
} from 'lib/table-export'
import type {
  ExportFormat,
  ExportJob,
  ExportOptions,
  ExportProgress,
  ExportResult,
  ExportStatus,
  ExportValidation,
} from 'lib/table-export.types'

// Maximum file size warning threshold (100MB)
const SIZE_WARNING_THRESHOLD = 100 * 1024 * 1024

// Maximum recommended rows for browser export
const MAX_RECOMMENDED_ROWS = 50000

/**
 * Hook options
 */
interface UseTableExportOptions {
  /** Project reference */
  projectRef: string
  /** Table name */
  tableName: string
  /** Schema name */
  schemaName?: string
  /** Function to fetch a batch of rows */
  fetchBatch: (from: number, to: number) => Promise<Record<string, any>[]>
  /** Function to get total row count */
  getTotalRows: () => Promise<number>
  /** Callback when export completes */
  onComplete?: (result: ExportResult) => void
  /** Callback when export fails */
  onError?: (error: Error) => void
}

/**
 * Hook return type
 */
interface UseTableExportReturn {
  /** Current export status */
  status: ExportStatus
  /** Current export progress */
  progress: ExportProgress | null
  /** Last export result */
  result: ExportResult | null
  /** Whether an export is in progress */
  isExporting: boolean
  /** Start an export */
  startExport: (options: Partial<ExportOptions>) => Promise<void>
  /** Cancel the current export */
  cancelExport: () => void
  /** Download the last successful export */
  downloadLastExport: () => void
  /** Validate export options */
  validateExport: (options: Partial<ExportOptions>) => Promise<ExportValidation>
  /** Get saved export settings */
  settings: ReturnType<typeof loadExportSettings>
  /** Update export settings */
  updateSettings: typeof saveExportSettings
}

/**
 * Custom hook for managing table exports
 */
export function useTableExport({
  projectRef,
  tableName,
  schemaName = 'public',
  fetchBatch,
  getTotalRows,
  onComplete,
  onError,
}: UseTableExportOptions): UseTableExportReturn {
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  
  const cancelledRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const settings = loadExportSettings()
  
  /**
   * Validate export options before starting
   */
  const validateExport = useCallback(
    async (options: Partial<ExportOptions>): Promise<ExportValidation> => {
      const errors: string[] = []
      const warnings: string[] = []
      
      try {
        const totalRows = await getTotalRows()
        const format = options.format || settings.defaultFormat
        const maxRows = options.maxRows || 100000
        
        const rowsToExport = Math.min(totalRows, maxRows)
        
        // Check row count limits
        if (rowsToExport > MAX_RECOMMENDED_ROWS) {
          warnings.push(
            `Exporting ${rowsToExport.toLocaleString()} rows may take a while and could cause browser performance issues.`
          )
        }
        
        if (totalRows > maxRows) {
          warnings.push(
            `Only the first ${maxRows.toLocaleString()} rows will be exported (table has ${totalRows.toLocaleString()} rows).`
          )
        }
        
        // Estimate size
        let estimatedSize: number | undefined
        try {
          const sampleRows = await fetchBatch(0, 1)
          if (sampleRows.length > 0) {
            estimatedSize = estimateExportSize(sampleRows[0], rowsToExport, format)
            
            if (estimatedSize > SIZE_WARNING_THRESHOLD) {
              warnings.push(
                `Estimated file size is ${formatBytes(estimatedSize)}. Large files may cause browser issues.`
              )
            }
          }
        } catch {
          warnings.push('Could not estimate export size.')
        }
        
        // Estimate duration (rough: ~1000 rows/second)
        const estimatedDuration = Math.ceil(rowsToExport / 1000)
        
        // Validate columns if specified
        if (options.columns && options.columns.length === 0) {
          errors.push('At least one column must be selected for export.')
        }
        
        return {
          valid: errors.length === 0,
          errors,
          warnings,
          estimatedSize,
          estimatedDuration,
        }
      } catch (error) {
        return {
          valid: false,
          errors: [error instanceof Error ? error.message : 'Validation failed'],
          warnings: [],
        }
      }
    },
    [fetchBatch, getTotalRows, settings.defaultFormat]
  )
  
  /**
   * Start the export process
   */
  const startExport = useCallback(
    async (options: Partial<ExportOptions>) => {
      if (status === 'fetching' || status === 'processing') {
        toast.error('An export is already in progress')
        return
      }
      
      cancelledRef.current = false
      abortControllerRef.current = new AbortController()
      
      const mergedOptions: ExportOptions = {
        format: options.format || settings.defaultFormat,
        includeHeaders: options.includeHeaders ?? settings.includeHeaders,
        batchSize: options.batchSize || settings.defaultBatchSize,
        dateFormat: options.dateFormat || settings.defaultDateFormat,
        maxRows: options.maxRows,
        columns: options.columns,
        onProgress: (p) => {
          if (!cancelledRef.current) {
            setProgress({ ...p, status: 'fetching' })
            options.onProgress?.(p)
          }
        },
        onStatusChange: (s) => {
          if (!cancelledRef.current) {
            setStatus(s)
            options.onStatusChange?.(s)
          }
        },
      }
      
      try {
        setStatus('preparing')
        setProgress(null)
        setResult(null)
        
        // Get total rows
        const totalRows = await getTotalRows()
        
        if (totalRows === 0) {
          toast.info('Table is empty, nothing to export')
          setStatus('idle')
          return
        }
        
        setStatus('fetching')
        
        // Perform the export
        const exportResult = await exportTableData(
          async (from, to) => {
            if (cancelledRef.current) {
              throw new Error('Export cancelled')
            }
            return fetchBatch(from, to)
          },
          tableName,
          totalRows,
          mergedOptions
        )
        
        if (cancelledRef.current) {
          setStatus('cancelled')
          return
        }
        
        setResult(exportResult)
        
        if (exportResult.success) {
          setStatus('complete')
          toast.success(`Exported ${exportResult.rowCount?.toLocaleString()} rows`)
          onComplete?.(exportResult)
          
          // Auto-download
          downloadExport(exportResult)
        } else {
          setStatus('error')
          toast.error(exportResult.error || 'Export failed')
          onError?.(new Error(exportResult.error || 'Export failed'))
        }
      } catch (error) {
        if (!cancelledRef.current) {
          setStatus('error')
          const errorMessage = error instanceof Error ? error.message : 'Export failed'
          toast.error(errorMessage)
          onError?.(error instanceof Error ? error : new Error(errorMessage))
        }
      }
    },
    [fetchBatch, getTotalRows, onComplete, onError, settings, status, tableName]
  )
  
  /**
   * Cancel the current export
   */
  const cancelExport = useCallback(() => {
    cancelledRef.current = true
    abortControllerRef.current?.abort()
    setStatus('cancelled')
    toast.info('Export cancelled')
  }, [])
  
  /**
   * Download the last successful export
   */
  const downloadLastExport = useCallback(() => {
    if (result?.success && result.data) {
      downloadExport(result)
    } else {
      toast.error('No export available to download')
    }
  }, [result])
  
  return {
    status,
    progress,
    result,
    isExporting: status === 'fetching' || status === 'processing',
    startExport,
    cancelExport,
    downloadLastExport,
    validateExport,
    settings,
    updateSettings: saveExportSettings,
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export default useTableExport
