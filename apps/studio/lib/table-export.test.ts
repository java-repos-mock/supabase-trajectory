import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import dayjs from 'dayjs'

import {
  downloadExport,
  estimateExportSize,
  ExportFormat,
  ExportProgress,
  ExportResult,
  exportTableData,
  formatExportDate,
  generateExportFilename,
  getExportRange,
  loadExportSettings,
  rowsToCSV,
  rowsToJSON,
  saveExportSettings,
} from './table-export'

describe('table-export', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getExportRange', () => {
    it('should calculate correct range for first page', () => {
      const range = getExportRange(0, 100)
      expect(range.from).toBe(0)
      expect(range.to).toBe(100)
    })

    it('should calculate correct range for subsequent pages', () => {
      const range = getExportRange(2, 100)
      expect(range.from).toBe(200)
      expect(range.to).toBe(300)
    })

    it('should handle different batch sizes', () => {
      const range = getExportRange(1, 500)
      expect(range.from).toBe(500)
      expect(range.to).toBe(1000)
    })
  })

  describe('formatExportDate', () => {
    it('should format dates using default format', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const formatted = formatExportDate(date)
      expect(formatted).toBeDefined()
      expect(typeof formatted).toBe('string')
    })

    it('should format dates using custom format', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const formatted = formatExportDate(date, 'YYYY-MM-DD')
      expect(formatted).toBe('2024-01-15')
    })

    it('should handle string dates', () => {
      const formatted = formatExportDate('2024-01-15', 'YYYY-MM-DD')
      expect(formatted).toBe('2024-01-15')
    })
  })

  describe('rowsToCSV', () => {
    const sampleRows = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ]

    it('should convert rows to CSV with headers', () => {
      const csv = rowsToCSV(sampleRows)
      expect(csv).toContain('id')
      expect(csv).toContain('name')
      expect(csv).toContain('Alice')
      expect(csv).toContain('Bob')
    })

    it('should convert rows to CSV without headers', () => {
      const csv = rowsToCSV(sampleRows, { includeHeaders: false })
      expect(csv).not.toMatch(/^id,name,email/)
      expect(csv).toContain('Alice')
    })

    it('should handle specific columns', () => {
      const csv = rowsToCSV(sampleRows, { columns: ['id', 'name'] })
      expect(csv).toContain('id')
      expect(csv).toContain('name')
      expect(csv).not.toContain('email')
    })

    it('should handle null values', () => {
      const rowsWithNull = [{ id: 1, name: null }]
      const csv = rowsToCSV(rowsWithNull)
      expect(csv).toContain('1')
    })

    it('should stringify objects', () => {
      const rowsWithObject = [{ id: 1, data: { nested: 'value' } }]
      const csv = rowsToCSV(rowsWithObject)
      expect(csv).toContain('nested')
    })
  })

  describe('rowsToJSON', () => {
    const sampleRows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]

    it('should convert rows to JSON', () => {
      const json = rowsToJSON(sampleRows)
      const parsed = JSON.parse(json)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].name).toBe('Alice')
    })

    it('should handle specific columns', () => {
      const json = rowsToJSON(sampleRows, { columns: ['name'] })
      const parsed = JSON.parse(json)
      expect(parsed[0]).toHaveProperty('name')
      expect(parsed[0]).not.toHaveProperty('id')
    })
  })

  describe('generateExportFilename', () => {
    it('should generate CSV filename with timestamp', () => {
      const filename = generateExportFilename('users', 'csv')
      expect(filename).toMatch(/^users_export_\d{8}_\d{6}\.csv$/)
    })

    it('should generate JSON filename with timestamp', () => {
      const filename = generateExportFilename('orders', 'json')
      expect(filename).toMatch(/^orders_export_\d{8}_\d{6}\.json$/)
    })
  })

  describe('saveExportSettings / loadExportSettings', () => {
    it('should save and load settings', () => {
      saveExportSettings({ defaultFormat: 'json', defaultBatchSize: 500 })
      const loaded = loadExportSettings()
      expect(loaded.defaultFormat).toBe('json')
      expect(loaded.defaultBatchSize).toBe(500)
    })

    it('should merge with existing settings', () => {
      saveExportSettings({ defaultFormat: 'csv' })
      saveExportSettings({ defaultBatchSize: 200 })
      const loaded = loadExportSettings()
      expect(loaded.defaultFormat).toBe('csv')
      expect(loaded.defaultBatchSize).toBe(200)
    })

    it('should return defaults when nothing saved', () => {
      const loaded = loadExportSettings()
      expect(loaded.defaultFormat).toBe('csv')
      expect(loaded.includeHeaders).toBe(true)
    })
  })

  describe('estimateExportSize', () => {
    it('should estimate CSV size', () => {
      const sampleRow = { id: 1, name: 'Test User', email: 'test@example.com' }
      const estimate = estimateExportSize(sampleRow, 1000, 'csv')
      expect(estimate).toBeGreaterThan(0)
    })

    it('should estimate JSON size with higher overhead', () => {
      const sampleRow = { id: 1, name: 'Test' }
      const csvEstimate = estimateExportSize(sampleRow, 1000, 'csv')
      const jsonEstimate = estimateExportSize(sampleRow, 1000, 'json')
      // JSON has 1.1 overhead vs CSV's 1.05
      expect(jsonEstimate).toBeGreaterThan(csvEstimate)
    })
  })

  describe('exportTableData', () => {
    const mockFetchBatch = vi.fn()

    beforeEach(() => {
      mockFetchBatch.mockReset()
    })

    it('should export data with progress callbacks', async () => {
      const mockRows = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `User ${i}` }))
      mockFetchBatch.mockResolvedValue(mockRows)

      const progressUpdates: ExportProgress[] = []
      
      const result = await exportTableData(
        mockFetchBatch,
        'users',
        50,
        {
          format: 'csv',
          batchSize: 50,
          onProgress: (progress) => progressUpdates.push(progress),
        }
      )

      expect(result.success).toBe(true)
      expect(result.rowCount).toBe(50)
      expect(result.filename).toMatch(/users_export_.*\.csv/)
      expect(progressUpdates.length).toBeGreaterThan(0)
    })

    it('should handle export errors gracefully', async () => {
      mockFetchBatch.mockRejectedValue(new Error('Network error'))

      const result = await exportTableData(
        mockFetchBatch,
        'users',
        100,
        { format: 'csv' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })

    it('should respect maxRows limit', async () => {
      const mockRows = Array.from({ length: 100 }, (_, i) => ({ id: i }))
      mockFetchBatch.mockResolvedValue(mockRows)

      const result = await exportTableData(
        mockFetchBatch,
        'users',
        1000, // Total rows
        {
          format: 'json',
          maxRows: 100, // But limit to 100
          batchSize: 100,
        }
      )

      expect(result.success).toBe(true)
      expect(result.rowCount).toBe(100)
    })
  })

  describe('downloadExport', () => {
    it('should throw for failed exports', () => {
      const failedResult: ExportResult = { success: false, error: 'Failed' }
      expect(() => downloadExport(failedResult)).toThrow()
    })

    it('should throw for exports without data', () => {
      const emptyResult: ExportResult = { success: true }
      expect(() => downloadExport(emptyResult)).toThrow()
    })
  })
})
