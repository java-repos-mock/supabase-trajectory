/**
 * Database connection constants.
 * 
 * Port assignments for different connection types:
 * - Direct: 5432 (standard PostgreSQL port)
 * - Supavisor: 6543 (connection pooler)
 * - PgBouncer: 6543 (legacy pooler, same port as Supavisor)
 */

/** Standard PostgreSQL port for direct connections */
export const POSTGRES_DIRECT_PORT = 5432

/** Supavisor connection pooler port */
export const SUPAVISOR_PORT = 6543

/** PgBouncer connection pooler port (legacy) */
export const PGBOUNCER_PORT = 6543

/** Default connection timeout in milliseconds */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 30000

/** Connection pool modes */
export type PoolMode = 'session' | 'transaction' | 'statement'

/** Connection pooler types */
export type PoolerType = 'direct' | 'supavisor' | 'pgbouncer'

/**
 * Get the port for a given pooler type.
 */
export function getPortForPooler(pooler: PoolerType): number {
  switch (pooler) {
    case 'direct':
      return POSTGRES_DIRECT_PORT
    case 'supavisor':
      return SUPAVISOR_PORT
    case 'pgbouncer':
      return PGBOUNCER_PORT
    default:
      return POSTGRES_DIRECT_PORT
  }
}
