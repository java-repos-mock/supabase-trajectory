import { useState, useCallback, useMemo } from 'react'

export interface CronSchedule {
  second: string
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

export interface UseCronScheduleBuilderOptions {
  initialSchedule?: Partial<CronSchedule>
  onChange?: (expression: string) => void
}

// Common schedule presets for quick selection
export const SCHEDULE_PRESETS = {
  everyMinute: { second: '0', minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  everyHour: { second: '0', minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  everyDay: { second: '0', minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  everyWeek: { second: '0', minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '0' },
  everyMonth: { second: '0', minute: '0', hour: '0', dayOfMonth: '1', month: '*', dayOfWeek: '*' },
} as const

const DEFAULT_SCHEDULE: CronSchedule = {
  second: '0',
  minute: '*',
  hour: '*',
  dayOfMonth: '*',
  month: '*',
  dayOfWeek: '*',
}

/**
 * Hook for building cron schedule expressions.
 * 
 * Provides a user-friendly interface for constructing cron expressions
 * with validation and preset schedules. Supports the standard 6-field
 * cron format (second minute hour day month weekday).
 */
export function useCronScheduleBuilder(options: UseCronScheduleBuilderOptions = {}) {
  const { initialSchedule, onChange } = options

  const [schedule, setSchedule] = useState<CronSchedule>({
    ...DEFAULT_SCHEDULE,
    ...initialSchedule,
  })

  // Build the cron expression from schedule parts
  const expression = useMemo(() => {
    const { second, minute, hour, dayOfMonth, month, dayOfWeek } = schedule
    return `${second} ${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`
  }, [schedule])

  // Validate a single cron field
  const validateField = useCallback((value: string, field: keyof CronSchedule): boolean => {
    if (value === '*') return true
    if (value.includes('/')) {
      // Step values like */5 or 0/10
      const [start, step] = value.split('/')
      if (start !== '*' && isNaN(parseInt(start, 10))) return false
      if (isNaN(parseInt(step, 10))) return false
      return true
    }
    if (value.includes(',')) {
      // List values like 1,2,3
      return value.split(',').every(v => !isNaN(parseInt(v.trim(), 10)))
    }
    if (value.includes('-')) {
      // Range values like 1-5
      const [start, end] = value.split('-')
      return !isNaN(parseInt(start, 10)) && !isNaN(parseInt(end, 10))
    }
    // Single value
    return !isNaN(parseInt(value, 10))
  }, [])

  // Validate the full schedule
  const isValid = useMemo(() => {
    return Object.entries(schedule).every(([field, value]) => 
      validateField(value, field as keyof CronSchedule)
    )
  }, [schedule, validateField])

  // Update a single field
  const setField = useCallback((field: keyof CronSchedule, value: string) => {
    setSchedule(prev => {
      const newSchedule = { ...prev, [field]: value }
      const newExpression = `${newSchedule.second} ${newSchedule.minute} ${newSchedule.hour} ${newSchedule.dayOfMonth} ${newSchedule.month} ${newSchedule.dayOfWeek}`
      onChange?.(newExpression)
      return newSchedule
    })
  }, [onChange])

  // Apply a preset schedule
  const applyPreset = useCallback((preset: keyof typeof SCHEDULE_PRESETS) => {
    const presetSchedule = SCHEDULE_PRESETS[preset]
    setSchedule(presetSchedule)
    const newExpression = `${presetSchedule.second} ${presetSchedule.minute} ${presetSchedule.hour} ${presetSchedule.dayOfMonth} ${presetSchedule.month} ${presetSchedule.dayOfWeek}`
    onChange?.(newExpression)
  }, [onChange])

  // Parse an existing expression into schedule parts
  const parseExpression = useCallback((expr: string) => {
    const parts = expr.trim().split(/\s+/)
    if (parts.length === 6) {
      // Full 6-field format
      setSchedule({
        second: parts[0],
        minute: parts[1],
        hour: parts[2],
        dayOfMonth: parts[3],
        month: parts[4],
        dayOfWeek: parts[5],
      })
    } else if (parts.length === 5) {
      // 5-field format (no seconds) - convert to 6-field
      setSchedule({
        second: '0',
        minute: parts[0],
        hour: parts[1],
        dayOfMonth: parts[2],
        month: parts[3],
        dayOfWeek: parts[4],
      })
    }
  }, [])

  // Get human-readable description
  const description = useMemo(() => {
    const { second, minute, hour, dayOfMonth, month, dayOfWeek } = schedule
    
    if (minute === '*' && hour === '*') {
      if (second === '0') return 'Every minute'
      if (second === '*') return 'Every second'
      return `At second ${second} of every minute`
    }
    
    if (minute !== '*' && hour === '*') {
      return `At minute ${minute} of every hour`
    }
    
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*') {
      return `At ${hour}:${minute.padStart(2, '0')} every day`
    }
    
    return `Custom schedule: ${expression}`
  }, [schedule, expression])

  return {
    schedule,
    expression,
    description,
    isValid,
    setField,
    applyPreset,
    parseExpression,
  }
}
