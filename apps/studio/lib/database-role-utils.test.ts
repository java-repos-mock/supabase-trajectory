import { describe, it, expect } from 'vitest'

import {
  isSystemRole,
  isSupabaseRole,
  isProtectedRole,
  validateRoleName,
  escapeRoleName,
  generateCreateRoleSql,
  generateDropRoleSql,
  generateAlterRoleSql,
  generateGrantRoleSql,
  generateRevokeRoleSql,
  generateSetRoleSql,
  generateResetRoleSql,
  parseRoleAttributes,
  getRolePrivilegeDescription,
  SYSTEM_ROLES,
  SUPABASE_ROLES,
  DEFAULT_ROLE_ATTRIBUTES,
} from './database-role-utils'

describe('database-role-utils', () => {
  describe('isSystemRole', () => {
    it('should identify system roles', () => {
      expect(isSystemRole('pg_database_owner')).toBe(true)
      expect(isSystemRole('pg_read_all_data')).toBe(true)
      expect(isSystemRole('pg_monitor')).toBe(true)
    })

    it('should not identify regular roles as system', () => {
      expect(isSystemRole('my_role')).toBe(false)
      expect(isSystemRole('admin')).toBe(false)
    })
  })

  describe('isSupabaseRole', () => {
    it('should identify Supabase roles', () => {
      expect(isSupabaseRole('anon')).toBe(true)
      expect(isSupabaseRole('authenticated')).toBe(true)
      expect(isSupabaseRole('service_role')).toBe(true)
      expect(isSupabaseRole('supabase_admin')).toBe(true)
    })

    it('should not identify regular roles as Supabase', () => {
      expect(isSupabaseRole('my_role')).toBe(false)
      expect(isSupabaseRole('admin')).toBe(false)
    })
  })

  describe('isProtectedRole', () => {
    it('should identify all protected roles', () => {
      expect(isProtectedRole('pg_database_owner')).toBe(true)
      expect(isProtectedRole('anon')).toBe(true)
      expect(isProtectedRole('authenticated')).toBe(true)
    })

    it('should not identify regular roles as protected', () => {
      expect(isProtectedRole('my_app_role')).toBe(false)
    })
  })

  describe('validateRoleName', () => {
    it('should accept valid role names', () => {
      expect(validateRoleName('my_role')).toEqual({ valid: true })
      expect(validateRoleName('Role123')).toEqual({ valid: true })
      expect(validateRoleName('_private_role')).toEqual({ valid: true })
    })

    it('should reject empty names', () => {
      expect(validateRoleName('')).toMatchObject({ valid: false })
      expect(validateRoleName('   ')).toMatchObject({ valid: false })
    })

    it('should reject names exceeding 63 characters', () => {
      const longName = 'a'.repeat(64)
      const result = validateRoleName(longName)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('63 characters')
    })

    it('should reject protected role names', () => {
      expect(validateRoleName('anon')).toMatchObject({ valid: false })
      expect(validateRoleName('pg_database_owner')).toMatchObject({ valid: false })
    })

    it('should accept names at exactly 63 characters', () => {
      const maxName = 'a'.repeat(63)
      expect(validateRoleName(maxName)).toEqual({ valid: true })
    })
  })

  describe('escapeRoleName', () => {
    it('should escape double quotes', () => {
      expect(escapeRoleName('role"name')).toBe('role""name')
      expect(escapeRoleName('"quoted"')).toBe('""quoted""')
    })

    it('should handle names without quotes', () => {
      expect(escapeRoleName('simple_role')).toBe('simple_role')
    })

    it('should handle empty strings', () => {
      expect(escapeRoleName('')).toBe('')
    })
  })

  describe('generateCreateRoleSql', () => {
    it('should generate basic CREATE ROLE statement', () => {
      const sql = generateCreateRoleSql('new_role')
      expect(sql).toBe('CREATE ROLE "new_role"')
    })

    it('should include LOGIN attribute', () => {
      const sql = generateCreateRoleSql('new_role', { canLogin: true })
      expect(sql).toContain('LOGIN')
    })

    it('should include multiple attributes', () => {
      const sql = generateCreateRoleSql('new_role', {
        canLogin: true,
        canCreateDb: true,
        connectionLimit: 10,
      })
      expect(sql).toContain('LOGIN')
      expect(sql).toContain('CREATEDB')
      expect(sql).toContain('CONNECTION LIMIT 10')
    })

    it('should handle VALID UNTIL with proper escaping', () => {
      const sql = generateCreateRoleSql('new_role', {
        validUntil: "2025-01-01 00:00:00",
      })
      expect(sql).toContain("VALID UNTIL '2025-01-01 00:00:00'")
    })

    it('should escape role names with special characters', () => {
      const sql = generateCreateRoleSql('role"name')
      expect(sql).toContain('"role""name"')
    })
  })

  describe('generateDropRoleSql', () => {
    it('should generate DROP ROLE IF EXISTS statement', () => {
      const sql = generateDropRoleSql('old_role')
      expect(sql).toBe('DROP ROLE IF EXISTS "old_role"')
    })

    it('should escape role names', () => {
      const sql = generateDropRoleSql('role"name')
      expect(sql).toContain('"role""name"')
    })
  })

  describe('generateAlterRoleSql', () => {
    it('should generate ALTER ROLE statement for login change', () => {
      const sql = generateAlterRoleSql('my_role', { canLogin: true })
      expect(sql).toBe('ALTER ROLE "my_role" LOGIN')
    })

    it('should handle negative attributes', () => {
      const sql = generateAlterRoleSql('my_role', { canLogin: false })
      expect(sql).toContain('NOLOGIN')
    })

    it('should include multiple changes', () => {
      const sql = generateAlterRoleSql('my_role', {
        canLogin: true,
        canCreateDb: false,
        connectionLimit: 5,
      })
      expect(sql).toContain('LOGIN')
      expect(sql).toContain('NOCREATEDB')
      expect(sql).toContain('CONNECTION LIMIT 5')
    })

    it('should throw error for empty changes', () => {
      expect(() => generateAlterRoleSql('my_role', {})).toThrow()
    })
  })

  describe('generateGrantRoleSql', () => {
    it('should generate GRANT statement', () => {
      const sql = generateGrantRoleSql('admin', 'user1')
      expect(sql).toBe('GRANT "admin" TO "user1"')
    })

    it('should include WITH ADMIN OPTION', () => {
      const sql = generateGrantRoleSql('admin', 'user1', true)
      expect(sql).toContain('WITH ADMIN OPTION')
    })

    it('should escape role names', () => {
      const sql = generateGrantRoleSql('admin"role', 'user"name')
      expect(sql).toContain('"admin""role"')
      expect(sql).toContain('"user""name"')
    })
  })

  describe('generateRevokeRoleSql', () => {
    it('should generate REVOKE statement', () => {
      const sql = generateRevokeRoleSql('admin', 'user1')
      expect(sql).toBe('REVOKE "admin" FROM "user1"')
    })

    it('should include CASCADE', () => {
      const sql = generateRevokeRoleSql('admin', 'user1', true)
      expect(sql).toContain('CASCADE')
    })
  })

  describe('generateSetRoleSql', () => {
    it('should generate SET ROLE statement', () => {
      const sql = generateSetRoleSql('admin')
      expect(sql).toBe("SET ROLE 'admin'")
    })

    it('should escape role names', () => {
      const sql = generateSetRoleSql('admin"role')
      expect(sql).toContain('admin""role')
    })
  })

  describe('generateResetRoleSql', () => {
    it('should generate RESET ROLE statement', () => {
      expect(generateResetRoleSql()).toBe('RESET ROLE')
    })
  })

  describe('parseRoleAttributes', () => {
    it('should parse pg_roles row correctly', () => {
      const row = {
        rolname: 'test_role',
        rolsuper: false,
        rolcanlogin: true,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: true,
        rolreplication: false,
        rolbypassrls: false,
        rolconnlimit: -1,
        rolvaliduntil: null,
        memberof: ['parent_role'],
        members: [],
      }

      const result = parseRoleAttributes(row)
      expect(result.name).toBe('test_role')
      expect(result.canLogin).toBe(true)
      expect(result.isSuperuser).toBe(false)
      expect(result.memberOf).toEqual(['parent_role'])
    })
  })

  describe('getRolePrivilegeDescription', () => {
    it('should describe superuser privileges', () => {
      const role = {
        name: 'admin',
        isSuperuser: true,
        canLogin: true,
        canCreateDb: true,
        canCreateRole: true,
        inherit: true,
        replication: false,
        bypassRls: false,
        connectionLimit: -1,
        memberOf: [],
        members: [],
      }

      const desc = getRolePrivilegeDescription(role)
      expect(desc).toContain('Superuser')
      expect(desc).toContain('Can login')
      expect(desc).toContain('Can create databases')
    })

    it('should handle role with no privileges', () => {
      const role = {
        name: 'basic',
        isSuperuser: false,
        canLogin: false,
        canCreateDb: false,
        canCreateRole: false,
        inherit: true,
        replication: false,
        bypassRls: false,
        connectionLimit: -1,
        memberOf: [],
        members: [],
      }

      const desc = getRolePrivilegeDescription(role)
      expect(desc).toContain('No special privileges')
    })
  })

  describe('constants', () => {
    it('should have expected system roles', () => {
      expect(SYSTEM_ROLES).toContain('pg_database_owner')
      expect(SYSTEM_ROLES).toContain('pg_read_all_data')
    })

    it('should have expected Supabase roles', () => {
      expect(SUPABASE_ROLES).toContain('anon')
      expect(SUPABASE_ROLES).toContain('authenticated')
      expect(SUPABASE_ROLES).toContain('service_role')
    })

    it('should have sensible default attributes', () => {
      expect(DEFAULT_ROLE_ATTRIBUTES.canLogin).toBe(false)
      expect(DEFAULT_ROLE_ATTRIBUTES.inherit).toBe(true)
      expect(DEFAULT_ROLE_ATTRIBUTES.connectionLimit).toBe(-1)
    })
  })
})
