import { describe, expect, it } from 'vitest'

import {
  createSetRoleSql,
  escapeSqlIdentifier,
  escapeSqlLiteral,
  MAX_IDENTIFIER_LENGTH,
  validateRoleName,
  validateSqlIdentifier,
} from './sql-sanitize'

describe('sql-sanitize', () => {
  describe('validateSqlIdentifier', () => {
    it('should accept valid simple identifiers', () => {
      expect(validateSqlIdentifier('my_table')).toEqual({ valid: true, requiresQuoting: false })
      expect(validateSqlIdentifier('column1')).toEqual({ valid: true, requiresQuoting: false })
      expect(validateSqlIdentifier('_private')).toEqual({ valid: true, requiresQuoting: false })
    })

    it('should require quoting for reserved keywords', () => {
      expect(validateSqlIdentifier('select')).toEqual({ valid: true, requiresQuoting: true })
      expect(validateSqlIdentifier('TABLE')).toEqual({ valid: true, requiresQuoting: true })
      expect(validateSqlIdentifier('user')).toEqual({ valid: true, requiresQuoting: true })
    })

    it('should require quoting for identifiers starting with numbers', () => {
      expect(validateSqlIdentifier('123abc')).toEqual({ valid: true, requiresQuoting: true })
      expect(validateSqlIdentifier('1column')).toEqual({ valid: true, requiresQuoting: true })
    })

    it('should reject empty identifiers', () => {
      expect(validateSqlIdentifier('')).toEqual({
        valid: false,
        error: 'Identifier cannot be empty',
      })
    })

    it('should reject identifiers exceeding max length', () => {
      const longIdentifier = 'a'.repeat(MAX_IDENTIFIER_LENGTH + 1)
      const result = validateSqlIdentifier(longIdentifier)
      expect(result.valid).toBe(false)
    })

    it('should reject identifiers with null bytes', () => {
      expect(validateSqlIdentifier('test\x00name')).toEqual({
        valid: false,
        error: 'Identifier contains invalid characters (null bytes, newlines, or carriage returns)',
      })
    })

    it('should reject identifiers with newlines', () => {
      expect(validateSqlIdentifier('test\nname')).toEqual({
        valid: false,
        error: 'Identifier contains invalid characters (null bytes, newlines, or carriage returns)',
      })
    })
  })

  describe('escapeSqlIdentifier', () => {
    it('should return simple identifiers unquoted', () => {
      expect(escapeSqlIdentifier('my_table')).toBe('my_table')
      expect(escapeSqlIdentifier('column_name')).toBe('column_name')
    })

    it('should quote reserved keywords', () => {
      expect(escapeSqlIdentifier('select')).toBe('"select"')
      expect(escapeSqlIdentifier('user')).toBe('"user"')
    })

    it('should quote identifiers with spaces', () => {
      expect(escapeSqlIdentifier('my table')).toBe('"my table"')
    })

    it('should escape quotes within identifiers', () => {
      expect(escapeSqlIdentifier("table'name")).toBe('"table\'\'name"')
    })

    it('should throw for invalid identifiers', () => {
      expect(() => escapeSqlIdentifier('')).toThrow('Invalid SQL identifier')
      expect(() => escapeSqlIdentifier('test\x00name')).toThrow('Invalid SQL identifier')
    })
  })

  describe('escapeSqlLiteral', () => {
    it('should quote simple strings', () => {
      expect(escapeSqlLiteral('hello')).toBe("'hello'")
      expect(escapeSqlLiteral('world')).toBe("'world'")
    })

    it('should escape single quotes', () => {
      expect(escapeSqlLiteral("it's")).toBe("'it''s'")
      expect(escapeSqlLiteral("don't")).toBe("'don''t'")
    })

    it('should escape backslashes and use E-string syntax', () => {
      expect(escapeSqlLiteral('path\\file')).toBe("E'path\\\\file'")
    })

    it('should handle null and undefined', () => {
      expect(escapeSqlLiteral(null as any)).toBe('NULL')
      expect(escapeSqlLiteral(undefined as any)).toBe('NULL')
    })
  })

  describe('validateRoleName', () => {
    it('should accept valid role names', () => {
      expect(validateRoleName('authenticated')).toEqual({ valid: true, requiresQuoting: false })
      expect(validateRoleName('anon')).toEqual({ valid: true, requiresQuoting: false })
      expect(validateRoleName('my_custom_role')).toEqual({ valid: true, requiresQuoting: false })
    })

    it('should reject roles starting with pg_', () => {
      expect(validateRoleName('pg_admin')).toEqual({
        valid: false,
        error: 'Role names cannot start with "pg_" (reserved for system roles)',
      })
      expect(validateRoleName('pg_read_all_data')).toEqual({
        valid: false,
        error: 'Role names cannot start with "pg_" (reserved for system roles)',
      })
    })

    it('should reject empty role names', () => {
      expect(validateRoleName('')).toEqual({
        valid: false,
        error: 'Identifier cannot be empty',
      })
    })
  })

  describe('createSetRoleSql', () => {
    it('should create valid SET ROLE statements', () => {
      expect(createSetRoleSql('authenticated')).toBe("SET LOCAL ROLE 'authenticated';")
      expect(createSetRoleSql('anon')).toBe("SET LOCAL ROLE 'anon';")
    })

    it('should escape quotes in role names', () => {
      expect(createSetRoleSql("role'name")).toBe("SET LOCAL ROLE 'role''name';")
    })

    it('should throw for invalid role names', () => {
      expect(() => createSetRoleSql('')).toThrow('Invalid role name')
      expect(() => createSetRoleSql('pg_admin')).toThrow('Invalid role name')
    })
  })
})
