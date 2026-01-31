import { useState, useCallback, useMemo } from 'react'
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { useTableRowsQuery } from 'data/table-rows/table-rows-query'
import {
  Button,
  Modal,
  RadioGroupCard,
  RadioGroupCardItem,
  Checkbox,
  Label,
  Select,
} from 'ui'

export type ExportFormat = 'csv' | 'json'

export interface ExportDataModalProps {
  visible: boolean
  tableName: string
  schema: string
  selectedRowIds?: Set<number>
  onClose: () => void
}

interface ExportOptions {
  format: ExportFormat
  includeHeaders: boolean
  selectedOnly: boolean
  dateFormat: 'iso' | 'readable' | 'timestamp'
  nullValue: string
}

const DATE_FORMAT_OPTIONS = [
  { value: 'iso', label: 'ISO 8601 (2024-01-15T10:30:00Z)' },
  { value: 'readable', label: 'Human Readable (Jan 15, 2024 10:30 AM)' },
  { value: 'timestamp', label: 'Unix Timestamp (1705315800)' },
] as const

/**
 * Modal for exporting table data to various formats.
 * 
 * Supports CSV and JSON export with configurable options for
 * date formatting, null handling, and row selection.
 */
export function ExportDataModal({
  visible,
  tableName,
  schema,
  selectedRowIds,
  onClose,
}: ExportDataModalProps) {
  const { ref: projectRef } = useParams()
  
  const [isExporting, setIsExporting] = useState(false)
  const [options, setOptions] = useState<ExportOptions>({
    format: 'csv',
    includeHeaders: true,
    selectedOnly: false,
    dateFormat: 'readable',
    nullValue: '',
  })

  // Fetch table data for export
  const { data: tableData, isLoading } = useTableRowsQuery(
    {
      projectRef,
      connectionString: undefined,
      tableId: undefined, // Will be provided by parent
    },
    { enabled: visible }
  )

  const rows = useMemo(() => {
    if (!tableData?.rows) return []
    if (options.selectedOnly && selectedRowIds?.size) {
      return tableData.rows.filter((_, idx) => selectedRowIds.has(idx))
    }
    return tableData.rows
  }, [tableData?.rows, options.selectedOnly, selectedRowIds])

  // Format a value for export based on type and options
  const formatValue = useCallback((value: any, options: ExportOptions): string => {
    if (value === null || value === undefined) {
      return options.nullValue
    }

    // Handle date/timestamp values
    if (value instanceof Date || (typeof value === 'string' && isISODateString(value))) {
      const date = value instanceof Date ? value : new Date(value)
      
      switch (options.dateFormat) {
        case 'iso':
          return date.toISOString()
        case 'readable':
          // Format dates for human readability using local timezone
          // This makes the exported data easier to read in spreadsheets
          return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        case 'timestamp':
          return Math.floor(date.getTime() / 1000).toString()
        default:
          return date.toISOString()
      }
    }

    // Handle arrays and objects
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }

    return String(value)
  }, [])

  // Check if a string looks like an ISO date
  const isISODateString = (str: string): boolean => {
    if (typeof str !== 'string') return false
    // Match common PostgreSQL timestamp formats
    return /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}:\d{2}/.test(str)
  }

  // Generate CSV content
  const generateCSV = useCallback((rows: any[], columns: string[]): string => {
    const lines: string[] = []

    if (options.includeHeaders) {
      lines.push(columns.map(col => escapeCSVField(col)).join(','))
    }

    for (const row of rows) {
      const values = columns.map(col => {
        const formatted = formatValue(row[col], options)
        return escapeCSVField(formatted)
      })
      lines.push(values.join(','))
    }

    return lines.join('\n')
  }, [options, formatValue])

  // Generate JSON content
  const generateJSON = useCallback((rows: any[], columns: string[]): string => {
    const processed = rows.map(row => {
      const obj: Record<string, any> = {}
      for (const col of columns) {
        const value = row[col]
        
        // For JSON, keep dates as ISO strings but apply null handling
        if (value === null || value === undefined) {
          obj[col] = options.nullValue === '' ? null : options.nullValue
        } else if (typeof value === 'string' && isISODateString(value)) {
          // Apply date formatting for JSON as well
          const date = new Date(value)
          switch (options.dateFormat) {
            case 'readable':
              obj[col] = date.toLocaleString('en-US')
              break
            case 'timestamp':
              obj[col] = Math.floor(date.getTime() / 1000)
              break
            default:
              obj[col] = value
          }
        } else {
          obj[col] = value
        }
      }
      return obj
    })

    return JSON.stringify(processed, null, 2)
  }, [options])

  // Escape a field for CSV format
  const escapeCSVField = (field: string): string => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`
    }
    return field
  }

  // Trigger download
  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  // Handle export
  const handleExport = useCallback(async () => {
    if (!rows.length) {
      toast.error('No data to export')
      return
    }

    setIsExporting(true)

    try {
      const columns = Object.keys(rows[0])
      let content: string
      let filename: string
      let mimeType: string

      if (options.format === 'csv') {
        content = generateCSV(rows, columns)
        filename = `${tableName}_export_${Date.now()}.csv`
        mimeType = 'text/csv;charset=utf-8'
      } else {
        content = generateJSON(rows, columns)
        filename = `${tableName}_export_${Date.now()}.json`
        mimeType = 'application/json'
      }

      downloadFile(content, filename, mimeType)
      toast.success(`Exported ${rows.length} rows to ${options.format.toUpperCase()}`)
      onClose()
    } catch (error) {
      toast.error('Failed to export data')
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }, [rows, tableName, options, generateCSV, generateJSON, downloadFile, onClose])

  const hasSelection = selectedRowIds && selectedRowIds.size > 0

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      header="Export Table Data"
      size="medium"
      customFooter={
        <div className="flex items-center justify-end gap-2">
          <Button type="default" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            type="primary"
            onClick={handleExport}
            disabled={isExporting || isLoading || !rows.length}
            icon={isExporting ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
          >
            {isExporting ? 'Exporting...' : `Export ${rows.length} rows`}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 py-4">
        {/* Format Selection */}
        <div className="space-y-3">
          <Label>Export Format</Label>
          <RadioGroupCard
            value={options.format}
            onValueChange={(value) => setOptions(prev => ({ ...prev, format: value as ExportFormat }))}
          >
            <RadioGroupCardItem
              value="csv"
              label="CSV"
              description="Comma-separated values, compatible with Excel"
              icon={<FileSpreadsheet size={20} />}
            />
            <RadioGroupCardItem
              value="json"
              label="JSON"
              description="JavaScript Object Notation, for APIs and scripts"
              icon={<FileJson size={20} />}
            />
          </RadioGroupCard>
        </div>

        {/* Date Format */}
        <div className="space-y-2">
          <Label>Date Format</Label>
          <Select
            value={options.dateFormat}
            onChange={(e) => setOptions(prev => ({ ...prev, dateFormat: e.target.value as any }))}
          >
            {DATE_FORMAT_OPTIONS.map(opt => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
          <p className="text-xs text-foreground-light">
            How timestamp columns should be formatted in the export
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <Label>Options</Label>
          
          {options.format === 'csv' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="includeHeaders"
                checked={options.includeHeaders}
                onCheckedChange={(checked) => 
                  setOptions(prev => ({ ...prev, includeHeaders: checked as boolean }))
                }
              />
              <label htmlFor="includeHeaders" className="text-sm">
                Include column headers
              </label>
            </div>
          )}

          {hasSelection && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="selectedOnly"
                checked={options.selectedOnly}
                onCheckedChange={(checked) => 
                  setOptions(prev => ({ ...prev, selectedOnly: checked as boolean }))
                }
              />
              <label htmlFor="selectedOnly" className="text-sm">
                Export selected rows only ({selectedRowIds?.size} selected)
              </label>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="rounded border border-default bg-surface-100 p-3">
          <p className="text-sm text-foreground-light">
            {isLoading ? (
              'Loading table data...'
            ) : (
              <>
                Ready to export <strong>{rows.length}</strong> rows from{' '}
                <strong>{schema}.{tableName}</strong> as {options.format.toUpperCase()}
              </>
            )}
          </p>
        </div>
      </div>
    </Modal>
  )
}
