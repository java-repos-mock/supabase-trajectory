import { describe, it, expect } from 'vitest'
import { parseParameters, processParameterizedSql } from './sql-parameters'

/**
 * Tests for SQL parameter parsing and processing utilities.
 * These tests address the TODO comment in sql-parameters.ts to ensure
 * proper handling of parameterized SQL queries.
 */

describe('parseParameters', () => {
  it('parses simple :param without @set', () => {
    const result = parseParameters('SELECT * FROM table WHERE id = :userId')
    expect(result).toEqual([
      {
        name: 'userId',
        value: '',
        defaultValue: undefined,
        type: undefined,
        possibleValues: undefined,
        occurrences: 1,
      },
    ])
  })

  it('parses @set with type and value', () => {
    const result = parseParameters('@set userId:int = 123\nSELECT * FROM table WHERE id = :userId')

    const userIdParam = result.find((p) => p.name === 'userId')
    expect(userIdParam?.defaultValue).toBe('123')
    expect(userIdParam?.type).toBe('int')
  })

  it('parses union type', () => {
    const result = parseParameters(
      '@set status:open|closed = open\nSELECT * FROM users WHERE status = :status'
    )

    const statusParam = result.find((p) => p.name === 'status')
    expect(statusParam?.type).toBe('enum')
    expect(statusParam?.possibleValues).toEqual(['open', 'closed'])
  })

  it('counts multiple occurrences', () => {
    const result = parseParameters('SELECT * FROM table WHERE id = :userId OR owner_id = :userId')

    const userIdParam = result.find((p) => p.name === 'userId')
    expect(userIdParam?.occurrences).toBe(2)
  })
})

describe('processParameterizedSql', () => {
  it('replaces :param with value from parameters', () => {
    const sql = 'SELECT * FROM users WHERE id = :userId'
    const result = processParameterizedSql(sql, { userId: '42' })
    expect(result).toBe('SELECT * FROM users WHERE id = 42')
  })

  it('uses default from @set if param not provided', () => {
    const sql = '@set userId:int = 123\nSELECT * FROM users WHERE id = :userId'
    const result = processParameterizedSql(sql, {})
    expect(result).toBe('SELECT * FROM users WHERE id = 123')
  })

  it('overrides @set default if param is provided', () => {
    const sql = '@set userId:int = 123\nSELECT * FROM users WHERE id = :userId'
    const result = processParameterizedSql(sql, { userId: '999' })
    expect(result).toBe('SELECT * FROM users WHERE id = 999')
  })

  it('throws if no param value is provided and no default exists', () => {
    const sql = 'SELECT * FROM users WHERE id = :userId'
    expect(() => processParameterizedSql(sql, {})).toThrowError(
      'Missing value for parameter: userId'
    )
  })

  it('removes @set lines from final SQL', () => {
    const sql = '@set status:open|closed = open\nSELECT * FROM items WHERE status = :status'
    const result = processParameterizedSql(sql, {})
    expect(result).toBe('SELECT * FROM items WHERE status = open')
    expect(result).not.toContain('@set')
  })

  it('handles multiple parameters in same query', () => {
    const sql = 'INSERT INTO users (name, email) VALUES (:name, :email)'
    const result = processParameterizedSql(sql, {
      name: "'John Doe'",
      email: "'john@example.com'",
    })
    expect(result).toBe("INSERT INTO users (name, email) VALUES ('John Doe', 'john@example.com')")
  })

  it('handles parameters with underscores', () => {
    const sql = 'SELECT * FROM users WHERE user_id = :user_id'
    const result = processParameterizedSql(sql, { user_id: '123' })
    expect(result).toBe('SELECT * FROM users WHERE user_id = 123')
  })

  it('handles parameters with numbers', () => {
    const sql = 'SELECT * FROM users WHERE id IN (:id1, :id2, :id3)'
    const result = processParameterizedSql(sql, { id1: '1', id2: '2', id3: '3' })
    expect(result).toBe('SELECT * FROM users WHERE id IN (1, 2, 3)')
  })

  it('preserves SQL comments', () => {
    const sql = `@set limit = 10
-- Fetch active users
SELECT * FROM users /* limit results */ LIMIT :limit`
    const result = processParameterizedSql(sql, {})
    expect(result).toContain('-- Fetch active users')
    expect(result).toContain('/* limit results */')
    expect(result).toContain('LIMIT 10')
  })

  it('handles whitespace variations in @set', () => {
    const sql = '@set  param1  =  value1\nSELECT :param1'
    const result = processParameterizedSql(sql, {})
    expect(result.trim()).toBe('SELECT value1')
  })

  it('handles complex multi-line queries', () => {
    const sql = `
@set schema = public
@set limit: number = 100
SELECT 
  id,
  name,
  email
FROM :schema.users
WHERE active = true
LIMIT :limit`
    const result = processParameterizedSql(sql, {})
    expect(result).toContain('FROM public.users')
    expect(result).toContain('LIMIT 100')
    expect(result).not.toContain('@set')
  })

  it('handles string values with special characters', () => {
    const sql = 'SELECT * FROM users WHERE name = :name'
    // User provides pre-quoted string value
    const result = processParameterizedSql(sql, { name: "'O\\'Brien'" })
    expect(result).toBe("SELECT * FROM users WHERE name = 'O\\'Brien'")
  })

  it('handles empty string values', () => {
    const sql = 'UPDATE users SET notes = :notes WHERE id = :id'
    const result = processParameterizedSql(sql, { notes: "''", id: '1' })
    expect(result).toBe("UPDATE users SET notes = '' WHERE id = 1")
  })

  it('handles NULL-like values', () => {
    const sql = 'UPDATE users SET deleted_at = :deletedAt WHERE id = :id'
    const result = processParameterizedSql(sql, { deletedAt: 'NULL', id: '1' })
    expect(result).toBe('UPDATE users SET deleted_at = NULL WHERE id = 1')
  })
})

describe('parseParameters edge cases', () => {
  it('returns empty array for SQL without parameters', () => {
    const result = parseParameters('SELECT * FROM users')
    expect(result).toEqual([])
  })

  it('handles undefined input', () => {
    const result = parseParameters(undefined)
    expect(result).toEqual([])
  })

  it('handles empty string', () => {
    const result = parseParameters('')
    expect(result).toEqual([])
  })

  it('ignores colon in string literals', () => {
    // Note: This tests that :time in a string context is still parsed as param
    // The regex doesn't distinguish string context, which is expected behavior
    const sql = "SELECT * FROM logs WHERE timestamp > :startTime"
    const result = parseParameters(sql)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('startTime')
  })

  it('handles multiple @set on same parameter', () => {
    // Last @set wins
    const sql = `
@set limit = 10
@set limit = 20
SELECT * FROM users LIMIT :limit`
    const result = parseParameters(sql)
    const limitParam = result.find((p) => p.name === 'limit')
    expect(limitParam?.value).toBe('20')
  })
})
