import { describe, it, expect } from 'vitest'

import {
  validateColumnName,
  escapeSqlString,
  escapeSqlIdentifier,
  getTypeDisplayName,
  supportsDefaultValue,
  generateColumnCommentSql,
  generateColumnRenameSql,
  getColumnTypeCategory,
  isNullableByDefault,
  validateDefaultValue,
  COLUMN_TYPE_CATEGORIES,
  COLUMN_LIMITS,
} from './database-column-utils'

describe('database-column-utils', () => {
  describe('validateColumnName', () => {
    it('should accept valid column names', () => {
      expect(validateColumnName('id')).toEqual({ valid: true })
      expect(validateColumnName('user_name')).toEqual({ valid: true })
      expect(validateColumnName('column1')).toEqual({ valid: true })
      expect(validateColumnName('_private')).toEqual({ valid: true })
    })

    it('should reject empty names', () => {
      expect(validateColumnName('')).toMatchObject({ valid: false })
      expect(validateColumnName('   ')).toMatchObject({ valid: false })
    })

    it('should reject names exceeding max length', () => {
      const longName = 'a'.repeat(COLUMN_LIMITS.NAME_MAX_LENGTH + 1)
      const result = validateColumnName(longName)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('cannot exceed')
    })

    it('should warn about reserved words', () => {
      const result = validateColumnName('select')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('reserved word')
    })

    it('should accept names at exactly max length', () => {
      const maxName = 'a'.repeat(COLUMN_LIMITS.NAME_MAX_LENGTH)
      expect(validateColumnName(maxName)).toEqual({ valid: true })
    })
  })

  describe('escapeSqlString', () => {
    it('should escape single quotes', () => {
      expect(escapeSqlString("it's")).toBe("it''s")
      expect(escapeSqlString("'test'")).toBe("''test''")
    })

    it('should handle strings without quotes', () => {
      expect(escapeSqlString('hello')).toBe('hello')
    })

    it('should handle empty strings', () => {
      expect(escapeSqlString('')).toBe('')
    })

    it('should handle multiple quotes', () => {
      expect(escapeSqlString("it's John's")).toBe("it''s John''s")
    })
  })

  describe('escapeSqlIdentifier', () => {
    it('should not quote simple identifiers', () => {
      expect(escapeSqlIdentifier('users')).toBe('users')
      expect(escapeSqlIdentifier('user_id')).toBe('user_id')
    })

    it('should quote identifiers with uppercase', () => {
      expect(escapeSqlIdentifier('UserId')).toContain('"')
    })

    it('should quote identifiers with special characters', () => {
      expect(escapeSqlIdentifier('user-id')).toContain('"')
      expect(escapeSqlIdentifier('user id')).toContain('"')
    })

    it('should preserve already quoted identifiers', () => {
      expect(escapeSqlIdentifier('"MyTable"')).toBe('"MyTable"')
    })
  })

  describe('getTypeDisplayName', () => {
    it('should return friendly names for common types', () => {
      expect(getTypeDisplayName('int4')).toContain('Integer')
      expect(getTypeDisplayName('text')).toContain('Text')
      expect(getTypeDisplayName('bool')).toContain('Boolean')
      expect(getTypeDisplayName('uuid')).toContain('UUID')
    })

    it('should return the original type for unknown types', () => {
      expect(getTypeDisplayName('custom_type')).toBe('custom_type')
    })

    it('should be case insensitive', () => {
      expect(getTypeDisplayName('INT4')).toContain('Integer')
      expect(getTypeDisplayName('Text')).toContain('Text')
    })
  })

  describe('supportsDefaultValue', () => {
    it('should return true for regular types', () => {
      expect(supportsDefaultValue('int4')).toBe(true)
      expect(supportsDefaultValue('text')).toBe(true)
      expect(supportsDefaultValue('uuid')).toBe(true)
    })

    it('should return false for serial types', () => {
      expect(supportsDefaultValue('serial')).toBe(false)
      expect(supportsDefaultValue('bigserial')).toBe(false)
      expect(supportsDefaultValue('smallserial')).toBe(false)
    })
  })

  describe('generateColumnCommentSql', () => {
    it('should generate SQL for adding a comment', () => {
      const sql = generateColumnCommentSql('public', 'users', 'email', 'User email address')
      expect(sql).toContain('COMMENT ON COLUMN')
      expect(sql).toContain('public')
      expect(sql).toContain('users')
      expect(sql).toContain('email')
      expect(sql).toContain('User email address')
    })

    it('should generate SQL for removing a comment', () => {
      const sql = generateColumnCommentSql('public', 'users', 'email', null)
      expect(sql).toContain('IS NULL')
    })

    it('should escape special characters in comments', () => {
      const sql = generateColumnCommentSql('public', 'users', 'name', "User's full name")
      expect(sql).toContain("''")
    })

    it('should handle schemas with special characters', () => {
      const sql = generateColumnCommentSql('my-schema', 'users', 'id', 'Primary key')
      expect(sql).toContain('"my-schema"')
    })
  })

  describe('generateColumnRenameSql', () => {
    it('should generate valid ALTER TABLE statement', () => {
      const sql = generateColumnRenameSql('public', 'users', 'old_name', 'new_name')
      expect(sql).toContain('ALTER TABLE')
      expect(sql).toContain('RENAME COLUMN')
      expect(sql).toContain('old_name')
      expect(sql).toContain('new_name')
    })

    it('should handle identifiers requiring quoting', () => {
      const sql = generateColumnRenameSql('public', 'users', 'OldName', 'NewName')
      expect(sql).toContain('"OldName"')
      expect(sql).toContain('"NewName"')
    })
  })

  describe('getColumnTypeCategory', () => {
    it('should categorize numeric types', () => {
      expect(getColumnTypeCategory('int4')).toBe('NUMERIC')
      expect(getColumnTypeCategory('float8')).toBe('NUMERIC')
      expect(getColumnTypeCategory('numeric')).toBe('NUMERIC')
    })

    it('should categorize text types', () => {
      expect(getColumnTypeCategory('text')).toBe('TEXT')
      expect(getColumnTypeCategory('varchar')).toBe('TEXT')
    })

    it('should categorize date/time types', () => {
      expect(getColumnTypeCategory('timestamp')).toBe('DATE_TIME')
      expect(getColumnTypeCategory('timestamptz')).toBe('DATE_TIME')
    })

    it('should return null for unknown types', () => {
      expect(getColumnTypeCategory('custom_type')).toBeNull()
    })
  })

  describe('isNullableByDefault', () => {
    it('should return true for regular types', () => {
      expect(isNullableByDefault('int4')).toBe(true)
      expect(isNullableByDefault('text')).toBe(true)
    })

    it('should return false for serial types', () => {
      expect(isNullableByDefault('serial')).toBe(false)
      expect(isNullableByDefault('bigserial')).toBe(false)
    })
  })

  describe('validateDefaultValue', () => {
    it('should accept valid numeric defaults', () => {
      expect(validateDefaultValue('int4', '42')).toEqual({ valid: true })
      expect(validateDefaultValue('float8', '3.14')).toEqual({ valid: true })
      expect(validateDefaultValue('numeric', '-100.5')).toEqual({ valid: true })
    })

    it('should reject invalid numeric defaults', () => {
      const result = validateDefaultValue('int4', 'not_a_number')
      expect(result.valid).toBe(false)
    })

    it('should accept valid boolean defaults', () => {
      expect(validateDefaultValue('bool', 'true')).toEqual({ valid: true })
      expect(validateDefaultValue('bool', 'false')).toEqual({ valid: true })
      expect(validateDefaultValue('boolean', 'null')).toEqual({ valid: true })
    })

    it('should reject invalid boolean defaults', () => {
      const result = validateDefaultValue('bool', 'yes')
      expect(result.valid).toBe(false)
    })

    it('should accept valid UUID defaults', () => {
      expect(validateDefaultValue('uuid', 'gen_random_uuid()')).toEqual({ valid: true })
      expect(validateDefaultValue('uuid', '550e8400-e29b-41d4-a716-446655440000')).toEqual({ valid: true })
    })

    it('should accept empty default values', () => {
      expect(validateDefaultValue('int4', '')).toEqual({ valid: true })
    })
  })

  describe('COLUMN_TYPE_CATEGORIES', () => {
    it('should have all expected categories', () => {
      expect(COLUMN_TYPE_CATEGORIES).toHaveProperty('NUMERIC')
      expect(COLUMN_TYPE_CATEGORIES).toHaveProperty('TEXT')
      expect(COLUMN_TYPE_CATEGORIES).toHaveProperty('BOOLEAN')
      expect(COLUMN_TYPE_CATEGORIES).toHaveProperty('DATE_TIME')
      expect(COLUMN_TYPE_CATEGORIES).toHaveProperty('JSON')
    })
  })
})
