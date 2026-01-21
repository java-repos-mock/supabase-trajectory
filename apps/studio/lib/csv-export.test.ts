import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  loadExportSettings,
  saveExportSettings,
  formatDateForExport,
  getExportRange,
  rowsToCsv,
  generateExportFilename,
  wrapExportQueryWithRole,
  estimateCsvSize,
} from './csv-export'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('csv-export', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('loadExportSettings', () => {
    it('should return default settings when nothing stored', () => {
      const settings = loadExportSettings()

      expect(settings).toEqual({
        defaultBatchSize: 1000,
        includeHeaders: true,
        dateFormat: 'YYYY-MM-DDTHH:mm:ssZ',
      })
    })

    it('should return stored settings', () => {
      const storedSettings = {
        defaultBatchSize: 500,
        includeHeaders: false,
        dateFormat: 'DD/MM/YYYY',
      }
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(storedSettings))

      const settings = loadExportSettings()

      expect(settings).toEqual(storedSettings)
    })

    it('should handle invalid JSON gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json')

      const settings = loadExportSettings()

      expect(settings.defaultBatchSize).toBe(1000)
    })
  })

  describe('saveExportSettings', () => {
    it('should merge with existing settings', () => {
      const existing = {
        defaultBatchSize: 1000,
        includeHeaders: true,
        dateFormat: 'YYYY-MM-DD',
      }
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(existing))

      saveExportSettings({ includeHeaders: false })

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'supabase.csv-export.settings',
        expect.stringContaining('"includeHeaders":false')
      )
    })
  })

  describe('formatDateForExport', () => {
    it('should format Date objects', () => {
      const date = new Date('2024-06-15T10:30:00Z')
      const result = formatDateForExport(date, 'YYYY-MM-DD')

      expect(result).toBe('2024-06-15')
    })

    it('should format ISO strings', () => {
      const result = formatDateForExport('2024-06-15T10:30:00Z', 'DD/MM/YYYY')

      expect(result).toBe('15/06/2024')
    })

    it('should use default format when not specified', () => {
      const result = formatDateForExport('2024-06-15T10:30:00Z')

      expect(result).toContain('2024-06-15')
    })
  })

  describe('getExportRange', () => {
    it('should calculate range for first page', () => {
      const range = getExportRange(0, 1000)

      expect(range).toEqual({ from: 0, to: 1000 })
    })

    it('should calculate range for subsequent pages', () => {
      const range = getExportRange(2, 1000)

      expect(range).toEqual({ from: 2000, to: 3000 })
    })

    it('should handle custom batch sizes', () => {
      const range = getExportRange(1, 500)

      expect(range).toEqual({ from: 500, to: 1000 })
    })
  })

  describe('rowsToCsv', () => {
    it('should convert rows to CSV with headers', () => {
      const rows = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]

      const csv = rowsToCsv(rows, { includeHeaders: true })

      expect(csv).toContain('id,name')
      expect(csv).toContain('1,Alice')
      expect(csv).toContain('2,Bob')
    })

    it('should convert rows without headers', () => {
      const rows = [{ id: 1, name: 'Alice' }]

      const csv = rowsToCsv(rows, { includeHeaders: false })

      expect(csv).not.toContain('id,name')
      expect(csv).toContain('1,Alice')
    })

    it('should escape special characters', () => {
      const rows = [{ name: 'O\'Brien, "Junior"' }]

      const csv = rowsToCsv(rows)

      // Papa should handle escaping
      expect(csv).toContain('O\'Brien')
    })

    it('should handle null values', () => {
      const rows = [{ id: 1, name: null }]

      const csv = rowsToCsv(rows)

      expect(csv).toContain('1,')
    })

    it('should stringify JSON objects', () => {
      const rows = [{ id: 1, metadata: { key: 'value' } }]

      const csv = rowsToCsv(rows)

      expect(csv).toContain('{"key":"value"}')
    })

    it('should export specific columns', () => {
      const rows = [{ id: 1, name: 'Alice', email: 'alice@test.com' }]

      const csv = rowsToCsv(rows, { columns: ['id', 'name'] })

      expect(csv).toContain('id,name')
      expect(csv).not.toContain('email')
    })
  })

  describe('generateExportFilename', () => {
    it('should generate filename with timestamp', () => {
      const filename = generateExportFilename('users')

      expect(filename).toMatch(/^users_\d{8}_\d{6}\.csv$/)
    })

    it('should include schema prefix for non-public schemas', () => {
      const filename = generateExportFilename('users', 'auth')

      expect(filename).toMatch(/^auth_users_\d{8}_\d{6}\.csv$/)
    })

    it('should not include schema prefix for public schema', () => {
      const filename = generateExportFilename('users', 'public')

      expect(filename).not.toContain('public_')
    })
  })

  describe('wrapExportQueryWithRole', () => {
    it('should return unchanged SQL when no role specified', () => {
      const sql = 'SELECT * FROM users'

      const result = wrapExportQueryWithRole(sql)

      expect(result).toBe(sql)
    })

    it('should wrap SQL with role statement', () => {
      const sql = 'SELECT * FROM users'

      const result = wrapExportQueryWithRole(sql, 'readonly')

      expect(result).toContain("SET LOCAL ROLE 'readonly'")
      expect(result).toContain('SELECT * FROM users')
    })
  })

  describe('estimateCsvSize', () => {
    it('should estimate size based on sample row', () => {
      const sampleRow = { id: 1, name: 'Test', email: 'test@example.com' }

      const size = estimateCsvSize(sampleRow, 1000)

      // Should be roughly sample size * 1000 * 1.05
      expect(size).toBeGreaterThan(0)
      expect(size).toBeLessThan(100000) // Sanity check
    })

    it('should handle empty row', () => {
      const size = estimateCsvSize({}, 100)

      expect(size).toBeGreaterThan(0)
    })
  })
})
