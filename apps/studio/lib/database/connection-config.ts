/**
 * Database connection configuration utilities.
 * 
 * Provides consistent connection settings across the application.
 */

import { 
  DEFAULT_CONNECTION_TIMEOUT_SECONDS, 
  DEFAULT_STATEMENT_TIMEOUT_SECONDS 
} from 'lib/constants'

export interface ConnectionConfig {
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number
  /** Statement timeout in milliseconds */
  statementTimeoutMs: number
  /** Maximum retry attempts */
  maxRetries: number
  /** Delay between retries in milliseconds */
  retryDelayMs: number
}

/**
 * Get default connection configuration for SQL queries.
 * Converts timeout values from seconds to milliseconds.
 */
export function getDefaultConnectionConfig(): ConnectionConfig {
  return {
    connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000,
    statementTimeoutMs: DEFAULT_STATEMENT_TIMEOUT_SECONDS * 1000,
    maxRetries: 3,
    retryDelayMs: 1000,
  }
}

/**
 * Get connection configuration for long-running operations.
 * Uses extended timeouts for operations like backups, migrations.
 */
export function getLongRunningConnectionConfig(): ConnectionConfig {
  return {
    connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000 * 2, // Double the timeout
    statementTimeoutMs: DEFAULT_STATEMENT_TIMEOUT_SECONDS * 1000 * 4, // 4x for long operations
    maxRetries: 5,
    retryDelayMs: 2000,
  }
}

/**
 * Get connection configuration for realtime subscriptions.
 * Uses appropriate timeouts for persistent connections.
 */
export function getRealtimeConnectionConfig(): ConnectionConfig {
  return {
    connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000,
    statementTimeoutMs: 0, // No statement timeout for realtime
    maxRetries: 10,
    retryDelayMs: 500,
  }
}
