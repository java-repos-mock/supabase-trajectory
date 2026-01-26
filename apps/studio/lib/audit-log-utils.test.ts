import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  AUDIT_CATEGORIES,
  AUDIT_ACTIONS,
  createAuditEntry,
  getCategoryFromAction,
  formatAuditTimestamp,
  formatAuditTimestampRelative,
  getActionDescription,
  filterAuditLogs,
  groupAuditLogsByDate,
  generateAuditId,
  serializeAuditEntry,
  deserializeAuditEntry,
  getActionSeverity,
  exportAuditLogsToCSV,
  AuditLogEntry,
} from './audit-log-utils'

describe('audit-log-utils', () => {
  describe('AUDIT_CATEGORIES', () => {
    it('should have all expected categories', () => {
      expect(AUDIT_CATEGORIES.AUTH).toBe('auth')
      expect(AUDIT_CATEGORIES.DATABASE).toBe('database')
      expect(AUDIT_CATEGORIES.STORAGE).toBe('storage')
      expect(AUDIT_CATEGORIES.SETTINGS).toBe('settings')
      expect(AUDIT_CATEGORIES.TEAM).toBe('team')
    })
  })

  describe('AUDIT_ACTIONS', () => {
    it('should have auth actions', () => {
      expect(AUDIT_ACTIONS.LOGIN).toBe('auth.login')
      expect(AUDIT_ACTIONS.LOGOUT).toBe('auth.logout')
    })

    it('should have database actions', () => {
      expect(AUDIT_ACTIONS.TABLE_CREATE).toBe('database.table.create')
      expect(AUDIT_ACTIONS.ROW_INSERT).toBe('database.row.insert')
    })

    it('should have storage actions', () => {
      expect(AUDIT_ACTIONS.BUCKET_CREATE).toBe('storage.bucket.create')
      expect(AUDIT_ACTIONS.OBJECT_UPLOAD).toBe('storage.object.upload')
    })
  })

  describe('createAuditEntry', () => {
    it('should create entry with timestamp', () => {
      const entry = createAuditEntry(AUDIT_ACTIONS.LOGIN, 'user123')
      
      expect(entry.action).toBe(AUDIT_ACTIONS.LOGIN)
      expect(entry.userId).toBe('user123')
      expect(entry.category).toBe(AUDIT_CATEGORIES.AUTH)
      expect(entry.timestamp).toBeDefined()
    })

    it('should include optional fields', () => {
      const entry = createAuditEntry(AUDIT_ACTIONS.TABLE_CREATE, 'user123', {
        projectRef: 'proj123',
        targetName: 'users',
        ipAddress: '192.168.1.1',
      })
      
      expect(entry.projectRef).toBe('proj123')
      expect(entry.targetName).toBe('users')
      expect(entry.ipAddress).toBe('192.168.1.1')
    })

    it('should use ISO timestamp format', () => {
      const entry = createAuditEntry(AUDIT_ACTIONS.LOGIN, 'user123')
      
      // Should be valid ISO string
      expect(() => new Date(entry.timestamp)).not.toThrow()
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('getCategoryFromAction', () => {
    it('should return correct category for auth actions', () => {
      expect(getCategoryFromAction(AUDIT_ACTIONS.LOGIN)).toBe(AUDIT_CATEGORIES.AUTH)
      expect(getCategoryFromAction(AUDIT_ACTIONS.LOGOUT)).toBe(AUDIT_CATEGORIES.AUTH)
    })

    it('should return correct category for database actions', () => {
      expect(getCategoryFromAction(AUDIT_ACTIONS.TABLE_CREATE)).toBe(AUDIT_CATEGORIES.DATABASE)
      expect(getCategoryFromAction(AUDIT_ACTIONS.ROW_INSERT)).toBe(AUDIT_CATEGORIES.DATABASE)
    })

    it('should return correct category for storage actions', () => {
      expect(getCategoryFromAction(AUDIT_ACTIONS.BUCKET_CREATE)).toBe(AUDIT_CATEGORIES.STORAGE)
    })

    it('should default to settings for unknown prefixes', () => {
      expect(getCategoryFromAction('unknown.action' as any)).toBe(AUDIT_CATEGORIES.SETTINGS)
    })
  })

  describe('formatAuditTimestamp', () => {
    it('should format ISO timestamp', () => {
      const result = formatAuditTimestamp('2024-06-15T10:30:00Z')
      expect(result).toContain('2024')
      expect(result).toContain('Jun')
    })
  })

  describe('formatAuditTimestampRelative', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return "Just now" for recent timestamps', () => {
      vi.setSystemTime(new Date('2024-06-15T10:30:00Z'))
      const result = formatAuditTimestampRelative('2024-06-15T10:30:00Z')
      expect(result).toBe('Just now')
    })

    it('should return minutes ago', () => {
      vi.setSystemTime(new Date('2024-06-15T10:35:00Z'))
      const result = formatAuditTimestampRelative('2024-06-15T10:30:00Z')
      expect(result).toBe('5 minutes ago')
    })

    it('should return hours ago', () => {
      vi.setSystemTime(new Date('2024-06-15T13:30:00Z'))
      const result = formatAuditTimestampRelative('2024-06-15T10:30:00Z')
      expect(result).toBe('3 hours ago')
    })

    it('should return days ago', () => {
      vi.setSystemTime(new Date('2024-06-18T10:30:00Z'))
      const result = formatAuditTimestampRelative('2024-06-15T10:30:00Z')
      expect(result).toBe('3 days ago')
    })
  })

  describe('getActionDescription', () => {
    it('should return human-readable descriptions', () => {
      expect(getActionDescription(AUDIT_ACTIONS.LOGIN)).toBe('Signed in')
      expect(getActionDescription(AUDIT_ACTIONS.TABLE_CREATE)).toBe('Created table')
      expect(getActionDescription(AUDIT_ACTIONS.BUCKET_DELETE)).toBe('Deleted bucket')
    })
  })

  describe('filterAuditLogs', () => {
    const mockLogs: AuditLogEntry[] = [
      {
        id: '1',
        timestamp: '2024-06-15T10:00:00Z',
        action: AUDIT_ACTIONS.LOGIN,
        category: AUDIT_CATEGORIES.AUTH,
        userId: 'user1',
        userEmail: 'user1@test.com',
      },
      {
        id: '2',
        timestamp: '2024-06-15T11:00:00Z',
        action: AUDIT_ACTIONS.TABLE_CREATE,
        category: AUDIT_CATEGORIES.DATABASE,
        userId: 'user1',
        projectRef: 'proj1',
        targetName: 'users',
      },
      {
        id: '3',
        timestamp: '2024-06-16T10:00:00Z',
        action: AUDIT_ACTIONS.BUCKET_CREATE,
        category: AUDIT_CATEGORIES.STORAGE,
        userId: 'user2',
        projectRef: 'proj1',
      },
    ]

    it('should filter by category', () => {
      const result = filterAuditLogs(mockLogs, { categories: [AUDIT_CATEGORIES.AUTH] })
      expect(result).toHaveLength(1)
      expect(result[0].action).toBe(AUDIT_ACTIONS.LOGIN)
    })

    it('should filter by action', () => {
      const result = filterAuditLogs(mockLogs, { actions: [AUDIT_ACTIONS.TABLE_CREATE] })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('2')
    })

    it('should filter by userId', () => {
      const result = filterAuditLogs(mockLogs, { userId: 'user2' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('3')
    })

    it('should filter by projectRef', () => {
      const result = filterAuditLogs(mockLogs, { projectRef: 'proj1' })
      expect(result).toHaveLength(2)
    })

    it('should filter by date range', () => {
      const result = filterAuditLogs(mockLogs, {
        startDate: new Date('2024-06-15T10:30:00Z'),
        endDate: new Date('2024-06-15T23:59:59Z'),
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('2')
    })

    it('should filter by search term', () => {
      const result = filterAuditLogs(mockLogs, { searchTerm: 'users' })
      expect(result).toHaveLength(1)
      expect(result[0].targetName).toBe('users')
    })

    it('should combine multiple filters', () => {
      const result = filterAuditLogs(mockLogs, {
        categories: [AUDIT_CATEGORIES.DATABASE, AUDIT_CATEGORIES.STORAGE],
        projectRef: 'proj1',
      })
      expect(result).toHaveLength(2)
    })
  })

  describe('groupAuditLogsByDate', () => {
    it('should group logs by date', () => {
      const logs: AuditLogEntry[] = [
        { id: '1', timestamp: '2024-06-15T10:00:00Z', action: AUDIT_ACTIONS.LOGIN, category: AUDIT_CATEGORIES.AUTH, userId: 'u1' },
        { id: '2', timestamp: '2024-06-15T14:00:00Z', action: AUDIT_ACTIONS.LOGOUT, category: AUDIT_CATEGORIES.AUTH, userId: 'u1' },
        { id: '3', timestamp: '2024-06-16T10:00:00Z', action: AUDIT_ACTIONS.LOGIN, category: AUDIT_CATEGORIES.AUTH, userId: 'u1' },
      ]

      const groups = groupAuditLogsByDate(logs)
      
      expect(Object.keys(groups)).toHaveLength(2)
    })
  })

  describe('generateAuditId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateAuditId()
      const id2 = generateAuditId()
      
      expect(id1).not.toBe(id2)
    })

    it('should start with audit_ prefix', () => {
      const id = generateAuditId()
      expect(id).toMatch(/^audit_/)
    })
  })

  describe('serializeAuditEntry and deserializeAuditEntry', () => {
    it('should serialize and deserialize correctly', () => {
      const entry: AuditLogEntry = {
        id: 'test1',
        timestamp: '2024-06-15T10:00:00Z',
        action: AUDIT_ACTIONS.LOGIN,
        category: AUDIT_CATEGORIES.AUTH,
        userId: 'user1',
      }

      const serialized = serializeAuditEntry(entry)
      const deserialized = deserializeAuditEntry(serialized)

      expect(deserialized).toEqual(entry)
    })

    it('should handle invalid JSON', () => {
      const result = deserializeAuditEntry('invalid json')
      expect(result).toBeNull()
    })
  })

  describe('getActionSeverity', () => {
    it('should return critical for delete actions', () => {
      expect(getActionSeverity(AUDIT_ACTIONS.TABLE_DELETE)).toBe('critical')
      expect(getActionSeverity(AUDIT_ACTIONS.BUCKET_DELETE)).toBe('critical')
      expect(getActionSeverity(AUDIT_ACTIONS.MEMBER_REMOVE)).toBe('critical')
    })

    it('should return warning for sensitive updates', () => {
      expect(getActionSeverity(AUDIT_ACTIONS.PASSWORD_CHANGE)).toBe('warning')
      expect(getActionSeverity(AUDIT_ACTIONS.MFA_DISABLE)).toBe('warning')
      expect(getActionSeverity(AUDIT_ACTIONS.ROLE_CHANGE)).toBe('warning')
    })

    it('should return info for normal actions', () => {
      expect(getActionSeverity(AUDIT_ACTIONS.LOGIN)).toBe('info')
      expect(getActionSeverity(AUDIT_ACTIONS.TABLE_CREATE)).toBe('info')
    })
  })

  describe('exportAuditLogsToCSV', () => {
    it('should export logs to CSV format', () => {
      const logs: AuditLogEntry[] = [
        {
          id: '1',
          timestamp: '2024-06-15T10:30:00Z',
          action: AUDIT_ACTIONS.LOGIN,
          category: AUDIT_CATEGORIES.AUTH,
          userId: 'user1',
          userEmail: 'user@test.com',
          ipAddress: '192.168.1.1',
        },
      ]

      const csv = exportAuditLogsToCSV(logs)
      
      expect(csv).toContain('Timestamp')
      expect(csv).toContain('Action')
      expect(csv).toContain('Signed in')
      expect(csv).toContain('user@test.com')
    })

    it('should include headers', () => {
      const csv = exportAuditLogsToCSV([])
      expect(csv).toContain('Timestamp,Action,Category,User,Target,IP Address')
    })
  })
})
