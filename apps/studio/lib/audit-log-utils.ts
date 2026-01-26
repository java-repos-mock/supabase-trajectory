/**
 * Audit Log Utilities
 * 
 * Provides helpers for creating, formatting, and filtering audit log entries.
 * Used for tracking user actions and system events in the dashboard.
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

import { DATETIME_FORMAT } from './constants'

// Enable timezone support
dayjs.extend(utc)
dayjs.extend(timezone)

// Audit log action categories
export const AUDIT_CATEGORIES = {
  AUTH: 'auth',
  DATABASE: 'database',
  STORAGE: 'storage',
  EDGE_FUNCTIONS: 'edge_functions',
  API: 'api',
  SETTINGS: 'settings',
  BILLING: 'billing',
  TEAM: 'team',
} as const

export type AuditCategory = typeof AUDIT_CATEGORIES[keyof typeof AUDIT_CATEGORIES]

// Specific audit actions
export const AUDIT_ACTIONS = {
  // Auth actions
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGE: 'auth.password_change',
  MFA_ENABLE: 'auth.mfa_enable',
  MFA_DISABLE: 'auth.mfa_disable',
  
  // Database actions
  TABLE_CREATE: 'database.table.create',
  TABLE_UPDATE: 'database.table.update',
  TABLE_DELETE: 'database.table.delete',
  COLUMN_CREATE: 'database.column.create',
  COLUMN_UPDATE: 'database.column.update',
  COLUMN_DELETE: 'database.column.delete',
  ROW_INSERT: 'database.row.insert',
  ROW_UPDATE: 'database.row.update',
  ROW_DELETE: 'database.row.delete',
  POLICY_CREATE: 'database.policy.create',
  POLICY_UPDATE: 'database.policy.update',
  POLICY_DELETE: 'database.policy.delete',
  
  // Storage actions
  BUCKET_CREATE: 'storage.bucket.create',
  BUCKET_UPDATE: 'storage.bucket.update',
  BUCKET_DELETE: 'storage.bucket.delete',
  OBJECT_UPLOAD: 'storage.object.upload',
  OBJECT_DELETE: 'storage.object.delete',
  
  // Settings actions
  PROJECT_UPDATE: 'settings.project.update',
  API_KEY_CREATE: 'settings.api_key.create',
  API_KEY_DELETE: 'settings.api_key.delete',
  
  // Team actions
  MEMBER_INVITE: 'team.member.invite',
  MEMBER_REMOVE: 'team.member.remove',
  ROLE_CHANGE: 'team.role.change',
} as const

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS]

// Audit log entry interface
export interface AuditLogEntry {
  id: string
  timestamp: string
  action: AuditAction
  category: AuditCategory
  userId: string
  userEmail?: string
  projectRef?: string
  organizationId?: string
  targetType?: string
  targetId?: string
  targetName?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

// Filter options for querying audit logs
export interface AuditLogFilter {
  startDate?: Date
  endDate?: Date
  categories?: AuditCategory[]
  actions?: AuditAction[]
  userId?: string
  projectRef?: string
  searchTerm?: string
}

/**
 * Creates a new audit log entry with the current timestamp
 */
export function createAuditEntry(
  action: AuditAction,
  userId: string,
  options: Partial<Omit<AuditLogEntry, 'id' | 'timestamp' | 'action' | 'category' | 'userId'>> = {}
): Omit<AuditLogEntry, 'id'> {
  const category = getCategoryFromAction(action)
  
  return {
    timestamp: new Date().toISOString(),
    action,
    category,
    userId,
    ...options,
  }
}

/**
 * Gets the category for an audit action
 */
export function getCategoryFromAction(action: AuditAction): AuditCategory {
  const prefix = action.split('.')[0]
  
  const categoryMap: Record<string, AuditCategory> = {
    auth: AUDIT_CATEGORIES.AUTH,
    database: AUDIT_CATEGORIES.DATABASE,
    storage: AUDIT_CATEGORIES.STORAGE,
    edge_functions: AUDIT_CATEGORIES.EDGE_FUNCTIONS,
    api: AUDIT_CATEGORIES.API,
    settings: AUDIT_CATEGORIES.SETTINGS,
    billing: AUDIT_CATEGORIES.BILLING,
    team: AUDIT_CATEGORIES.TEAM,
  }
  
  return categoryMap[prefix] || AUDIT_CATEGORIES.SETTINGS
}

/**
 * Formats an audit log timestamp for display
 */
export function formatAuditTimestamp(timestamp: string): string {
  return dayjs(timestamp).format(DATETIME_FORMAT)
}

/**
 * Formats an audit log timestamp with relative time
 */
export function formatAuditTimestampRelative(timestamp: string): string {
  const now = dayjs()
  const time = dayjs(timestamp)
  const diffMinutes = now.diff(time, 'minute')
  
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`
  
  const diffHours = now.diff(time, 'hour')
  if (diffHours < 24) return `${diffHours} hours ago`
  
  const diffDays = now.diff(time, 'day')
  if (diffDays < 7) return `${diffDays} days ago`
  
  return formatAuditTimestamp(timestamp)
}

/**
 * Gets a human-readable description for an audit action
 */
export function getActionDescription(action: AuditAction): string {
  const descriptions: Record<AuditAction, string> = {
    [AUDIT_ACTIONS.LOGIN]: 'Signed in',
    [AUDIT_ACTIONS.LOGOUT]: 'Signed out',
    [AUDIT_ACTIONS.PASSWORD_CHANGE]: 'Changed password',
    [AUDIT_ACTIONS.MFA_ENABLE]: 'Enabled MFA',
    [AUDIT_ACTIONS.MFA_DISABLE]: 'Disabled MFA',
    [AUDIT_ACTIONS.TABLE_CREATE]: 'Created table',
    [AUDIT_ACTIONS.TABLE_UPDATE]: 'Updated table',
    [AUDIT_ACTIONS.TABLE_DELETE]: 'Deleted table',
    [AUDIT_ACTIONS.COLUMN_CREATE]: 'Added column',
    [AUDIT_ACTIONS.COLUMN_UPDATE]: 'Updated column',
    [AUDIT_ACTIONS.COLUMN_DELETE]: 'Deleted column',
    [AUDIT_ACTIONS.ROW_INSERT]: 'Inserted row',
    [AUDIT_ACTIONS.ROW_UPDATE]: 'Updated row',
    [AUDIT_ACTIONS.ROW_DELETE]: 'Deleted row',
    [AUDIT_ACTIONS.POLICY_CREATE]: 'Created policy',
    [AUDIT_ACTIONS.POLICY_UPDATE]: 'Updated policy',
    [AUDIT_ACTIONS.POLICY_DELETE]: 'Deleted policy',
    [AUDIT_ACTIONS.BUCKET_CREATE]: 'Created bucket',
    [AUDIT_ACTIONS.BUCKET_UPDATE]: 'Updated bucket',
    [AUDIT_ACTIONS.BUCKET_DELETE]: 'Deleted bucket',
    [AUDIT_ACTIONS.OBJECT_UPLOAD]: 'Uploaded file',
    [AUDIT_ACTIONS.OBJECT_DELETE]: 'Deleted file',
    [AUDIT_ACTIONS.PROJECT_UPDATE]: 'Updated project settings',
    [AUDIT_ACTIONS.API_KEY_CREATE]: 'Created API key',
    [AUDIT_ACTIONS.API_KEY_DELETE]: 'Deleted API key',
    [AUDIT_ACTIONS.MEMBER_INVITE]: 'Invited team member',
    [AUDIT_ACTIONS.MEMBER_REMOVE]: 'Removed team member',
    [AUDIT_ACTIONS.ROLE_CHANGE]: 'Changed member role',
  }
  
  return descriptions[action] || action
}

/**
 * Filters audit logs based on criteria
 */
export function filterAuditLogs(
  logs: AuditLogEntry[],
  filter: AuditLogFilter
): AuditLogEntry[] {
  return logs.filter((log) => {
    // Filter by date range
    if (filter.startDate) {
      const logDate = new Date(log.timestamp)
      if (logDate < filter.startDate) return false
    }
    
    if (filter.endDate) {
      const logDate = new Date(log.timestamp)
      if (logDate > filter.endDate) return false
    }
    
    // Filter by categories
    if (filter.categories && filter.categories.length > 0) {
      if (!filter.categories.includes(log.category)) return false
    }
    
    // Filter by actions
    if (filter.actions && filter.actions.length > 0) {
      if (!filter.actions.includes(log.action)) return false
    }
    
    // Filter by user
    if (filter.userId && log.userId !== filter.userId) return false
    
    // Filter by project
    if (filter.projectRef && log.projectRef !== filter.projectRef) return false
    
    // Filter by search term
    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase()
      const searchable = [
        log.action,
        log.targetName,
        log.userEmail,
        getActionDescription(log.action),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      
      if (!searchable.includes(term)) return false
    }
    
    return true
  })
}

/**
 * Groups audit logs by date
 */
export function groupAuditLogsByDate(
  logs: AuditLogEntry[]
): Record<string, AuditLogEntry[]> {
  const groups: Record<string, AuditLogEntry[]> = {}
  
  for (const log of logs) {
    // Use local date for grouping
    const dateKey = dayjs(log.timestamp).format('YYYY-MM-DD')
    
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(log)
  }
  
  return groups
}

/**
 * Generates a unique ID for an audit log entry
 */
export function generateAuditId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `audit_${timestamp}_${random}`
}

/**
 * Serializes an audit log entry for storage
 */
export function serializeAuditEntry(entry: AuditLogEntry): string {
  return JSON.stringify(entry)
}

/**
 * Deserializes an audit log entry from storage
 */
export function deserializeAuditEntry(data: string): AuditLogEntry | null {
  try {
    return JSON.parse(data) as AuditLogEntry
  } catch {
    return null
  }
}

/**
 * Gets the severity level for an audit action
 */
export function getActionSeverity(action: AuditAction): 'info' | 'warning' | 'critical' {
  const criticalActions: AuditAction[] = [
    AUDIT_ACTIONS.TABLE_DELETE,
    AUDIT_ACTIONS.BUCKET_DELETE,
    AUDIT_ACTIONS.POLICY_DELETE,
    AUDIT_ACTIONS.API_KEY_DELETE,
    AUDIT_ACTIONS.MEMBER_REMOVE,
  ]
  
  const warningActions: AuditAction[] = [
    AUDIT_ACTIONS.PASSWORD_CHANGE,
    AUDIT_ACTIONS.MFA_DISABLE,
    AUDIT_ACTIONS.TABLE_UPDATE,
    AUDIT_ACTIONS.POLICY_UPDATE,
    AUDIT_ACTIONS.ROLE_CHANGE,
  ]
  
  if (criticalActions.includes(action)) return 'critical'
  if (warningActions.includes(action)) return 'warning'
  return 'info'
}

/**
 * Exports audit logs to CSV format
 */
export function exportAuditLogsToCSV(logs: AuditLogEntry[]): string {
  const headers = ['Timestamp', 'Action', 'Category', 'User', 'Target', 'IP Address']
  const rows = logs.map((log) => [
    dayjs(log.timestamp).format('YYYY-MM-DD HH:mm:ss'),
    getActionDescription(log.action),
    log.category,
    log.userEmail || log.userId,
    log.targetName || log.targetId || '',
    log.ipAddress || '',
  ])
  
  return [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
}
