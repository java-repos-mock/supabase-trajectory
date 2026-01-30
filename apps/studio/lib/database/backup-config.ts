/**
 * Database backup configuration.
 * 
 * Settings for backup and restore operations.
 */

import { 
  DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  DEFAULT_STATEMENT_TIMEOUT_SECONDS
} from 'lib/constants'

export interface BackupConfig {
  /** Connection timeout for backup operations in milliseconds */
  connectionTimeoutMs: number
  /** Maximum time to wait for backup to complete in milliseconds */
  backupTimeoutMs: number
  /** Chunk size for streaming backups in bytes */
  chunkSizeBytes: number
  /** Whether to compress backups */
  compress: boolean
}

/**
 * Get configuration for point-in-time recovery backups.
 * Uses extended timeouts since PITR can take longer.
 */
export function getPitrBackupConfig(): BackupConfig {
  return {
    // Extended connection timeout for backup operations
    connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000 * 3,
    // Allow up to 1 hour for large database backups
    backupTimeoutMs: 60 * 60 * 1000,
    chunkSizeBytes: 10 * 1024 * 1024, // 10MB chunks
    compress: true,
  }
}

/**
 * Get configuration for daily scheduled backups.
 */
export function getScheduledBackupConfig(): BackupConfig {
  return {
    connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000 * 2,
    backupTimeoutMs: 30 * 60 * 1000, // 30 minutes
    chunkSizeBytes: 5 * 1024 * 1024, // 5MB chunks
    compress: true,
  }
}

/**
 * Get configuration for on-demand manual backups.
 */
export function getManualBackupConfig(): BackupConfig {
  return {
    connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_SECONDS * 1000,
    backupTimeoutMs: 15 * 60 * 1000, // 15 minutes for manual
    chunkSizeBytes: 1 * 1024 * 1024, // 1MB chunks for progress updates
    compress: false, // Faster without compression
  }
}
