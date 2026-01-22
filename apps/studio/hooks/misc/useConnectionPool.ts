import { useMemo, useCallback, useState, useEffect } from 'react'
import { useProjectContext } from 'components/layouts/ProjectLayout/ProjectContext'
import {
  PoolingMode,
  PoolerType,
  ConnectionConfig,
  ComputeTier,
  getPoolerPort,
  buildConnectionString,
  parseConnectionString,
  supportsPreparedStatements,
  getRecommendedMode,
  getComputeTier,
  calculateOptimalPoolSize,
  validatePoolConfig,
  estimateConnectionUsage,
  getConnectionHealth,
  getPoolerFeatures,
  migrateConnectionConfig,
} from 'lib/connection-pool-config'

export interface UseConnectionPoolOptions {
  defaultPooler?: PoolerType
  defaultMode?: PoolingMode
}

export interface ConnectionPoolState {
  config: ConnectionConfig | null
  tier: ComputeTier | null
  health: 'healthy' | 'degraded' | 'critical'
  utilization: number
  activeConnections: number
  poolSize: number
}

export interface UseConnectionPoolReturn {
  state: ConnectionPoolState
  
  connectionString: string | null
  features: ReturnType<typeof getPoolerFeatures>
  
  setPooler: (pooler: PoolerType) => void
  setMode: (mode: PoolingMode) => void
  setPoolSize: (size: number) => void
  
  getRecommendation: (useCase: Parameters<typeof getRecommendedMode>[0]) => ReturnType<typeof getRecommendedMode>
  validateConfig: () => ReturnType<typeof validatePoolConfig>
  migrateConfig: (pooler: PoolerType, mode: PoolingMode) => ConnectionConfig | null
  
  isLoading: boolean
  error: Error | null
}

/**
 * Hook for managing database connection pool configuration.
 */
export function useConnectionPool(
  options: UseConnectionPoolOptions = {}
): UseConnectionPoolReturn {
  const { defaultPooler = 'supavisor', defaultMode = 'transaction' } = options
  const { project } = useProjectContext()

  const [config, setConfig] = useState<ConnectionConfig | null>(null)
  const [poolSize, setPoolSizeState] = useState<number>(15)
  const [activeConnections, setActiveConnections] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const tier = useMemo(() => {
    if (!project?.computeSize) return null
    return getComputeTier(project.computeSize)
  }, [project?.computeSize])

  useEffect(() => {
    if (!project?.ref) return

    const loadConfig = async () => {
      setIsLoading(true)
      try {
        const dbConfig = project.connectionConfig as ConnectionConfig | undefined
        
        if (dbConfig) {
          setConfig(dbConfig)
          setPoolSizeState(dbConfig.port === 6543 ? 15 : 20)
        } else {
          setConfig({
            host: `db.${project.ref}.supabase.co`,
            port: getPoolerPort(defaultPooler, defaultMode),
            database: 'postgres',
            user: 'postgres',
            pooler: defaultPooler,
            mode: defaultMode,
            ssl: true,
          })
        }
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [project?.ref, project?.connectionConfig, defaultPooler, defaultMode])

  useEffect(() => {
    if (!project?.ref) return

    const interval = setInterval(() => {
      const mockConnections = Math.floor(Math.random() * poolSize * 0.8)
      setActiveConnections(mockConnections)
    }, 5000)

    return () => clearInterval(interval)
  }, [project?.ref, poolSize])

  const health = useMemo(() => {
    return getConnectionHealth(activeConnections, poolSize, 0)
  }, [activeConnections, poolSize])

  const utilization = useMemo(() => {
    return activeConnections / poolSize
  }, [activeConnections, poolSize])

  const connectionString = useMemo(() => {
    if (!config) return null
    return buildConnectionString(config)
  }, [config])

  const features = useMemo(() => {
    if (!config) {
      return getPoolerFeatures('supavisor', 'transaction')
    }
    return getPoolerFeatures(config.pooler, config.mode)
  }, [config])

  const setPooler = useCallback((pooler: PoolerType) => {
    setConfig((prev) => {
      if (!prev) return prev
      const newPort = getPoolerPort(pooler, prev.mode)
      return { ...prev, pooler, port: newPort }
    })
  }, [])

  const setMode = useCallback((mode: PoolingMode) => {
    setConfig((prev) => {
      if (!prev) return prev
      const newPort = getPoolerPort(prev.pooler, mode)
      return { ...prev, mode, port: newPort }
    })
  }, [])

  const setPoolSize = useCallback((size: number) => {
    setPoolSizeState(size)
  }, [])

  const getRecommendation = useCallback(
    (useCase: Parameters<typeof getRecommendedMode>[0]) => {
      return getRecommendedMode(useCase)
    },
    []
  )

  const validateConfig = useCallback(() => {
    if (!tier) {
      return { valid: false, errors: ['No compute tier available'] }
    }
    return validatePoolConfig({ poolSize, maxClients: tier.maxPoolerClients }, tier)
  }, [tier, poolSize])

  const migrateConfigFn = useCallback(
    (pooler: PoolerType, mode: PoolingMode) => {
      if (!config) return null
      return migrateConnectionConfig(config, pooler, mode)
    },
    [config]
  )

  const state: ConnectionPoolState = {
    config,
    tier,
    health,
    utilization,
    activeConnections,
    poolSize,
  }

  return {
    state,
    connectionString,
    features,
    setPooler,
    setMode,
    setPoolSize,
    getRecommendation,
    validateConfig,
    migrateConfig: migrateConfigFn,
    isLoading,
    error,
  }
}

/**
 * Hook for connection string utilities.
 */
export function useConnectionString(connectionString: string | null): {
  parsed: Partial<ConnectionConfig> | null
  isValid: boolean
  pooler: PoolerType | null
  mode: PoolingMode | null
} {
  const parsed = useMemo(() => {
    if (!connectionString) return null
    return parseConnectionString(connectionString)
  }, [connectionString])

  const isValid = useMemo(() => {
    return parsed !== null && !!parsed.host && !!parsed.database
  }, [parsed])

  const pooler = useMemo((): PoolerType | null => {
    if (!parsed?.port) return null
    if (parsed.port === 5432) return 'direct'
    if (parsed.port === 6543) return 'supavisor'
    return null
  }, [parsed])

  const mode = useMemo((): PoolingMode | null => {
    if (!parsed?.port) return null
    return parsed.port === 6543 ? 'transaction' : 'session'
  }, [parsed])

  return { parsed, isValid, pooler, mode }
}

/**
 * Hook for checking feature support.
 */
export function usePoolerFeatureCheck(
  pooler: PoolerType,
  mode: PoolingMode
): {
  canUsePreparedStatements: boolean
  canUseSessionVariables: boolean
  canUseTempTables: boolean
  canUseListen: boolean
  canUseAdvisoryLocks: boolean
  warnings: string[]
} {
  const features = useMemo(() => {
    return getPoolerFeatures(pooler, mode)
  }, [pooler, mode])

  const warnings = useMemo(() => {
    const warns: string[] = []

    if (!features.preparedStatements) {
      warns.push('Prepared statements are not supported in this mode')
    }

    if (!features.sessionVariables) {
      warns.push('Session variables will not persist between queries')
    }

    if (!features.tempTables) {
      warns.push('Temporary tables are not supported')
    }

    if (!features.listen) {
      warns.push('LISTEN/NOTIFY is not supported')
    }

    return warns
  }, [features])

  return {
    canUsePreparedStatements: features.preparedStatements,
    canUseSessionVariables: features.sessionVariables,
    canUseTempTables: features.tempTables,
    canUseListen: features.listen,
    canUseAdvisoryLocks: features.advisory,
    warnings,
  }
}
