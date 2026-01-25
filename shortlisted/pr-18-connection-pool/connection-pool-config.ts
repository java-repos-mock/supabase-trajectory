/**
 * Connection pool configuration utilities for Supabase Studio.
 * Handles Supavisor and PgBouncer configuration for optimal database connectivity.
 */

export type PoolingMode = 'session' | 'transaction' | 'statement'

export type PoolerType = 'supavisor' | 'pgbouncer' | 'direct'

export interface ConnectionConfig {
  host: string
  port: number
  database: string
  user: string
  password?: string
  pooler: PoolerType
  mode: PoolingMode
  ssl: boolean
}

export interface PoolerLimits {
  maxClients: number
  poolSize: number
  maxConnections: number
}

export interface ComputeTier {
  name: string
  maxPoolerClients: number
  maxDirectConnections: number
  recommendedPoolSize: number
}

const COMPUTE_TIERS: ComputeTier[] = [
  { name: 'micro', maxPoolerClients: 200, maxDirectConnections: 60, recommendedPoolSize: 15 },
  { name: 'small', maxPoolerClients: 400, maxDirectConnections: 90, recommendedPoolSize: 15 },
  { name: 'medium', maxPoolerClients: 600, maxDirectConnections: 120, recommendedPoolSize: 15 },
  { name: 'large', maxPoolerClients: 800, maxDirectConnections: 160, recommendedPoolSize: 20 },
  { name: 'xlarge', maxPoolerClients: 1000, maxDirectConnections: 240, recommendedPoolSize: 25 },
  { name: '2xlarge', maxPoolerClients: 1500, maxDirectConnections: 380, recommendedPoolSize: 30 },
  { name: '4xlarge', maxPoolerClients: 3000, maxDirectConnections: 480, recommendedPoolSize: 50 },
]

const DEFAULT_PORTS = {
  direct: 5432,
  supavisor_session: 5432,
  supavisor_transaction: 6543,
  pgbouncer: 6543,
}

/**
 * Get port for pooler and mode combination.
 */
export function getPoolerPort(pooler: PoolerType, mode: PoolingMode): number {
  if (pooler === 'direct') return DEFAULT_PORTS.direct
  if (pooler === 'pgbouncer') return DEFAULT_PORTS.pgbouncer
  
  return mode === 'session' 
    ? DEFAULT_PORTS.supavisor_session 
    : DEFAULT_PORTS.supavisor_transaction
}

/**
 * Build connection string from config.
 */
export function buildConnectionString(config: ConnectionConfig): string {
  const { host, port, database, user, password, ssl } = config
  
  const auth = password ? `${user}:${password}` : user
  const sslParam = ssl ? '?sslmode=require' : ''
  
  return `postgresql://${auth}@${host}:${port}/${database}${sslParam}`
}

/**
 * Parse connection string to config.
 */
export function parseConnectionString(connString: string): Partial<ConnectionConfig> | null {
  try {
    const url = new URL(connString)
    
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password || undefined,
      ssl: url.searchParams.get('sslmode') === 'require',
    }
  } catch {
    return null
  }
}

/**
 * Check if pooling mode supports prepared statements.
 */
export function supportsPreparedStatements(
  pooler: PoolerType,
  mode: PoolingMode
): boolean {
  if (pooler === 'direct') return true
  if (pooler === 'supavisor' && mode === 'session') return true
  
  return false
}

/**
 * Get recommended pooling mode for use case.
 */
export function getRecommendedMode(useCase: {
  isServerless: boolean
  needsPreparedStatements: boolean
  connectionLifetime: 'short' | 'long'
}): { pooler: PoolerType; mode: PoolingMode } {
  const { isServerless, needsPreparedStatements, connectionLifetime } = useCase
  
  if (needsPreparedStatements) {
    return connectionLifetime === 'long'
      ? { pooler: 'direct', mode: 'session' }
      : { pooler: 'supavisor', mode: 'session' }
  }
  
  if (isServerless) {
    return { pooler: 'supavisor', mode: 'transaction' }
  }
  
  return connectionLifetime === 'long'
    ? { pooler: 'direct', mode: 'session' }
    : { pooler: 'supavisor', mode: 'transaction' }
}

/**
 * Get compute tier by name.
 */
export function getComputeTier(tierName: string): ComputeTier | null {
  return COMPUTE_TIERS.find(t => t.name === tierName) || null
}

/**
 * Calculate optimal pool size.
 */
export function calculateOptimalPoolSize(
  tier: ComputeTier,
  expectedConcurrentConnections: number
): number {
  const baseSize = tier.recommendedPoolSize
  
  if (expectedConcurrentConnections > tier.maxPoolerClients * 0.8) {
    return Math.min(baseSize * 2, tier.maxDirectConnections / 2)
  }
  
  if (expectedConcurrentConnections < tier.maxPoolerClients * 0.2) {
    return Math.max(baseSize / 2, 5)
  }
  
  return baseSize
}

/**
 * Validate pool configuration against limits.
 */
export function validatePoolConfig(
  config: { poolSize: number; maxClients: number },
  tier: ComputeTier
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (config.poolSize > tier.maxDirectConnections) {
    errors.push(
      `Pool size ${config.poolSize} exceeds max connections ${tier.maxDirectConnections}`
    )
  }
  
  if (config.maxClients > tier.maxPoolerClients) {
    errors.push(
      `Max clients ${config.maxClients} exceeds limit ${tier.maxPoolerClients}`
    )
  }
  
  if (config.poolSize < 1) {
    errors.push('Pool size must be at least 1')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Estimate connection usage.
 */
export function estimateConnectionUsage(
  activeConnections: number,
  poolSize: number,
  mode: PoolingMode
): {
  utilization: number
  recommendation: string
} {
  const utilization = activeConnections / poolSize
  
  let recommendation: string
  
  if (utilization > 0.9) {
    recommendation = 'Consider increasing pool size or upgrading compute tier'
  } else if (utilization < 0.1) {
    recommendation = 'Pool size may be larger than needed'
  } else {
    recommendation = 'Connection usage is optimal'
  }
  
  return { utilization, recommendation }
}

/**
 * Get connection timeout based on mode.
 */
export function getConnectionTimeout(mode: PoolingMode): number {
  switch (mode) {
    case 'transaction':
      return 60000
    case 'session':
      return 0
    case 'statement':
      return 30000
    default:
      return 60000
  }
}

/**
 * Check if connection should be recycled.
 */
export function shouldRecycleConnection(
  connectionAge: number,
  mode: PoolingMode,
  maxAge: number = 3600000
): boolean {
  if (mode === 'session') {
    return false
  }
  
  return connectionAge > maxAge
}

/**
 * Format connection info for display.
 */
export function formatConnectionInfo(config: ConnectionConfig): string {
  const poolerName = config.pooler === 'pgbouncer' 
    ? 'PgBouncer' 
    : config.pooler === 'supavisor' 
      ? 'Supavisor' 
      : 'Direct'
  
  const modeName = config.mode.charAt(0).toUpperCase() + config.mode.slice(1)
  
  return `${poolerName} (${modeName} mode) on port ${config.port}`
}

/**
 * Get connection health status.
 */
export function getConnectionHealth(
  activeConnections: number,
  poolSize: number,
  errorRate: number
): 'healthy' | 'degraded' | 'critical' {
  if (errorRate > 0.1) return 'critical'
  if (errorRate > 0.01 || activeConnections / poolSize > 0.95) return 'degraded'
  return 'healthy'
}

/**
 * Calculate query queue depth.
 */
export function calculateQueueDepth(
  pendingQueries: number,
  poolSize: number,
  avgQueryTimeMs: number
): {
  estimatedWaitMs: number
  shouldScale: boolean
} {
  const queriesPerConnection = pendingQueries / poolSize
  const estimatedWaitMs = queriesPerConnection * avgQueryTimeMs
  
  return {
    estimatedWaitMs,
    shouldScale: estimatedWaitMs > 5000,
  }
}

/**
 * Get IPv4/IPv6 connection recommendation.
 */
export function getIPVersionRecommendation(
  supportsIPv6: boolean,
  pooler: PoolerType
): { useIPv4: boolean; reason: string } {
  if (pooler === 'direct' && !supportsIPv6) {
    return {
      useIPv4: true,
      reason: 'Direct connections require IPv4 add-on when IPv6 is not available',
    }
  }
  
  if (pooler === 'supavisor') {
    return {
      useIPv4: false,
      reason: 'Supavisor supports both IPv4 and IPv6',
    }
  }
  
  return {
    useIPv4: !supportsIPv6,
    reason: supportsIPv6 ? 'IPv6 available' : 'Falling back to IPv4',
  }
}

/**
 * Migrate connection config between poolers.
 */
export function migrateConnectionConfig(
  config: ConnectionConfig,
  targetPooler: PoolerType,
  targetMode: PoolingMode
): ConnectionConfig {
  const newPort = getPoolerPort(targetPooler, targetMode)
  
  return {
    ...config,
    pooler: targetPooler,
    mode: targetMode,
    port: newPort,
  }
}

/**
 * Get pooler feature matrix.
 */
export function getPoolerFeatures(pooler: PoolerType, mode: PoolingMode): {
  preparedStatements: boolean
  sessionVariables: boolean
  tempTables: boolean
  listen: boolean
  advisory: boolean
} {
  const base = {
    preparedStatements: false,
    sessionVariables: false,
    tempTables: false,
    listen: false,
    advisory: false,
  }
  
  if (pooler === 'direct') {
    return {
      preparedStatements: true,
      sessionVariables: true,
      tempTables: true,
      listen: true,
      advisory: true,
    }
  }
  
  if (pooler === 'supavisor' && mode === 'session') {
    return {
      ...base,
      preparedStatements: true,
      sessionVariables: true,
      tempTables: true,
    }
  }
  
  return base
}
