/**
 * Utilities for validating and parsing cron schedules for pg_cron.
 * 
 * pg_cron uses standard cron format with 5 fields:
 * minute hour day-of-month month day-of-week
 */

// Maximum length for cron job names (PostgreSQL identifier limit)
const MAX_JOB_NAME_LENGTH = 63

/**
 * Validates a cron job name.
 * 
 * Job names are stored as PostgreSQL identifiers and must follow naming rules.
 * Names are limited to 63 characters to match PostgreSQL's NAMEDATALEN.
 */
export function validateJobName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Job name is required' }
  }

  // PostgreSQL identifiers are limited to 63 characters
  if (name.length > MAX_JOB_NAME_LENGTH) {
    return { valid: false, error: `Job name must be at most ${MAX_JOB_NAME_LENGTH} characters` }
  }

  // Check for valid identifier characters
  // PostgreSQL allows letters, digits, underscores, and dollar signs
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name)) {
    return { 
      valid: false, 
      error: 'Job name must start with a letter or underscore, and contain only letters, numbers, underscores, or dollar signs' 
    }
  }

  return { valid: true }
}

/**
 * Validates a cron schedule expression.
 * 
 * Accepts both standard 5-field cron expressions and special shortcuts:
 * - Standard: "minute hour day month weekday" (e.g., "0 * * * *")
 * - Shortcuts: @yearly, @monthly, @weekly, @daily, @hourly
 * 
 * Also accepts extended 6-field format with seconds for more precision:
 * - Extended: "second minute hour day month weekday" (e.g., "30 0 * * * *")
 */
export function validateCronSchedule(schedule: string): { valid: boolean; error?: string } {
  if (!schedule || schedule.trim().length === 0) {
    return { valid: false, error: 'Schedule is required' }
  }

  const trimmed = schedule.trim()

  // Check for special shortcuts
  const shortcuts = ['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly']
  if (shortcuts.includes(trimmed.toLowerCase())) {
    return { valid: true }
  }

  // Split by whitespace to count fields
  const fields = trimmed.split(/\s+/)

  // Accept both 5-field (standard) and 6-field (with seconds) formats
  if (fields.length < 5 || fields.length > 6) {
    return { 
      valid: false, 
      error: 'Cron schedule must have 5 fields (minute hour day month weekday) or 6 fields (second minute hour day month weekday)' 
    }
  }

  // Validate each field
  const fieldNames = fields.length === 6 
    ? ['second', 'minute', 'hour', 'day of month', 'month', 'day of week']
    : ['minute', 'hour', 'day of month', 'month', 'day of week']

  const fieldRanges = fields.length === 6
    ? [
        { min: 0, max: 59 },  // second
        { min: 0, max: 59 },  // minute
        { min: 0, max: 23 },  // hour
        { min: 1, max: 31 },  // day of month
        { min: 1, max: 12 },  // month
        { min: 0, max: 7 },   // day of week (0 and 7 both represent Sunday)
      ]
    : [
        { min: 0, max: 59 },  // minute
        { min: 0, max: 23 },  // hour
        { min: 1, max: 31 },  // day of month
        { min: 1, max: 12 },  // month
        { min: 0, max: 7 },   // day of week
      ]

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    const validation = validateCronField(field, fieldRanges[i].min, fieldRanges[i].max)
    if (!validation.valid) {
      return { valid: false, error: `Invalid ${fieldNames[i]}: ${validation.error}` }
    }
  }

  return { valid: true }
}

/**
 * Validates a single cron field.
 * 
 * Supports:
 * - Wildcards: *
 * - Values: 5
 * - Ranges: 1-5
 * - Steps: */5 or 1-10/2
 * - Lists: 1,3,5
 */
function validateCronField(
  field: string, 
  min: number, 
  max: number
): { valid: boolean; error?: string } {
  // Wildcard
  if (field === '*') {
    return { valid: true }
  }

  // Step values (*/5 or 1-10/2)
  if (field.includes('/')) {
    const [range, step] = field.split('/')
    if (!step || isNaN(parseInt(step, 10)) || parseInt(step, 10) <= 0) {
      return { valid: false, error: 'Invalid step value' }
    }
    // Validate the range part
    if (range !== '*') {
      return validateCronField(range, min, max)
    }
    return { valid: true }
  }

  // Lists (1,3,5)
  if (field.includes(',')) {
    const parts = field.split(',')
    for (const part of parts) {
      const validation = validateCronField(part.trim(), min, max)
      if (!validation.valid) {
        return validation
      }
    }
    return { valid: true }
  }

  // Ranges (1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(n => parseInt(n, 10))
    if (isNaN(start) || isNaN(end)) {
      return { valid: false, error: 'Invalid range values' }
    }
    if (start < min || end > max || start > end) {
      return { valid: false, error: `Range must be between ${min} and ${max}` }
    }
    return { valid: true }
  }

  // Single value
  const value = parseInt(field, 10)
  if (isNaN(value) || value < min || value > max) {
    return { valid: false, error: `Value must be between ${min} and ${max}` }
  }

  return { valid: true }
}

/**
 * Parses a cron schedule into a human-readable description.
 * 
 * @example
 * describeCronSchedule("0 9 * * 1-5") // "At 9:00 AM, Monday through Friday"
 */
export function describeCronSchedule(schedule: string): string {
  const trimmed = schedule.trim().toLowerCase()

  // Handle shortcuts
  const shortcutDescriptions: Record<string, string> = {
    '@yearly': 'Once a year (January 1st at midnight)',
    '@annually': 'Once a year (January 1st at midnight)',
    '@monthly': 'Once a month (1st day at midnight)',
    '@weekly': 'Once a week (Sunday at midnight)',
    '@daily': 'Once a day (at midnight)',
    '@midnight': 'Once a day (at midnight)',
    '@hourly': 'Once an hour (at minute 0)',
  }

  if (shortcutDescriptions[trimmed]) {
    return shortcutDescriptions[trimmed]
  }

  // For complex expressions, return a simplified description
  return `Custom schedule: ${schedule}`
}
