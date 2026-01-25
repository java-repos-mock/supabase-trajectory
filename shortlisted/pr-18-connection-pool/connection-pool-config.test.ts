/**
 * Tests proving bugs in connection-pool-config.ts that Greptile MISSED
 */

import {
  shouldRecycleConnection,
  getConnectionTimeout,
  getPoolerPort,
} from './connection-pool-config'

describe('PR #18: Bugs Greptile Missed', () => {

  /**
   * BUG 1: shouldRecycleConnection NEVER recycles session connections
   * Even when they exceed maxAge, they're kept alive
   * 
   * This is problematic because stale session connections:
   * - May have lost their server-side state
   * - May be pointing to a failed/restarted database
   * - Consume resources indefinitely
   */
  describe('shouldRecycleConnection - session mode bug', () => {
    it('FAILS: session connections are never recycled even when stale', () => {
      const connectionAge = 7200000  // 2 hours old
      const maxAge = 3600000         // Max age is 1 hour
      
      // This connection is TWICE the max age, should be recycled
      const result = shouldRecycleConnection(connectionAge, 'session', maxAge)
      
      // BUG: Returns false because of `if (mode === 'session') return false`
      // The function ignores connectionAge entirely for session mode
      expect(result).toBe(true)  // FAILS - returns false
    })

    it('transaction mode correctly recycles old connections', () => {
      const connectionAge = 7200000
      const maxAge = 3600000
      
      // Transaction mode works correctly
      const result = shouldRecycleConnection(connectionAge, 'transaction', maxAge)
      expect(result).toBe(true)  // PASSES
    })
  })

  /**
   * BUG 2: getConnectionTimeout returns 0 for session mode
   * 
   * Timeout of 0 means:
   * - Connections never timeout
   * - If client crashes without closing, connection leaks
   * - Server resources held indefinitely
   */
  describe('getConnectionTimeout - session mode returns 0', () => {
    it('DOCUMENTS: session mode has no timeout (potential resource leak)', () => {
      const timeout = getConnectionTimeout('session')
      
      // 0 timeout means connection never times out
      // This is a potential resource leak if clients don't clean up
      expect(timeout).toBe(0)
      
      // Compare with other modes that have reasonable timeouts:
      expect(getConnectionTimeout('transaction')).toBe(60000)  // 60s
      expect(getConnectionTimeout('statement')).toBe(30000)    // 30s
    })
  })

  /**
   * BUG 3: Port 5432 ambiguity (Greptile caught 6543 but missed this)
   * 
   * Both 'direct' and 'supavisor session' use port 5432
   * You cannot determine pooler type from port alone
   */
  describe('Port 5432 ambiguity - identical to 6543 bug', () => {
    it('FAILS: cannot distinguish direct from supavisor session by port', () => {
      const directPort = getPoolerPort('direct', 'session')
      const supavisorSessionPort = getPoolerPort('supavisor', 'session')
      
      // Both return 5432!
      expect(directPort).toBe(5432)
      expect(supavisorSessionPort).toBe(5432)
      
      // This means if you only have a connection string with port 5432,
      // you CANNOT tell if it's direct or supavisor session
      // Greptile caught the 6543 ambiguity but missed this identical issue
      
      // To prove they're ambiguous:
      expect(directPort).not.toBe(supavisorSessionPort)  // FAILS - both are 5432
    })

    it('6543 ambiguity that Greptile DID catch', () => {
      const supavisorTxPort = getPoolerPort('supavisor', 'transaction')
      const pgbouncerPort = getPoolerPort('pgbouncer', 'transaction')
      
      // Both return 6543
      expect(supavisorTxPort).toBe(6543)
      expect(pgbouncerPort).toBe(6543)
      
      // Greptile correctly identified this ambiguity
    })
  })
})

/**
 * VERDICT for PR #18:
 * 
 * Greptile CAUGHT:
 * - Port 6543 ambiguity (supavisor vs pgbouncer)
 * - Pool size logic using port instead of pooler
 * - React hook patterns
 * 
 * Greptile MISSED:
 * - Port 5432 ambiguity (SAME BUG as 6543!)
 * - shouldRecycleConnection always false for session
 * - getConnectionTimeout returns 0 for session (leak risk)
 * 
 * RECOMMENDATION: SHORTLIST - has meaningful bugs Greptile missed
 */
